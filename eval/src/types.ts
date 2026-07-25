/**
 * Core types for the eval harness. Pure type declarations — no imports from the
 * app, no I/O, so any harness module can depend on this without pulling in env
 * validation or a database client.
 *
 * Shapes follow Phase 0 of docs/EVAL_HARNESS.md exactly. Two places where the
 * spec and the live pipeline disagree are marked SPEC CONFLICT below; both are
 * deliberately left as the spec defines them and resolved in a later phase
 * rather than silently "fixed" here.
 */

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
}

// --- Variants (experiment arms) ----------------------------------------------

/**
 * SPEC CONFLICT (naming): the spec's `dense` is the app's `vector` mode
 * (src/lib/retrieve.ts `RetrieveMode`). The Phase 4 adapter maps between them;
 * the harness speaks the spec's vocabulary.
 */
export type RetrievalMode = "dense" | "hybrid";

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
   * SPEC CONFLICT (nullability): the app's chunks.page_number is nullable, but
   * the spec types this as a plain number. Kept as spec'd; the Phase 4 adapter
   * decides how to represent a page-less chunk.
   */
  page: number;
  text: string;
  score: number;
  rank: number;
}

export interface Citation {
  chunkId: string;
  docId: string;
  page: number;
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
   * SPEC CONFLICT (nullability): Phase 0 types this `Record<string, number>`,
   * but Phase 2 requires retrieval metrics to return `null` (not 0) for
   * unanswerable questions so they are excluded from averages. Left as Phase 0
   * specifies; widen to `number | null` when Phase 2 lands.
   */
  metrics: Record<string, number>;
  costUsd: number;
  latency: Latency;
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
