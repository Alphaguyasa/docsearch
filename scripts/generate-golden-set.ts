/**
 * Golden set candidate generation — Phase 1 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:golden -- [--per-doc 3] [--seed 42] [--provider gemini] [--no-cache]
 *
 * Samples chunks stratified across documents, then asks an LLM to draft
 * candidate questions of each type. Output is CANDIDATES, not a golden set:
 * every row must go through scripts/review-golden-set.ts before it counts.
 * Generated questions are frequently trivially lexical, and those inflate every
 * metric while teaching you nothing — expect to drop 30–40%.
 *
 * Every generation call is cached by SHA-256 of (provider, model, prompt,
 * options), so re-running to fix a downstream format costs nothing.
 *
 * NOTE ON TYPES: the spec's Phase 1 prompt describes factoid, multi-hop, and
 * unanswerable generation, but its composition table — which
 * scripts/validate-golden-set.ts enforces — also requires aggregation and
 * paraphrase questions. Both are generated here so the distribution check is
 * satisfiable.
 */
import "../src/lib/loadenv"; // must precede modules that read env

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cacheStats, setCacheEnabled } from "../eval/src/cache";
import {
  AGGREGATION_MAX_DOCS,
  AGGREGATION_MIN_DOCS,
  buildAggregationQuestions,
  buildEntityIndex,
  crossDocumentPairs,
  DEFAULT_MAX_DOC_FRACTION,
  DEFAULT_MIN_CHUNK_DISTANCE,
  loadCorpus,
  mulberry32,
  sameDocumentPairs,
  sampleStratified,
  selectMultihopPairs,
  shuffle,
  type CorpusChunk,
  type EntityPair,
  type MultihopKind,
} from "../eval/src/corpus";
import { DEV_FILE, HOLDOUT_FILE, parseJsonl } from "../eval/src/goldenset";
import {
  completeCached,
  dailyRequestCount,
  getProvider,
  LLM_RPM,
  pacerState,
  parseJsonObject,
  QuotaExhaustedError,
} from "../eval/src/provider";
import {
  buildIdf,
  triageCandidates,
  type TriageResult,
} from "../eval/src/triage";
import type { Difficulty, Question, QuestionType } from "../eval/src/types";

/**
 * Accumulates as generation proceeds so a quota wall mid-run keeps everything
 * drafted so far. Combined with the disk cache and the seeded sampler, re-running
 * tomorrow replays today's successful calls for free and continues where this
 * stopped — which is the only way a 20-request/day tier can build a 100-question
 * set at all.
 */
const drafted: Question[] = [];

function flush(): void {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, drafted.map((q) => JSON.stringify(q)).join("\n") + "\n");
}

const OUT_FILE = "eval/golden/questions.candidate.jsonl";
/** Dev, not the combined set — new questions never enter the holdout. */
const ACCEPTED_FILE = DEV_FILE;

/**
 * Target mix from the composition table in docs/EVAL_HARNESS.md, as a fraction
 * of the total. Unanswerable is 20% and is not negotiable — it is the highest
 * signal bucket in the set, because it is the only one that measures whether the
 * system refuses or hallucinates.
 *
 * Multi-hop is 8%, down from the original 20%, and factoid 47% up from 35%.
 * Retargeted from measurement: see the identical table in
 * scripts/validate-golden-set.ts and the deviation note in the spec.
 */
const TARGET_MIX: Record<QuestionType, number> = {
  factoid: 47,
  multihop: 8,
  aggregation: 10,
  unanswerable: 20,
  paraphrase: 15,
};

/**
 * Triage thresholds. Advisory only — these change the review ORDER and add a
 * warning label, never the outcome. Both are tunable per run.
 *
 * The lexical default is calibrated against real generations rather than picked
 * round: see eval/src/triage.ts for what the score measures.
 */
const DEFAULT_LEXICAL_THRESHOLD = 0.5;
const DEFAULT_DUPLICATE_THRESHOLD = 0.9;

