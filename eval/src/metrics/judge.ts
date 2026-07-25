/**
 * LLM-as-judge: faithfulness, answer correctness, citation accuracy, refusal.
 *
 * An unvalidated LLM judge is a random number generator with good manners.
 * scripts/calibrate-judge.ts is what makes these numbers mean anything — run it
 * before quoting any figure produced here.
 *
 * DESIGN NOTES
 *
 * Scores are DERIVED from the structured labels, never read from a model-emitted
 * `score` field. Models routinely return a score that contradicts their own
 * claim list; recomputing makes the number a function of the labels a human can
 * audit during calibration.
 *
 * Every call goes through the Phase 4 disk cache (already implemented, in
 * eval/src/cache.ts) so re-running a variant that only changed retrieval costs
 * no judge quota. The retry attempt is part of the cache key — otherwise a
 * cached unparseable response would replay forever and the retry could never
 * succeed.
 *
 * No judge ever throws. A question that fails every retry comes back as
 * `{ ok: false, error }` so one bad row cannot kill a run.
 */
import { cached } from "../cache";
import {
  completeCached,
  getProvider,
  parseJsonObject,
  QuotaExhaustedError,
  type LLMProvider,
} from "../provider";
import type { Question, RetrievedChunk } from "../types";

/**
 * Verified against the current model catalogue: `claude-haiku-4-5-20251001` is
 * the dated full id for Claude Haiku 4.5 (alias `claude-haiku-4-5`), 200K
 * context, active. Held as a constant per docs/EVAL_HARNESS.md whichever
 * provider actually runs.
 */
export const JUDGE_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/** Deterministic judging — a judge that varies run to run cannot be calibrated. */
const JUDGE_TEMPERATURE = 0;
const MAX_ATTEMPTS = 3;

/**
 * Pick the judging provider.
 *
 * SELF-PREFERENCE WARNING: models rate their own family's output more
 * favourably. Generation currently runs on Gemini, so judging on Gemini
 * forfeits the cross-family separation docs/EVAL_HARNESS.md calls a
 * methodological upside. Set EVAL_JUDGE_PROVIDER=anthropic (with a working key)
 * to restore it. Whichever you choose, say so in the writeup — it is a
 * limitation either way.
 */
export function getJudgeProvider(name?: string): LLMProvider {
  return getProvider(name ?? process.env.EVAL_JUDGE_PROVIDER ?? undefined);
}

// --- Result shapes -----------------------------------------------------------

export type ClaimLabel = "supported" | "unsupported" | "contradicted";

export interface Claim {
  claim: string;
  label: ClaimLabel;
  evidenceChunkId: string | null;
}

export interface FaithfulnessResult {
  claims: Claim[];
  score: number;
}

export type CorrectnessVerdict = "correct" | "partial" | "incorrect";

export interface CorrectnessResult {
  verdict: CorrectnessVerdict;
  reasoning: string;
  score: number;
}

export interface CitationJudgement {
  chunkId: string;
  valid: boolean;
  reason: string;
}

export interface CitationResult {
  citations: CitationJudgement[];
  score: number;
}

export interface RefusalResult {
  refused: boolean;
  score: number;
}

/** Never throws — a failed judge is a recorded error, not a dead run. */
export type JudgeOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface JudgeScores {
  faithfulness: JudgeOutcome<FaithfulnessResult> | null;
  correctness: JudgeOutcome<CorrectnessResult> | null;
  citationAccuracy: JudgeOutcome<CitationResult> | null;
  refusal: JudgeOutcome<RefusalResult> | null;
}

// --- Citation extraction (pure) ----------------------------------------------

export interface ExtractedCitation {
  /** The 1-based marker as written in the answer, e.g. 3 for `[3]`. */
  marker: number;
  /** Resolved chunk id, or null when the marker points outside the context. */
  chunkId: string | null;
  /** The sentence the marker is attached to — what the citation must support. */
  sentence: string;
}

