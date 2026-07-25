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
  crossDocumentPairs,
  loadCorpus,
  mulberry32,
  sampleStratified,
  shuffle,
  type CorpusChunk,
} from "../eval/src/corpus";
import {
  completeCached,
  getProvider,
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
const ACCEPTED_FILE = "eval/golden/questions.jsonl";

/**
 * Target mix from the composition table in docs/EVAL_HARNESS.md, as a fraction
 * of the total. Unanswerable is 20% and is not negotiable — it is the highest
 * signal bucket in the set, because it is the only one that measures whether the
 * system refuses or hallucinates.
 */
const TARGET_MIX: Record<QuestionType, number> = {
  factoid: 35,
  multihop: 20,
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

interface Args {
  perDoc: number;
  seed: number;
  provider: string | undefined;
  useCache: boolean;
  target: number;
  lexicalThreshold: number;
  duplicateThreshold: number;
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

async function draftAggregation(
  provider: ReturnType<typeof getProvider>,
  chunks: CorpusChunk[],
): Promise<DraftedQuestion | null> {
  const prompt = [
    `Below are ${chunks.length} passages from the SAME document.`,
    "",
    chunks.map((c, i) => `PASSAGE ${i + 1}:\n${chunkBlock(c)}`).join("\n\n"),
    "",
    'Write ONE aggregation question — "how many...", "list all...", "which of',
    '... are..." — that requires gathering facts spread across these passages.',
    'If no honest aggregation question exists, return {"question": null}.',
    'Return a single JSON object, not an array.',
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

  console.log(
    `\nCorpus: ${corpus.length} chunks across ${docCount} document(s).\n` +
      `Sampled ${sampled.length} chunk(s) at --per-doc ${args.perDoc}, seed ${args.seed}.\n` +
      `Provider: ${provider.name} (${provider.model}), cache ${args.useCache ? "on" : "bypassed"}.\n`,
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
  const pairs = shuffle(crossDocumentPairs(sampled), rand).slice(0, want("multihop"));
  console.log(`Multi-hop: ${pairs.length} cross-document pair(s) share an entity...`);
  for (const { a, b, entity } of pairs) {
    const item = await draftMultihop(provider, a, b, entity);
    if (!item?.question) continue;
    drafted.push(
      baseQuestion(
        "multihop",
        item.question,
        item.expectedAnswer ?? null,
        [a, b],
        coerceDifficulty(item.difficulty ?? "hard"),
        `spans ${a.filename} + ${b.filename}; shared entity "${entity}"`,
      ),
    );
    process.stdout.write(".");
  }
  console.log("");

  // --- Aggregation ---------------------------------------------------------
  const byDoc = new Map<string, CorpusChunk[]>();
  for (const chunk of corpus) {
    const list = byDoc.get(chunk.documentId);
    if (list) list.push(chunk);
    else byDoc.set(chunk.documentId, [chunk]);
  }
  const aggregationGroups = shuffle([...byDoc.values()], rand)
    .filter((chunks) => chunks.length >= 2)
    .slice(0, want("aggregation"))
    .map((chunks) => shuffle(chunks, rand).slice(0, 3));
  console.log(`Aggregation: drafting ${aggregationGroups.length}...`);
  for (const group of aggregationGroups) {
    const item = await draftAggregation(provider, group);
    if (!item?.question) continue;
    drafted.push(
      baseQuestion(
        "aggregation",
        item.question,
        item.expectedAnswer ?? null,
        group,
        coerceDifficulty(item.difficulty ?? "hard"),
        `aggregates ${group.length} chunks of ${group[0].filename}`,
      ),
    );
    process.stdout.write(".");
  }
  console.log("");

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

  const accepted = existsSync(ACCEPTED_FILE)
    ? readFileSync(ACCEPTED_FILE, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as Question)
        .map((q) => ({ id: q.id, question: q.question }))
    : [];

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
  for (const type of Object.keys(TARGET_MIX) as QuestionType[]) {
    console.log(`  ${type.padEnd(13)} ${String(counts[type] ?? 0).padStart(3)}`);
  }
  console.log(`  ${"TOTAL".padEnd(13)} ${String(drafted.length).padStart(3)}`);
  console.log(`\n  cache: ${hits} hit(s), ${misses} miss(es)`);

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