/**
 * Share of the multihop bucket drafted from CROSS-document pairs; the rest come
 * from same-document pairs. 0.4 of 20 is the 8/12 split the composition table
 * in docs/EVAL_HARNESS.md now records, and it scales with --target.
 *
 * Weighted toward same-document deliberately: cross-document is the more
 * demanding question and the one the spec wanted, but this corpus supplies very
 * few of them, and a bucket padded with pairs the model called not-two-hop would
 * be worse than a smaller honest one.
 */
const CROSS_DOC_SHARE = 0.4;

interface Args {
  perDoc: number;
  seed: number;
  provider: string | undefined;
  useCache: boolean;
  target: number;
  lexicalThreshold: number;
  duplicateThreshold: number;
  /** Max cross-document pairs to try before giving up on the multihop target. */
  multihopAttempts: number | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    perDoc: 3,
    seed: 42,
    provider: undefined,
    useCache: true,
    target: 100,
    lexicalThreshold: DEFAULT_LEXICAL_THRESHOLD,
    duplicateThreshold: DEFAULT_DUPLICATE_THRESHOLD,
    multihopAttempts: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--per-doc") args.perDoc = requireNumber(argv[++i], "--per-doc");
    else if (flag === "--seed") args.seed = requireNumber(argv[++i], "--seed");
    else if (flag === "--target") args.target = requireNumber(argv[++i], "--target");
    else if (flag === "--provider") args.provider = requireValue(argv[++i], "--provider");
    else if (flag === "--no-cache") args.useCache = false;
    else if (flag === "--lexical-threshold")
      args.lexicalThreshold = requireNumber(argv[++i], "--lexical-threshold");
    else if (flag === "--duplicate-threshold")
      args.duplicateThreshold = requireNumber(argv[++i], "--duplicate-threshold");
    else if (flag === "--multihop-attempts")
      args.multihopAttempts = requireNumber(argv[++i], "--multihop-attempts");
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function requireNumber(value: string | undefined, flag: string): number {
  const n = Number(requireValue(value, flag));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} must be a positive number`);
  return n;
}

// --- Prompts -----------------------------------------------------------------

const SYSTEM = [
  "You write evaluation questions for a document retrieval system.",
  "",
  "Return ONLY raw JSON matching the requested shape. No markdown fences, no",
  "commentary, no explanation before or after the JSON.",
  "",
  "Write questions the way a real user would ask them. Critically: do NOT reuse",
  "distinctive wording from the passage. If the passage says \"annual leave\n",
  "entitlement\", ask about \"paid time off\". A question that shares rare words",
  "with its source passage tests string matching, not retrieval, and makes the",
  "whole evaluation worthless.",
].join("\n");

function chunkBlock(chunk: CorpusChunk): string {
  const page = chunk.pageNumber === null ? "" : `, page ${chunk.pageNumber}`;
  return `[Document: ${chunk.title}${page}]\n${chunk.content}`;
}

interface DraftedQuestion {
  question: string;
  expectedAnswer: string;
  difficulty?: string;
}

function coerceDifficulty(value: unknown): Difficulty {
  return value === "easy" || value === "medium" || value === "hard" ? value : "medium";
}

// --- Generators, one per question type ---------------------------------------

async function draftFactoid(
  provider: ReturnType<typeof getProvider>,
  chunk: CorpusChunk,
): Promise<DraftedQuestion | null> {
  const prompt = [
    "Below is one passage from a document collection.",
    "",
    chunkBlock(chunk),
    "",
    "Write ONE question that can be answered using ONLY this passage, plus its",
    "answer. The answer must be stated in the passage — do not infer it.",
    "Use different vocabulary from the passage wherever you can.",
    "",
    'Return JSON: {"question": string, "expectedAnswer": string, "difficulty": "easy"|"medium"|"hard"}',
  ].join("\n");

  const res = await completeCached(provider, prompt, { system: SYSTEM, json: true });
  try {
    return parseJsonObject<DraftedQuestion>(res.text);
  } catch {
    return null;
  }
}

async function draftMultihop(
  provider: ReturnType<typeof getProvider>,
  a: CorpusChunk,
  b: CorpusChunk,
  entity: string,
): Promise<DraftedQuestion | null> {
  const prompt = [
    `Below are two passages from DIFFERENT documents. Both mention "${entity}".`,
    "",
    `PASSAGE A:\n${chunkBlock(a)}`,
    "",
    `PASSAGE B:\n${chunkBlock(b)}`,
    "",
    "Write ONE question that genuinely requires BOTH passages to answer — a",
    "question answerable from either passage alone is useless here. If no such",
    'question honestly exists, return {"question": null}.',
    "",
    'Return JSON: {"question": string|null, "expectedAnswer": string, "difficulty": "easy"|"medium"|"hard"}',
  ].join("\n");

  const res = await completeCached(provider, prompt, { system: SYSTEM, json: true });
  try {
    const parsed = parseJsonObject<DraftedQuestion & { question: string | null }>(res.text);
    return parsed.question ? (parsed as DraftedQuestion) : null;
  } catch {
    return null;
  }
}

// NOTE: there is no draftAggregation. Aggregation questions are built from the
// document-frequency index in eval/src/entities.ts, not drafted — the count or
// list IS the ground truth, so a model has nothing to contribute and 4 of 10 of
// its attempts came back null. See buildAggregationQuestions.

/**
 * Two flavours, per the spec: `absent` is plausible-but-missing (topic fits the
 * corpus, the fact isn't there), `near-miss` perturbs a specific number, date,
 * or name so a careless system confidently substitutes the real value. The
 * near-miss flavour is the one that actually catches hallucination.
 */
async function draftUnanswerable(
  provider: ReturnType<typeof getProvider>,
  chunk: CorpusChunk,
  flavour: "absent" | "near-miss",
): Promise<DraftedQuestion | null> {
  const instruction =
    flavour === "absent"
      ? [
          "Write ONE question on the SAME TOPIC as this passage whose answer is",
          "deliberately NOT present in it — a reader would expect the document to",
          "cover it, but it does not. The question must sound entirely reasonable.",
        ].join("\n")
      : [
          "Find a specific number, date, or name in this passage and write ONE",
          "question that presupposes a DIFFERENT value for it. A careless system",
          "will confidently answer with the real value from the passage; a correct",
          "system will refuse. Do not signal the trap in the wording.",
        ].join("\n");

  const prompt = [
    "Below is one passage from a document collection.",
    "",
    chunkBlock(chunk),
    "",
    instruction,
    "",
    'Return JSON: {"question": string, "difficulty": "easy"|"medium"|"hard"}',
  ].join("\n");

  const res = await completeCached(provider, prompt, { system: SYSTEM, json: true });
  try {
    const parsed = parseJsonObject<{ question: string; difficulty?: string }>(res.text);
    return parsed.question
      ? { question: parsed.question, expectedAnswer: "", difficulty: parsed.difficulty }
      : null;
  } catch {
    return null;
  }
}

async function draftParaphrase(
  provider: ReturnType<typeof getProvider>,
  original: string,
): Promise<string | null> {
  const prompt = [
    "Rewrite the question below so it asks for exactly the same information",
    "using entirely different wording. Change the vocabulary and the sentence",
    "structure; keep the meaning identical. This measures whether the embedding",
    "is robust to phrasing, so surface similarity defeats the purpose.",
    "",
    `QUESTION: ${original}`,
    "",
    'Return JSON: {"question": string}',
  ].join("\n");

  const res = await completeCached(provider, prompt, { system: SYSTEM, json: true });
  try {
    const parsed = parseJsonObject<{ question: string }>(res.text);
    return parsed.question ?? null;
  } catch {
    return null;
  }
}

// --- Assembly ----------------------------------------------------------------

let nextId = 1;
function makeId(): string {
  return `q-${String(nextId++).padStart(4, "0")}`;
}

function baseQuestion(
  type: QuestionType,
  question: string,
  expectedAnswer: string | null,
  chunks: CorpusChunk[],
  difficulty: Difficulty,
  notes: string,
  paraphraseOf: string | null = null,
): Question {
  return {
    id: makeId(),
    question: question.trim(),
    type,
    expectedAnswer,
    relevantChunkIds: chunks.map((c) => c.id),
    relevantDocIds: [...new Set(chunks.map((c) => c.documentId))],
    sourcePages: [
      ...new Set(
        chunks
          .map((c) => c.pageNumber)
          .filter((p): p is number => p !== null),
      ),
    ].sort((a, b) => a - b),
    difficulty,
    notes,
    paraphraseOf,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  setCacheEnabled(args.useCache);

  const provider = getProvider(args.provider);
  const rand = mulberry32(args.seed);

  const corpus = await loadCorpus();
  if (corpus.length === 0) {
    throw new Error("Corpus is empty — ingest documents before generating a golden set.");
  }
  const docCount = new Set(corpus.map((c) => c.documentId)).size;
  const sampled = sampleStratified(corpus, args.perDoc, rand);

  const alreadyToday = dailyRequestCount(provider.name, provider.model);

  console.log(
    `\nCorpus: ${corpus.length} chunks across ${docCount} document(s).\n` +
      `Sampled ${sampled.length} chunk(s) at --per-doc ${args.perDoc}, seed ${args.seed}.\n` +
      `Provider: ${provider.name} (${provider.model}), cache ${args.useCache ? "on" : "bypassed"}.\n` +
      `Pacing: ${LLM_RPM} req/min (~${(pacerState().spacingMs / 1000).toFixed(1)}s apart)` +
      `, ${alreadyToday} live request(s) already made today.\n`,
  );

  const want = (type: QuestionType): number =>
    Math.max(1, Math.round((TARGET_MIX[type] / 100) * args.target));

  // --- Factoid -------------------------------------------------------------
  const factoidTargets = shuffle(sampled, rand).slice(0, want("factoid"));
  console.log(`Factoid: drafting ${factoidTargets.length}...`);
  for (const chunk of factoidTargets) {
    const item = await draftFactoid(provider, chunk);
    if (!item?.question) continue;
    drafted.push(
      baseQuestion(
        "factoid",
        item.question,
        item.expectedAnswer ?? null,
        [chunk],
        coerceDifficulty(item.difficulty),
        `generated from ${chunk.filename} chunk ${chunk.chunkIndex}`,
      ),
    );
    process.stdout.write(".");
  }
  console.log("");

  // --- Multi-hop -----------------------------------------------------------
  // NOT shuffled: pairs arrive ranked by how specific their shared entity is,
  // and shuffling would discard exactly that ranking — which is what previously
  // fed the model 20 pairs sharing "However" or "Proceedings", all of which it
  // correctly refused. Selection is deterministic, so the seed still reproduces.
  const entityIndex = buildEntityIndex(corpus);
  const multihopTarget = want("multihop");

  // Split the bucket. Cross-document is what the spec asks for and what most
  // exercises multi-chunk assembly, but on 90 unrelated papers it yields a
  // question only ~5% of the time — see sameDocumentPairs. Same-document pairs
  // fill the rest honestly rather than padding the bucket with cross-document
  // pairs the model already judged not genuinely two-hop.
  const crossTarget = Math.round(multihopTarget * CROSS_DOC_SHARE);
  const sameTarget = multihopTarget - crossTarget;

  const crossRanked = crossDocumentPairs(sampled, entityIndex);
  const sameRanked = sameDocumentPairs(sampled, entityIndex);

  console.log(
    `Multi-hop: want ${multihopTarget} (${crossTarget} cross-doc + ${sameTarget} same-doc)\n` +
      `  pools: ${crossRanked.length} cross-document pair(s) ` +
      `(entity in <= ${Math.floor(DEFAULT_MAX_DOC_FRACTION * entityIndex.documentCount)} ` +
      `of ${entityIndex.documentCount} docs), ` +
      `${sameRanked.length} same-document pair(s) ` +
      `(>= ${DEFAULT_MIN_CHUNK_DISTANCE} chunks apart)`,
  );

  const multihopYield: Record<MultihopKind, { made: number; attempted: number }> = {
    "cross-doc": { made: 0, attempted: 0 },
    "same-doc": { made: 0, attempted: 0 },
  };

  async function draftMultihopBucket(
    ranked: EntityPair[],
    target: number,
    kind: MultihopKind,
  ): Promise<void> {
    if (target <= 0) return;

    // Attempt MORE pairs than the target. A pair sharing a specific entity is
    // only a CANDIDATE; the model still has to find a fact in each passage that
    // the other completes, and it honestly often cannot. Drafting exactly
    // `target` pairs can never fill the bucket, however good the ranking.
    const cap = Math.min(ranked.length, args.multihopAttempts ?? target * 3);
    const pairs = selectMultihopPairs(ranked, cap);
    const stats = multihopYield[kind];

    process.stdout.write(`  ${kind}: `);
    for (const { a, b, entity } of pairs) {
      if (stats.made >= target) break;
      stats.attempted++;

      const item = await draftMultihop(provider, a, b, entity);
      if (!item?.question) {
        process.stdout.write("x");
        continue;
      }
      drafted.push({
        ...baseQuestion(
          "multihop",
          item.question,
          item.expectedAnswer ?? null,
          [a, b],
          coerceDifficulty(item.difficulty ?? "hard"),
          kind === "cross-doc"
            ? `spans ${a.filename} + ${b.filename}; shared entity "${entity}"`
            : `spans chunks ${a.chunkIndex} and ${b.chunkIndex} of ${a.filename}; ` +
              `shared entity "${entity}"`,
        ),
        multihopKind: kind,
      });
      stats.made++;
      process.stdout.write(".");
    }
    // Distinguish the two ways of falling short — they have opposite fixes, and
    // conflating them sends you to the wrong flag. Running out of DIVERSE pairs
    // (one per entity, one per document pair) means widen the sample; hitting
    // the attempt cap with thousands of pairs left means raise the cap.
    const requestedCap = args.multihopAttempts ?? target * 3;
    let shortfall = "";
    if (stats.made < target) {
      shortfall =
        pairs.length < requestedCap
          ? ` — only ${pairs.length} diverse pair(s) available from ${ranked.length} ranked; raise --per-doc`
          : ` — hit the ${requestedCap}-attempt cap with ${ranked.length} pair(s) ranked; raise --multihop-attempts`;
    }
    console.log(` ${stats.made}/${target} from ${stats.attempted} attempt(s)${shortfall}`);
  }

  await draftMultihopBucket(crossRanked, crossTarget, "cross-doc");
  await draftMultihopBucket(sameRanked, sameTarget, "same-doc");

  // --- Aggregation (deterministic — no LLM calls) --------------------------
  // Built from the document-frequency index rather than drafted. The count or
  // list IS the ground truth, so there is nothing for a model to get wrong and
  // no reason to spend quota asking. Previously 4 of 10 came back null.
  const aggregationTarget = want("aggregation");
  const aggregations = buildAggregationQuestions(corpus, entityIndex, aggregationTarget);
  console.log(
    `Aggregation: built ${aggregations.length}/${aggregationTarget} deterministically ` +
      `(entities in ${AGGREGATION_MIN_DOCS}-${AGGREGATION_MAX_DOCS} documents, no LLM calls)...`,
  );

  for (const item of aggregations) {
    drafted.push({
      id: makeId(),
      question: item.question,
      type: "aggregation",
      expectedAnswer: item.expectedAnswer,
      relevantChunkIds: item.chunkIds,
      relevantDocIds: item.docIds,
      sourcePages: item.pages,
      // Aggregation questions need EVERY chunk mentioning the entity, so recall
      // is bounded by top-k in a way single-chunk questions never are. That is
      // the point of the bucket — it exposes the recall ceiling.
      difficulty: "hard",
      notes:
        `deterministic ${item.form}; "${item.entity}" in ${item.documentFrequency} ` +
        `document(s), ${item.chunkIds.length} chunk(s)`,
      paraphraseOf: null,
      multihopKind: null,
    });
    process.stdout.write(".");
  }
  if (aggregations.length > 0) {
    const counts = aggregations.filter((a) => a.form === "count").length;
    console.log(
      `\n  ${counts} count / ${aggregations.length - counts} list; ` +
        `mean ${(
          aggregations.reduce((s, a) => s + a.chunkIds.length, 0) / aggregations.length
        ).toFixed(1)} relevant chunks per question`,
    );
  } else {
    console.log("");
  }

  // --- Unanswerable (half plausible-absent, half near-miss) ----------------
  const unanswerableTargets = shuffle(sampled, rand).slice(0, want("unanswerable"));
  console.log(`Unanswerable: drafting ${unanswerableTargets.length}...`);
  for (const [i, chunk] of unanswerableTargets.entries()) {
    const flavour = i % 2 === 0 ? "absent" : "near-miss";
    const item = await draftUnanswerable(provider, chunk, flavour);
    if (!item?.question) continue;
    // relevantChunkIds is empty and expectedAnswer null: there is no correct
    // passage and no correct answer, only a correct refusal.
    drafted.push({
      id: makeId(),
      question: item.question.trim(),
      type: "unanswerable",
      expectedAnswer: null,
      relevantChunkIds: [],
      relevantDocIds: [],
      sourcePages: [],
      difficulty: coerceDifficulty(item.difficulty ?? "hard"),
      notes: `${flavour}; drafted against ${chunk.filename}`,
      paraphraseOf: null,
    });
    process.stdout.write(".");
  }
  console.log("");

  // --- Paraphrase (derived from the factoids above) ------------------------
  const factoids = drafted.filter((q) => q.type === "factoid");
  const paraphraseTargets = shuffle(factoids, rand).slice(0, want("paraphrase"));
  console.log(`Paraphrase: drafting ${paraphraseTargets.length}...`);
  for (const source of paraphraseTargets) {
    const reworded = await draftParaphrase(provider, source.question);
    if (!reworded) continue;
    drafted.push({
      ...source,
      id: makeId(),
      question: reworded.trim(),
      type: "paraphrase",
      notes: `paraphrase of ${source.id}`,
      paraphraseOf: source.id,
    });
    process.stdout.write(".");
  }
  console.log("");

  // --- Review triage --------------------------------------------------------
  // Flag only — nothing is rejected here. Flagged candidates sort last so they
  // can be culled in one pass, but each still goes in front of a human.
  console.log("Triage: scoring lexical overlap and near-duplicates...");
  const idf = buildIdf(corpus.map((c) => c.content));
  const chunkById = new Map(corpus.map((c) => [c.id, c]));

  // Both halves: a new candidate that restates a HOLDOUT question is just as
  // much a duplicate as one restating a dev question, and letting it through
  // would quietly put a near-copy of a holdout item into the tuning set.
  const accepted = [ACCEPTED_FILE, HOLDOUT_FILE]
    .filter((f) => existsSync(f))
    .flatMap((f) => parseJsonl<Question>(f).rows)
    .map((q) => ({ id: q.id, question: q.question }));

  const triage = triageCandidates(
    drafted.map((q) => ({
      id: q.id,
      question: q.question,
      sourceText: q.relevantChunkIds
        .map((id) => chunkById.get(id)?.content ?? "")
        .join("\n"),
    })),
    idf,
    corpus.length,
    {
      lexicalThreshold: args.lexicalThreshold,
      duplicateThreshold: args.duplicateThreshold,
      accepted,
    },
  );

  const byId = new Map(triage.map((t) => [t.id, t]));
  for (const question of drafted) {
    const result = byId.get(question.id);
    question.suspect = result?.flag ?? null;
    question.suspectDetail = result?.detail ?? null;
  }

  // Clean first, flagged last — the review queue order.
  drafted.sort((a, b) => (a.suspect ? 1 : 0) - (b.suspect ? 1 : 0));

  report(triage, accepted.length, args);
}

/**
 * `triage` is empty when a quota wall cut the run short — the partial draft is
 * still written and summarised, just without the triage section, since flagging
 * an incomplete batch would mislead more than it helps.
 */
function report(
  triage: TriageResult[] = [],
  acceptedCount = 0,
  args?: Args,
): void {
  flush();

  const counts = drafted.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});
  const { hits, misses } = cacheStats();

  console.log("\n── Candidates written ──────────────────────────────────");
  const target = args?.target ?? 100;
  for (const type of Object.keys(TARGET_MIX) as QuestionType[]) {
    const have = counts[type] ?? 0;
    const wanted = Math.max(1, Math.round((TARGET_MIX[type] / 100) * target));
    const pct = wanted === 0 ? 100 : (have / wanted) * 100;
    console.log(
      `  ${type.padEnd(13)} ${String(have).padStart(3)} / ${String(wanted).padStart(3)}  ` +
        `${pct.toFixed(0).padStart(3)}% yield`,
    );

    // The multihop split is the whole reason multihopKind exists — reporting the
    // bucket as one number would hide which half actually filled.
    if (type === "multihop" && have > 0) {
      const cross = drafted.filter((q) => q.multihopKind === "cross-doc").length;
      console.log(
        `    ${String(cross).padStart(3)} cross-doc, ` +
          `${String(have - cross).padStart(3)} same-doc`,
      );
    }
  }
  console.log(`  ${"TOTAL".padEnd(13)} ${String(drafted.length).padStart(3)} / ${target}`);
  console.log(`\n  cache: ${hits} hit(s), ${misses} miss(es)`);

  // Requests, not cache misses: a 429 that was retried still spent quota, so the
  // daily figure is the only one that predicts when the next run hits the wall.
  //
  // Resolving the provider must not throw here: report() runs on the quota-wall
  // path, and a failure while printing the summary would swallow the very
  // message explaining why the run stopped.
  const pace = pacerState();
  try {
    const provider = getProvider(args?.provider);
    console.log(
      `  live requests: ${pace.requests} this run, ` +
        `${dailyRequestCount(provider.name, provider.model)} today ` +
        `(${provider.model})`,
    );
  } catch {
    console.log(`  live requests: ${pace.requests} this run`);
  }
  if (pace.waitedMs > 0) {
    console.log(`  paced waiting: ${(pace.waitedMs / 1000).toFixed(0)}s at ${LLM_RPM} req/min`);
  }

  // --- Flag distribution ----------------------------------------------------
  if (triage.length === 0 || !args) {
    console.log(`\nWrote ${OUT_FILE} (partial — triage skipped)\n`);
    return;
  }

  const lexical = triage.filter((t) => t.flag === "lexical").length;
  const duplicate = triage.filter((t) => t.flag === "duplicate").length;
  const clean = triage.length - lexical - duplicate;

  console.log("\n── Review triage (advisory — nothing rejected) ─────────");
  console.log(`  clean          ${String(clean).padStart(3)}  reviewed first`);
  console.log(
    `  lexical        ${String(lexical).padStart(3)}  ` +
      `overlap >= ${args.lexicalThreshold} with source chunk`,
  );
  console.log(
    `  duplicate      ${String(duplicate).padStart(3)}  ` +
      `cosine >= ${args.duplicateThreshold} vs an earlier question` +
      (acceptedCount > 0 ? ` (incl. ${acceptedCount} already accepted)` : ""),
  );

  if (triage.length > 0) {
    const overlaps = triage
      .filter((t) => t.lexicalOverlap > 0)
      .map((t) => t.lexicalOverlap)
      .sort((a, b) => a - b);
    if (overlaps.length > 0) {
      const at = (q: number): string =>
        overlaps[Math.min(overlaps.length - 1, Math.floor(q * overlaps.length))].toFixed(2);
      console.log(
        `\n  lexical overlap distribution — ` +
          `p10 ${at(0.1)}  p50 ${at(0.5)}  p90 ${at(0.9)}  max ${overlaps[overlaps.length - 1].toFixed(2)}`,
      );
      console.log(
        `  (tune with --lexical-threshold; the flagged tail is where questions\n` +
          `   reuse the passage's rare words and inflate retrieval scores)`,
      );
    }
  }

  console.log(`\nWrote ${OUT_FILE}`);
  console.log(
    "\nThese are CANDIDATES. Review them before they count:\n" +
      "  npm run eval:review\n",
  );
}

main().catch((err) => {
  // A daily quota wall is not a crash — keep the partial draft and explain how
  // to continue, since on a capped tier the set is built across several days.
  if (err instanceof QuotaExhaustedError) {
    console.log("");
    report();
    console.error(`\n⚠ ${err.message}`);
    console.error(
      "\nWhat you can do:\n" +
        "  • Re-run tomorrow — cached calls replay free and generation resumes\n" +
        "    from where it stopped (sampling is seeded, so ids stay stable).\n" +
        "  • Point at a model with headroom:  EVAL_GEMINI_MODEL=<model> npm run eval:golden\n" +
        "  • Use a billed key, or --provider anthropic with a valid ANTHROPIC_API_KEY.\n",
    );
    process.exitCode = 2;
    return;
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