/**
 * Pull `[n]` citation markers out of an answer and pair each with its sentence.
 *
 * The app numbers context passages `[1]..[n]` in prompt order (src/lib/answer.ts),
 * so a marker resolves by index. A marker outside that range is a DANGLING
 * citation — the model invented a source. That is caught here without spending
 * a judge call, because no LLM is needed to know that `[9]` is wrong when only
 * eight passages were supplied.
 */
export function extractCitations(
  answer: string,
  retrieved: RetrievedChunk[],
): ExtractedCitation[] {
  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: ExtractedCitation[] = [];
  for (const sentence of sentences) {
    for (const match of sentence.matchAll(/\[(\d+)\]/g)) {
      const marker = Number(match[1]);
      const chunk = retrieved[marker - 1];
      out.push({
        marker,
        chunkId: chunk?.chunkId ?? null,
        sentence: sentence.replace(/\s*\[\d+\]/g, "").trim(),
      });
    }
  }
  return out;
}

// --- Score derivation (pure) -------------------------------------------------

/** supported / total. An answer with no claims is vacuously faithful (1). */
export function faithfulnessScore(claims: Claim[]): number {
  if (claims.length === 0) return 1;
  return claims.filter((c) => c.label === "supported").length / claims.length;
}

export function correctnessScore(verdict: CorrectnessVerdict): number {
  return verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0;
}

/** valid / total. An answer citing nothing scores 1 — see the judge below. */
export function citationScore(citations: CitationJudgement[]): number {
  if (citations.length === 0) return 1;
  return citations.filter((c) => c.valid).length / citations.length;
}

// --- Prompting ---------------------------------------------------------------

const JSON_RULES = [
  "Return ONLY raw JSON in exactly the requested shape.",
  "No markdown fences, no commentary before or after.",
].join(" ");

function contextBlock(retrieved: RetrievedChunk[]): string {
  return retrieved
    .map((c, i) => `[${i + 1}] (chunkId: ${c.chunkId}, page ${c.page})\n${c.text}`)
    .join("\n\n");
}

/**
 * Run a judge call with retries.
 *
 * Retries on a JSON parse failure and on transport errors. The attempt number is
 * part of the cache key so a retry is a genuinely different request rather than
 * a replay of the same unparseable response.
 *
 * A daily quota wall propagates: it is not a per-question failure, and burning
 * the rest of the run's questions against an exhausted quota would produce a
 * page of misleading "error" rows.
 */
async function judgeCall<T>(
  provider: LLMProvider,
  namespace: string,
  prompt: string,
  system: string,
  parse: (raw: string) => T,
): Promise<JudgeOutcome<T>> {
  let lastError = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await cached(
        namespace,
        {
          provider: provider.name,
          model: provider.model,
          temperature: JUDGE_TEMPERATURE,
          system,
          prompt,
          attempt,
        },
        () => provider.complete(prompt, { system, json: true, maxTokens: 2048 }),
      );
      return { ok: true, value: parse(res.text) };
    } catch (err) {
      if (err instanceof QuotaExhaustedError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }

  return { ok: false, error: `after ${MAX_ATTEMPTS} attempts: ${lastError}` };
}

// --- Judge 1: faithfulness ---------------------------------------------------

const FAITHFULNESS_SYSTEM = [
  "You verify whether an answer is grounded in the context it was given.",
  JSON_RULES,
].join(" ");

/**
 * Decompose the answer into atomic claims and label each against the context
 * ALONE. The decomposition is spelled out in detail because calibration
 * consistently shows this is where the judge drifts: a judge that bundles three
 * facts into one "claim" cannot mark two of them unsupported.
 */
