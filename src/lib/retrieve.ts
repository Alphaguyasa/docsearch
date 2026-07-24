/**
 * SERVER-ONLY. Hybrid retrieval: vector search + keyword search fused with
 * Reciprocal Rank Fusion. Reads the database and the Voyage API through the
 * validated config. Never import this module into a client component.
 */
import { db } from "./db";
import { embedQuery } from "./embed";

export type RetrieveMode = "hybrid" | "vector" | "keyword";

export interface RetrieveOptions {
  /** Number of fused results to return. */
  limit?: number;
  mode?: RetrieveMode;
}

export interface RetrievedChunk {
  id: string;
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

  // Embedding happens inside the vector branch so an embed failure degrades the
  // same way a vector-search failure does.
  const runVector = async (): Promise<SearchHit[]> =>
    vectorSearch(await embedQuery(query));
  const runKeyword = (): Promise<SearchHit[]> => keywordSearch(query);

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

  const fused = fuse(vector, keyword).slice(0, limit);
  const meta = await fetchDocumentMeta(fused.map((f) => f.documentId));

  const results: RetrievedChunk[] = fused.map((f) => ({
    id: f.id,
    content: f.content,
    title: meta.get(f.documentId)?.title ?? "(unknown)",
    filename: meta.get(f.documentId)?.filename ?? "(unknown)",
    pageNumber: f.pageNumber,
    vectorScore: f.vectorScore,
    keywordScore: f.keywordScore,
    fusedScore: f.fusedScore,
  }));

  return { results, degraded, mode };
}

async function vectorSearch(embedding: number[]): Promise<SearchHit[]> {
  const { data, error } = await db.rpc("match_chunks", {
    // pgvector needs the "[0.1,0.2,...]" text form; a JS array is not bound
    // as a vector correctly. Verified against the live function.
    query_embedding: JSON.stringify(embedding),
    match_count: SEARCH_TOP,
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

async function keywordSearch(query: string): Promise<SearchHit[]> {
  const { data, error } = await db.rpc("keyword_chunks", {
    query_text: query,
    match_count: SEARCH_TOP,
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
      entry.fusedScore += 1 / (RRF_K + hit.rank);
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
