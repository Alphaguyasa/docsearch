/**
 * SERVER-ONLY. Hybrid retrieval: vector search + keyword search fused with
 * Reciprocal Rank Fusion. Reads the database and the Voyage API through the
 * validated config. Never import this module into a client component.
 */
import { db } from "./db";
import { embedQueryDetailed, type EmbedUsage } from "./embed";

export type RetrieveMode = "hybrid" | "vector" | "keyword";

export interface RetrieveOptions {
  /** Number of fused results to return. */
  limit?: number;
  mode?: RetrieveMode;
  /**
   * Per-source depth fetched before fusion. Defaults to SEARCH_TOP.
   *
   * Exposed for the eval harness (eval/src/pipeline.ts), which sweeps it
   * independently of `limit` — experiment 1 in docs/EVAL_HARNESS.md varies
   * retrieval depth and returned-k separately, and cannot be expressed if this
   * stays a module constant. The app passes nothing and behaves exactly as
   * before.
   */
  searchTop?: number;
  /**
   * Reciprocal Rank Fusion constant. Defaults to RRF_K. Hybrid mode only.
   *
   * Same reason: the harness sweeps it. Production never sets it.
   */
  rrfK?: number;
  /**
   * Override the query embedder. Defaults to embedQueryDetailed.
   *
   * The eval harness injects a disk-cached wrapper so a re-run does not re-embed
   * the same questions against a 3-request/minute free tier. Production passes
   * nothing and calls Voyage directly — there is no cache in the request path.
   */
  embedder?: (text: string) => Promise<{ embedding: number[]; usage: EmbedUsage }>;
}

export interface RetrievedChunk {
  id: string;
  /**
   * Owning document's id. Surfaced because document-level recall is scored
   * against it (eval/src/metrics/retrieval.ts docLevelRecallAtK) and the golden
   * set stores document UUIDs — matching on `filename` instead silently scores
   * every document-level metric as zero.
   */
  documentId: string;
  content: string;
  title: string; // document title
  filename: string;
  pageNumber: number | null;
  /** Cosine similarity (0..1) if the chunk was found by vector search, else null. */
  vectorScore: number | null;
  /** ts_rank if the chunk was found by keyword search, else null. */
  keywordScore: number | null;
  /** Reciprocal Rank Fusion score over the searches that ran. */
  fusedScore: number;
}

export interface RetrieveResult {
  results: RetrievedChunk[];
  /**
   * True when a requested search failed and the answer came from a partial
   * (single-source) retrieval. Only possible in hybrid mode.
   */
  degraded: boolean;
  mode: RetrieveMode;
  /**
   * Tokens Voyage billed for embedding the query, or null when no embedding
   * ran (keyword mode, or the vector branch failed).
   *
   * Reported so the eval harness can cost the embed stage WITHOUT embedding the
   * query a second time. It previously did exactly that, which doubled calls
   * against a 3-request/minute free tier — the slowest limit in the project —
   * and doubled the stage it was trying to measure. The app ignores this field.
   */
  embedTokens: number | null;
  /**
   * Milliseconds spent embedding the query, or null when none ran.
   *
   * Reported for the same reason as `embedTokens`: embedding happens INSIDE
   * this function, so a caller timing `retrieve()` as one span attributes the
   * embed wait to search. On a rate-limited tier that is most of the latency,
   * and a breakdown that hides it points at the wrong stage.
   */
  embedMs: number | null;
}

const DEFAULT_LIMIT = 8;
const SEARCH_TOP = 20; // per-source depth before fusion
const RRF_K = 60;

// Rows as returned by the Postgres search functions in schema.sql.
interface MatchRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  similarity: number;
}
interface KeywordRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  rank: number;
}
interface DocMetaRow {
  id: string;
  title: string;
  filename: string;
}

// A hit from one search, with its 1-based rank in that search's result list.
interface SearchHit {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  score: number;
  rank: number;
}