export async function judgeFaithfulness(
  provider: LLMProvider,
  answer: string,
  retrieved: RetrievedChunk[],
): Promise<JudgeOutcome<FaithfulnessResult>> {
  const prompt = [
    "CONTEXT PASSAGES:",
    "",
    contextBlock(retrieved),
    "",
    "ANSWER TO VERIFY:",
    answer,
    "",
    "Step 1 — decompose the answer into ATOMIC factual claims.",
    "  An atomic claim states exactly ONE fact and can be judged true or false",
    "  on its own. Split every conjunction, list, and multi-part sentence.",
    '  "Leave is 25 days and carries over" is TWO claims, not one.',
    "  Ignore pure hedging, restatements of the question, and citation markers.",
    "",
    "Step 2 — label each claim using the CONTEXT PASSAGES ONLY:",
    '  "supported"    — the passages state or directly entail it',
    '  "unsupported"  — the passages are silent on it (this includes claims you',
    "                   personally know to be true; your own knowledge is",
    "                   irrelevant here)",
    '  "contradicted" — the passages state something incompatible with it',
    "",
    "Set evidenceChunkId to the chunkId of the passage that supports the claim,",
    "or null when the label is not \"supported\".",
    "",
    'Return JSON: {"claims": [{"claim": string, "label": "supported"|"unsupported"|"contradicted", "evidenceChunkId": string|null}]}',
  ].join("\n");

  return judgeCall(provider, "judge-faithfulness", prompt, FAITHFULNESS_SYSTEM, (raw) => {
    const parsed = parseJsonObject<{ claims?: unknown }>(raw);
    const claims = normaliseClaims(parsed.claims);
    return { claims, score: faithfulnessScore(claims) };
  });
}

const VALID_LABELS = new Set<ClaimLabel>(["supported", "unsupported", "contradicted"]);

function normaliseClaims(value: unknown): Claim[] {
  if (!Array.isArray(value)) throw new Error("`claims` was not an array");
  return value.map((entry, i) => {
    const row = entry as Partial<Claim>;
    if (typeof row?.claim !== "string" || !row.claim.trim()) {
      throw new Error(`claim ${i} has no text`);
    }
    if (!VALID_LABELS.has(row.label as ClaimLabel)) {
      throw new Error(`claim ${i} has invalid label ${JSON.stringify(row.label)}`);
    }
    return {
      claim: row.claim.trim(),
      label: row.label as ClaimLabel,
      evidenceChunkId: typeof row.evidenceChunkId === "string" ? row.evidenceChunkId : null,
    };
  });
}

// --- Judge 2: answer correctness ---------------------------------------------

const CORRECTNESS_SYSTEM = [
  "You compare an answer against a reference answer for semantic equivalence.",
  JSON_RULES,
].join(" ");

export async function judgeCorrectness(
  provider: LLMProvider,
  question: string,
  answer: string,
  expectedAnswer: string,
): Promise<JudgeOutcome<CorrectnessResult>> {
  const prompt = [
    `QUESTION: ${question}`,
    "",
    `REFERENCE ANSWER: ${expectedAnswer}`,
    "",
    `ANSWER TO GRADE: ${answer}`,
    "",
    "Judge MEANING, not wording. Different phrasing, ordering, extra context, or",
    "a different unit that converts to the same value are all still correct.",
    "Do not penalise an answer for being longer or shorter than the reference.",
    "",
    "  correct   — conveys everything the reference does, with nothing wrong",
    "  partial   — some of it right, but incomplete or partly wrong",
    "  incorrect — contradicts the reference, or misses its substance entirely",
    "",
    'Return JSON: {"verdict": "correct"|"partial"|"incorrect", "reasoning": string}',
  ].join("\n");

  return judgeCall(provider, "judge-correctness", prompt, CORRECTNESS_SYSTEM, (raw) => {
    const parsed = parseJsonObject<{ verdict?: string; reasoning?: string }>(raw);
    const verdict = parsed.verdict as CorrectnessVerdict;
    if (verdict !== "correct" && verdict !== "partial" && verdict !== "incorrect") {
      throw new Error(`invalid verdict ${JSON.stringify(parsed.verdict)}`);
    }
    return {
      verdict,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      score: correctnessScore(verdict),
    };
  });
}

// --- Judge 3: citation accuracy ----------------------------------------------

const CITATION_SYSTEM = [
  "You check whether each citation in an answer points at a passage that",
  "actually supports the sentence it is attached to.",
  JSON_RULES,
].join(" ");

