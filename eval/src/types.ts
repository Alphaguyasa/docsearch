/**
 * Core types for the eval harness. Pure type declarations — no imports from the
 * app, no I/O, so any harness module can depend on this without pulling in env
 * validation or a database client.
 *
 * Shapes follow Phase 0 of docs/EVAL_HARNESS.md exactly. Two places where the
 * spec and the live pipeline disagree are marked SPEC CONFLICT below; both are
 * deliberately left as the spec defines them and resolved in a later phase
 * rather than silently "fixed" here.
 *
 * The one import is `import type` and therefore erased at compile time: the
 * judge's own result shapes live next to the judges that produce them, and
 * QuestionResult carries them verbatim. No runtime dependency is created, so
 * the "any module can depend on this" property above still holds.
 */
import type { JudgeScores } from "./metrics/judge";

// --- Golden set --------------------------------------------------------------

export type QuestionType =
  | "factoid"
  | "multihop"
  | "aggregation"
  | "unanswerable"
  | "paraphrase";

export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: string;
  question: string;
  type: QuestionType;
  /** Null for `unanswerable` questions, which assert a refusal instead. */
  expectedAnswer: string | null;
  /**
   * Ground-truth chunk ids. Empty for `unanswerable`.
   *
   * NOTE: chunks.id is `gen_random_uuid()` (schema.sql), so these values do not
   * survive a re-ingest. `relevantDocIds` + `sourcePages` are the stable anchor;
   * chunk ids are resolved against them at run time. See Phase 1.
   */
  relevantChunkIds: string[];
  relevantDocIds: string[];
  sourcePages: number[];
  difficulty: Difficulty;
  notes?: string;
  /** Id of the question this paraphrases, for `paraphrase` items; else null. */
  paraphraseOf: string | null;
  /**
   * For `multihop` items: whether the two passages come from different documents
   * ('cross-doc') or from distant sections of one ('same-doc'). Null otherwise.
   *
   * Recorded because the two are not equally hard. A same-document question can
   * often be answered from one well-chosen chunk, so blending them into a single
   * multihop average would let a good same-doc score mask a poor cross-doc one —
   * exactly the failure multi-hop questions exist to expose. Phase 6 breaks the
   * bucket out on this field.
   *
   * DEVIATION from docs/EVAL_HARNESS.md, which specifies cross-document only.
   * See the composition table there and the README's Limitations section.
   */
  multihopKind?: MultihopKind | null;
  /**
   * REVIEW TRIAGE ONLY — advisory, never a rejection. Set by the generator when
   * a candidate reuses its source chunk's distinctive wording ("lexical") or
   * near-restates another question ("duplicate"). Flagged candidates sort last
   * in the review queue so they can be culled in one pass; a human still decides
   * every one. Not part of the spec's Question shape, hence optional.
   */
  suspect?: SuspectFlag | null;
  /** Why `suspect` was set — the score and what it was measured against. */
  suspectDetail?: string | null;
}

export type SuspectFlag = "lexical" | "duplicate";

/**
 * Which shape of multi-hop question a pair supports.
 *
 * `cross-doc` is the spec's original intent — two papers, one shared subject.
 * `same-doc` bridges two distant sections of ONE paper (a method and its
 * results, say). Defined here rather than in entities.ts so this file keeps its
 * no-imports contract; entities.ts re-exports it.
 */
export type MultihopKind = "cross-doc" | "same-doc";

// --- Variants (experiment arms) ----------------------------------------------

/**
 * SPEC CONFLICT (naming): the spec's `dense` is the app's `vector` mode
 * (src/lib/retrieve.ts `RetrieveMode`). The Phase 4 adapter maps between them;
 * the harness speaks the spec's vocabulary.
 *
 * DEVIATION from docs/EVAL_HARNESS.md, which defines `dense | hybrid` only.
 * `keyword` is added because dense-vs-hybrid on its own cannot say WHY the two
 * tie. Hybrid reorders 77 of 77 result sets and moves no metric; that is
 * consistent with fusing two comparable signals, and equally consistent with
 * fusing a strong vector ranking with a weak lexical one. Those have opposite
 * implications for whether the keyword arm should exist, and only a
 * keyword-only measurement separates them. The app has supported this mode all
 * along (retrieve.ts `RetrieveMode`); only the harness's vocabulary was
 * narrower.
 */
export type RetrievalMode = "dense" | "hybrid" | "keyword";

export type QueryRewrite = "none" | "hyde" | "decompose";

export interface ChunkStrategy {
  /** Target chunk size in tokens. */
  size: number;
  /** Overlap as a fraction of `size` (0.15 = 15%), matching chunk.ts. */
  overlap: number;
  /** Table the chunks live in — varies per arm in chunk-size experiments. */
  tableName: string;
}

export interface RerankConfig {
  model: string;
  topN: number;
}