export async function retrieve(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrieveResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const mode = opts.mode ?? "hybrid";
  const searchTop = opts.searchTop ?? SEARCH_TOP;
  const rrfK = opts.rrfK ?? RRF_K;

  // Embedding happens inside the vector branch so an embed failure degrades the
  // same way a vector-search failure does.
  let embedTokens: number | null = null;
  let embedMs: number | null = null;
  const embedder = opts.embedder ?? embedQueryDetailed;
  const runVector = async (): Promise<SearchHit[]> => {
    const started = performance.now();
    const { embedding, usage } = await embedder(query);
    embedMs = performance.now() - started;
    embedTokens = usage.totalTokens;
    return vectorSearch(embedding, searchTop);
  };
  const runKeyword = (): Promise<SearchHit[]> => keywordSearch(query, searchTop);

  let vector: SearchHit[] | null = null;
  let keyword: SearchHit[] | null = null;
  let degraded = false;

  if (mode === "vector") {
    // Single mode: fail loudly rather than silently fall back to a worse mode.
    vector = await runVector();
  } else if (mode === "keyword") {
    keyword = await runKeyword();
  } else {
    const [v, k] = await Promise.allSettled([runVector(), runKeyword()]);
    if (v.status === "fulfilled") vector = v.value;
    else {
      console.error(`[retrieve] vector search failed: ${errorMessage(v.reason)}`);
      degraded = true;
    }
    if (k.status === "fulfilled") keyword = k.value;
    else {
      console.error(`[retrieve] keyword search failed: ${errorMessage(k.reason)}`);
      degraded = true;
    }
    if (!vector && !keyword) {
      throw new Error("Retrieval failed: both vector and keyword search errored.");
    }
  }

  const fused = fuse(vector, keyword, rrfK).slice(0, limit);
  const meta = await fetchDocumentMeta(fused.map((f) => f.documentId));

  const results: RetrievedChunk[] = fused.map((f) => ({
    id: f.id,
    documentId: f.documentId,
    content: f.content,
    title: meta.get(f.documentId)?.title ?? "(unknown)",
    filename: meta.get(f.documentId)?.filename ?? "(unknown)",
    pageNumber: f.pageNumber,
    vectorScore: f.vectorScore,
    keywordScore: f.keywordScore,
    fusedScore: f.fusedScore,
  }));

  return { results, degraded, mode, embedTokens, embedMs };
}

async function vectorSearch(
  embedding: number[],
  searchTop: number,
): Promise<SearchHit[]> {
  const { data, error } = await db.rpc("match_chunks", {
    // pgvector needs the "[0.1,0.2,...]" text form; a JS array is not bound
    // as a vector correctly. Verified against the live function.
    query_embedding: JSON.stringify(embedding),
    match_count: searchTop,
  });
  if (error) throw new Error(error.message);
  // The client is untyped (no generated DB types), so assert the row shape.
  const rows = (data ?? []) as MatchRow[];
  return rows.map((r, i) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    pageNumber: r.page_number,
    score: r.similarity,
    rank: i + 1,
  }));
}

// keyword_chunks runs websearch_to_tsquery, which ANDs every word — so a full
// natural-language question matches nothing (no single chunk contains all its
// words). Joining the words with OR lets partial matches survive; ts_rank still
// ranks a chunk that hits more terms highest. "OR" is websearch's OR operator.
function toOrQuery(query: string): string {
  return query.trim().split(/\s+/).filter(Boolean).join(" OR ");
}

async function keywordSearch(
  query: string,
  searchTop: number,
): Promise<SearchHit[]> {
  const { data, error } = await db.rpc("keyword_chunks", {
    query_text: toOrQuery(query),
    match_count: searchTop,
  });
  if (error) throw new Error(error.message);
  // The client is untyped (no generated DB types), so assert the row shape.
  const rows = (data ?? []) as KeywordRow[];
  return rows.map((r, i) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    pageNumber: r.page_number,
    score: r.rank,
    rank: i + 1,
  }));
}

interface FusedChunk {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  vectorScore: number | null;
  keywordScore: number | null;
  fusedScore: number;
}

/**
 * Reciprocal Rank Fusion: a chunk's fused score is the sum of 1/(k + rank) over
 * every search that returned it. Chunks found by both searches rise to the top.
 */
function fuse(
  vector: SearchHit[] | null,
  keyword: SearchHit[] | null,
  rrfK: number,
): FusedChunk[] {
  const byId = new Map<string, FusedChunk>();

  const merge = (
    hits: SearchHit[] | null,
    field: "vectorScore" | "keywordScore",
  ): void => {
    if (!hits) return;
    for (const hit of hits) {
      let entry = byId.get(hit.id);
      if (!entry) {
        entry = {
          id: hit.id,
          documentId: hit.documentId,
          content: hit.content,
          pageNumber: hit.pageNumber,
          vectorScore: null,
          keywordScore: null,
          fusedScore: 0,
        };
        byId.set(hit.id, entry);
      }
      entry[field] = hit.score;
      entry.fusedScore += 1 / (rrfK + hit.rank);
    }
  };

  merge(vector, "vectorScore");
  merge(keyword, "keywordScore");

  return [...byId.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

async function fetchDocumentMeta(
  documentIds: string[],
): Promise<Map<string, DocMetaRow>> {
  const ids = [...new Set(documentIds)];
  const meta = new Map<string, DocMetaRow>();
  if (ids.length === 0) return meta;

  const { data, error } = await db
    .from("documents")
    .select("id,title,filename")
    .in("id", ids)
    .returns<DocMetaRow[]>();
  if (error) throw new Error(`document metadata lookup failed: ${error.message}`);
  for (const row of data ?? []) meta.set(row.id, row);
  return meta;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