/**
 * Catches the failure where retrieval is fine, the answer is fine, and the page
 * numbers are wrong — which destroys user trust faster than a wrong answer,
 * because it looks authoritative right up until someone checks.
 *
 * Dangling markers (pointing past the supplied context) are resolved locally and
 * marked invalid without an LLM call. An answer with no citations at all scores
 * 1: there is nothing miscited. Whether the answer SHOULD have cited is
 * faithfulness's job, and double-counting it here would hide which stage failed.
 */
export async function judgeCitationAccuracy(
  provider: LLMProvider,
  answer: string,
  retrieved: RetrievedChunk[],
): Promise<JudgeOutcome<CitationResult>> {
  const extracted = extractCitations(answer, retrieved);
  if (extracted.length === 0) {
    return { ok: true, value: { citations: [], score: 1 } };
  }

  const dangling: CitationJudgement[] = extracted
    .filter((c) => c.chunkId === null)
    .map((c) => ({
      chunkId: `(marker [${c.marker}] — no such passage)`,
      valid: false,
      reason: `Answer cited [${c.marker}] but only ${retrieved.length} passage(s) were supplied.`,
    }));

  const resolvable = extracted.filter(
    (c): c is ExtractedCitation & { chunkId: string } => c.chunkId !== null,
  );
  if (resolvable.length === 0) {
    return { ok: true, value: { citations: dangling, score: citationScore(dangling) } };
  }

  const prompt = [
    "CONTEXT PASSAGES:",
    "",
    contextBlock(retrieved),
    "",
    "CITATIONS TO CHECK — each is a sentence from the answer plus the passage it cited:",
    "",
    resolvable
      .map(
        (c, i) =>
          `${i + 1}. chunkId: ${c.chunkId}\n   sentence: ${c.sentence}`,
      )
      .join("\n\n"),
    "",
    "For each, decide whether that specific passage actually supports that",
    "specific sentence. A passage on the right topic that does not state the",
    "sentence's claim is NOT valid support. Judge only the pairing you are given.",
    "",
    "Return one entry per citation, in the same order.",
    'Return JSON: {"citations": [{"chunkId": string, "valid": boolean, "reason": string}]}',
  ].join("\n");

  return judgeCall(provider, "judge-citation", prompt, CITATION_SYSTEM, (raw) => {
    const parsed = parseJsonObject<{ citations?: unknown }>(raw);
    if (!Array.isArray(parsed.citations)) throw new Error("`citations` was not an array");
    if (parsed.citations.length !== resolvable.length) {
      throw new Error(
        `expected ${resolvable.length} citation judgement(s), got ${parsed.citations.length}`,
      );
    }
    const judged: CitationJudgement[] = parsed.citations.map((entry, i) => {
      const row = entry as Partial<CitationJudgement>;
      if (typeof row?.valid !== "boolean") {
        throw new Error(`citation ${i} has no boolean "valid"`);
      }
      return {
        chunkId: resolvable[i].chunkId,
        valid: row.valid,
        reason: typeof row.reason === "string" ? row.reason : "",
      };
    });

    const citations = [...judged, ...dangling];
    return { citations, score: citationScore(citations) };
  });
}

// --- Judge 4: refusal correctness --------------------------------------------

const REFUSAL_SYSTEM = [
  "You decide whether an answer declined to answer or asserted a substantive one.",
  JSON_RULES,
].join(" ");

/**
 * Only meaningful for `unanswerable` questions, where the correct behaviour is a
 * refusal and any confident answer is a hallucination.
 */
export async function judgeRefusal(
  provider: LLMProvider,
  question: string,
  answer: string,
): Promise<JudgeOutcome<RefusalResult>> {
  const prompt = [
    `QUESTION: ${question}`,
    "",
    `ANSWER: ${answer}`,
    "",
    "Did the answer DECLINE — say the information is not in the documents, or",
    "otherwise refuse to answer — or did it ASSERT a substantive answer?",
    "",
    "An answer that states a fact and then adds a caveat has still asserted.",
    "An answer that says the documents do not cover this has declined, whatever",
    "wording it uses.",
    "",
    'Return JSON: {"refused": boolean, "reason": string}',
  ].join("\n");

  return judgeCall(provider, "judge-refusal", prompt, REFUSAL_SYSTEM, (raw) => {
    const parsed = parseJsonObject<{ refused?: unknown }>(raw);
    if (typeof parsed.refused !== "boolean") {
      throw new Error(`"refused" was not a boolean: ${JSON.stringify(parsed.refused)}`);
    }
    return { refused: parsed.refused, score: parsed.refused ? 1 : 0 };
  });
}