export interface RetrievalConfig {
  mode: RetrievalMode;
  /** Fused results returned to the generator. */
  topK: number;
  /** Reciprocal Rank Fusion constant. Hybrid only. */
  rrfK?: number;
  /**
   * Per-arm depth fetched before fusion (`SEARCH_TOP` in retrieve.ts). Not in
   * the spec's Variant type, added because experiment 1's top-k sweep varies it
   * independently of `topK` — without it that sweep cannot be expressed.
   */
  searchTop?: number;
  rerank?: RerankConfig | null;
}

export interface GenerationConfig {
  model: string;
  /** Identifies the prompt text used, so a prompt change is a new arm. */
  promptVersion: string;
  maxTokens: number;
}

export interface Variant {
  name: string;
  description: string;
  embeddingModel: string;
  chunkStrategy: ChunkStrategy;
  retrieval: RetrievalConfig;
  queryRewrite: QueryRewrite;
  generation: GenerationConfig;
}

// --- Run output --------------------------------------------------------------

export interface RetrievedChunk {
  chunkId: string;
  docId: string;
  /**
   * SPEC CONFLICT (nullability) — RESOLVED IN PHASE 4, widened to `| null`.
   *
   * The spec types this a plain number; the app's chunks.page_number is
   * nullable (a chunk from a page-less PDF region has no page). The two
   * alternatives were to map null to 0 or -1, both of which put a page number
   * in the field that no page has — and citation accuracy is judged partly on
   * whether a cited page is right, so a fabricated 0 would be scored as a real
   * claim about page 0. Null says "unknown", which is true.
   */
  page: number | null;
  text: string;
  score: number;
  rank: number;
}

export interface Citation {
  chunkId: string;
  docId: string;
  /** Nullable for the same reason as RetrievedChunk.page. */
  page: number | null;
}

export interface Latency {
  embedMs: number;
  searchMs: number;
  rerankMs: number;
  generateMs: number;
  totalMs: number;
}

export interface QuestionResult {
  questionId: string;
  retrieved: RetrievedChunk[];
  answer: string;
  citations: Citation[];
  /**
   * SPEC CONFLICT (nullability) — RESOLVED IN PHASE 4, widened to `| null`.
   *
   * Phase 0 typed this `Record<string, number>`; Phase 2 requires retrieval
   * metrics to return null (not 0) for unanswerable questions so they are
   * excluded from averages rather than dragging them to zero. Phase 2 has
   * landed, so the widening it asked for is applied here. Aggregation skips
   * nulls — see meanIgnoringNull in metrics/retrieval.ts.
   */
  metrics: Record<string, number | null>;
  costUsd: number;
  /** Per-stage cost, so a report can attribute spend. Sums to costUsd. */
  cost?: {
    embed: number;
    rerank: number;
    generate: number;
    judge: number;
    total: number;
  };
  latency: Latency;
  /**
   * True when hybrid retrieval lost one of its two sources and fused only the
   * survivor. NOT an error — the question returned results and scored — which
   * is exactly why it has to be recorded.
   *
   * WHY THIS FIELD EXISTS. retrieve.ts handles a failed vector or keyword
   * search with Promise.allSettled: it logs, sets a `degraded` flag, and
   * continues on whichever source survived. pipeline.ts propagated that flag
   * and the runner dropped it, so a run could contain single-source results
   * with nothing in the JSONL, the database, or the summary to say so. That is
   * not hypothetical: the first top-k sweep had 2 of 77 questions degrade this
   * way in one arm, which moved that arm's recall@1 by 3.3 points and broke the
   * prefix relationship the sweep depends on. The numbers looked completely
   * ordinary. Optional because runs written before this field existed do not
   * have it, and absent must not be read as false.
   */
  degraded?: boolean;
  /**
   * Raw judge output — every claim, verdict, and reason behind the four scores
   * flattened into `metrics`.
   *
   * WHY THIS FIELD EXISTS, and it is the `degraded` story again. The runner
   * called judgeAll, poured the scores into `metrics`, added up the cost, and
   * dropped the object. The scores survived as four numbers; the reasoning that
   * produced them did not.
   *
   * That silently disabled Phase 3. scripts/calibrate-judge.ts reads
   * `result.judge` to recover what the MODEL said, so it can be compared
   * against what a human says — and `result.judge` was never written. Its
   * `if (!question || !judge) continue` skipped every result, so calibration
   * would have shown 25 questions to label and reported kappa over zero pairs.
   * There is no kappa without this field, and no Phase 3 without a kappa.
   *
   * Phase 8's per-question drill-down ("each judge's verdict and reasoning")
   * has the same dependency.
   *
   * JSONL ONLY for now: eval_results has no judge column, and disk is the
   * documented source of truth for a single run. Adding the column is Phase 8's
   * job, when something reads it from the database.
   *
   * Optional because runs written before this existed do not have it — and,
   * exactly as with `degraded`, absent must not be read as "not judged".
   */
  judge?: JudgeScores | null;
  /** Set when the question failed; the runner records and continues. */
  error: string | null;
}

export interface Run {
  runId: string;
  gitSha: string;
  variant: Variant;
  startedAt: string;
  finishedAt: string;
  results: QuestionResult[];
  aggregate: Record<string, number>;
}