// --- Orchestration -----------------------------------------------------------

/**
 * Run every judge that applies to this question.
 *
 * Unanswerable questions get refusal only: there is no reference answer to grade
 * against, and scoring faithfulness on a refusal would reward saying nothing.
 * Answerable questions get the other three. Correctness is skipped when the
 * golden set has no `expectedAnswer` to compare with.
 */
export async function judgeAll(
  question: Question,
  answer: string,
  retrieved: RetrievedChunk[],
  provider: LLMProvider = getJudgeProvider(),
): Promise<JudgeScores> {
  const scores: JudgeScores = {
    faithfulness: null,
    correctness: null,
    citationAccuracy: null,
    refusal: null,
  };

  if (question.type === "unanswerable") {
    scores.refusal = await judgeRefusal(provider, question.question, answer);
    return scores;
  }

  scores.faithfulness = await judgeFaithfulness(provider, answer, retrieved);
  scores.citationAccuracy = await judgeCitationAccuracy(provider, answer, retrieved);
  if (question.expectedAnswer) {
    scores.correctness = await judgeCorrectness(
      provider,
      question.question,
      answer,
      question.expectedAnswer,
    );
  }
  return scores;
}

/** Flatten judge outcomes into the metrics record, nulling out failures. */
export function judgeScoresToMetrics(scores: JudgeScores): Record<string, number | null> {
  const value = <T extends { score: number }>(
    outcome: JudgeOutcome<T> | null,
  ): number | null => (outcome && outcome.ok ? outcome.value.score : null);

  return {
    faithfulness: value(scores.faithfulness),
    correctness: value(scores.correctness),
    citationAccuracy: value(scores.citationAccuracy),
    refusalAccuracy: value(scores.refusal),
  };
}

// --- Agreement statistics (pure) ---------------------------------------------

export interface Agreement {
  n: number;
  rawAgreement: number;
  kappa: number;
  /** True when kappa is below the 0.6 bar docs/EVAL_HARNESS.md sets. */
  weak: boolean;
}

/**
 * Cohen's kappa between two sets of categorical labels.
 *
 * kappa = (po - pe) / (1 - pe), where po is observed agreement and pe is the
 * agreement expected from the two raters' marginal distributions alone.
 *
 * Raw agreement flatters a judge on a skewed set: if 90% of answers are faithful,
 * a judge that always says "faithful" scores 90% and has learned nothing. Kappa
 * subtracts that baseline, which is exactly why the spec asks for it.
 */
export function cohensKappa(a: string[], b: string[]): Agreement {
  if (a.length !== b.length) {
    throw new Error(`label arrays differ in length: ${a.length} vs ${b.length}`);
  }
  const n = a.length;
  if (n === 0) return { n: 0, rawAgreement: 0, kappa: 0, weak: true };

  const observed = a.filter((label, i) => label === b[i]).length / n;

  const countsA = new Map<string, number>();
  const countsB = new Map<string, number>();
  for (const label of a) countsA.set(label, (countsA.get(label) ?? 0) + 1);
  for (const label of b) countsB.set(label, (countsB.get(label) ?? 0) + 1);

  let expected = 0;
  for (const [label, count] of countsA) {
    expected += (count / n) * ((countsB.get(label) ?? 0) / n);
  }

  // Perfect agreement on a single category: chance agreement is also 1, so kappa
  // is 0/0. Report 1 — the raters agreed on everything — rather than NaN.
  const kappa = expected === 1 ? (observed === 1 ? 1 : 0) : (observed - expected) / (1 - expected);
  return { n, rawAgreement: observed, kappa, weak: kappa < 0.6 };
}

// Re-exported so callers can build a provider without importing provider.ts.
export { completeCached };
