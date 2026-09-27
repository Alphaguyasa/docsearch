/**
 * SERVER-ONLY. Hybrid retrieval: vector search + keyword search fused with
 * Reciprocal Rank Fusion. Reads the database and the Voyage API through the
 * validated config. Never import this module into a client component.
 */
import { db } from "./db";
import { embedQueryDetailed, type EmbedUsage } from "./embed";
import { isTransient } from "./transient";

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
  /**
   * Restrict retrieval to one communion. A work marked "both" is always
   * included — see the SQL, which does the same. Omit for the whole corpus.
   */
  traditions?: string[];
  /** Restrict to kinds of book: scripture, ascetic, council, and so on. */
  categories?: string[];
  /** Restrict to named works, by catalog slug. */
  workIds?: string[];
  /**
   * Cap how many chunks any one work may contribute.
   *
   * WHY THIS IS NEEDED: unfiltered retrieval over this corpus is dominated by
   * whichever work happens to say the query's words most often. Ask about
   * despondency and all eight passages come back from Cassian, who wrote a
   * whole book on it — a true answer, but it presents one Father's account as
   * though it were the only one, and it is exactly the wrong result for a
   * question of the form "what does each tradition say".
   *
   * Applied after fusion, so ranking is unaffected: it takes the best `n` from
   * each work in fused-score order, then re-sorts. Omit for no cap.
   */
  maxPerWork?: number;
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
  /**
   * The citation a reader can look up — "Genesis 1:1-14", "NPNF2-13 —
   * Demonstration VII". Null for documents ingested before the corpus carried
   * structure (the research PDFs), which still cite by page.
   */
  reference: string | null;
  /** Biblical book, for scripture chunks only. */
  book: string | null;
  /** Catalog slug of the work, or null for anything not from the catalog. */
  workId: string | null;
  author: string | null;
  /**
   * Which communion this passage speaks for. Carried onto every chunk because
   * the answer must be able to say so: quoting a Chalcedonian council at
   * someone asking an Oriental Orthodox question, without noting which is
   * which, is a misrepresentation and not a formatting detail.
   */
  tradition: string | null;
  lineages: string[] | null;
  category: string | null;
  century: number | null;
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
  reference: string | null;
  similarity: number;
}
interface KeywordRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  reference: string | null;
  rank: number;
}
interface DocMetaRow {
  id: string;
  title: string;
  filename: string;
  work_id: string | null;
  author: string | null;
  tradition: string | null;
  lineages: string[] | null;
  category: string | null;
  century: number | null;
}

// A hit from one search, with its 1-based rank in that search's result list.
interface SearchHit {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  reference: string | null;
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

  // Null means "no filter" on the SQL side, so undefined options must become
  // null rather than being omitted — supabase-js sends a missing named argument
  // as SQL DEFAULT, which is the same thing here, but being explicit keeps the
  // three filters symmetrical and the RPC call readable.
  const filters: SearchFilters = {
    filter_traditions: opts.traditions ?? null,
    filter_categories: opts.categories ?? null,
    filter_work_ids: opts.workIds ?? null,
  };

  // A per-work cap can only discard results, so the searches have to look
  // deeper to still fill `limit` afterwards. Without this, capping at 2 per work
  // turns a top-20 fetch into maybe 6 usable chunks.
  const depth = opts.maxPerWork ? searchTop * 3 : searchTop;

  const runVector = async (): Promise<SearchHit[]> => {
    const started = performance.now();
    const { embedding, usage } = await embedder(query);
    embedMs = performance.now() - started;
    embedTokens = usage.totalTokens;
    return vectorSearch(embedding, depth, filters);
  };
  const runKeyword = (): Promise<SearchHit[]> => keywordSearch(query, depth, filters);

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

  const ranked = fuse(vector, keyword, rrfK);
  const fused = (opts.maxPerWork ? capPerDocument(ranked, opts.maxPerWork) : ranked).slice(0, limit);
  const meta = await fetchDocumentMeta(fused.map((f) => f.documentId));

  const results: RetrievedChunk[] = fused.map((f) => {
    const doc = meta.get(f.documentId);
    return {
      id: f.id,
      documentId: f.documentId,
      content: f.content,
      title: doc?.title ?? "(unknown)",
      filename: doc?.filename ?? "(unknown)",
      pageNumber: f.pageNumber,
      reference: f.reference,
      // `book` lives on the chunk row but is not returned by the search
      // functions: nothing ranks or filters on it, and widening two RPC return
      // types to carry a field only the UI reads is not worth the migration.
      // The reference string already names the book.
      book: null,
      workId: doc?.work_id ?? null,
      author: doc?.author ?? null,
      tradition: doc?.tradition ?? null,
      lineages: doc?.lineages ?? null,
      category: doc?.category ?? null,
      century: doc?.century ?? null,
      vectorScore: f.vectorScore,
      keywordScore: f.keywordScore,
      fusedScore: f.fusedScore,
    };
  });

  return { results, degraded, mode, embedTokens, embedMs };
}

const SEARCH_RETRIES = 2;
const SEARCH_BACKOFF_MS = 500;

/**
 * Run one RPC, retrying only transient failures, and return its rows.
 *
 * SUPABASE REPORTS FAILURE TWO WAYS and this has to handle both: a Postgres or
 * gateway error comes back as `{ error }` with no exception, while a dropped
 * connection throws from fetch. Retrying only thrown errors would have missed
 * the exact failure this was written for — `JWT issued at future` arrives in
 * `error`, not as a throw.
 *
 * Backoff is short on purpose: this sits in the live request path behind a
 * user's query, not in a batch job. Two retries at 500ms and 1s add at most 1.5s
 * to a request that would otherwise have failed outright, and the failure this
 * exists for cleared well inside that.
 */
interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

async function rpcWithRetry<T>(
  label: string,
  call: () => Promise<RpcResult>,
): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    let message: string;
    try {
      const { data, error } = await call();
      if (!error) return (data ?? []) as T[];
      message = error.message;
    } catch (err) {
      // A throw here is a transport failure; supabase-js does not throw for
      // query errors. Keep the same transient/permanent test either way.
      message = errorMessage(err);
    }

    if (attempt >= SEARCH_RETRIES || !isTransient(message)) {
      throw new Error(message);
    }
    const waitMs = SEARCH_BACKOFF_MS * 2 ** attempt;
    console.warn(
      `  [retrieve] ${label} transient failure (attempt ${attempt + 1}/` +
        `${SEARCH_RETRIES + 1}) — retrying in ${waitMs}ms: ${message}`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

/**
 * The filter arguments both search functions take. Null means no filter.
 *
 * Named to match the SQL parameters exactly, because supabase-js binds RPC
 * arguments by name — a renamed field here silently becomes SQL DEFAULT (no
 * filter at all) rather than a type error, which would show up as an answer
 * quietly drawn from the whole corpus when the user asked for one tradition.
 */
interface SearchFilters {
  filter_traditions: string[] | null;
  filter_categories: string[] | null;
  filter_work_ids: string[] | null;
}

/**
 * Keep at most `max` chunks from any one document, preserving fused order.
 *
 * Deliberately operates on documents rather than works: a document IS a work
 * here, and using the id that retrieval already carries avoids a join purely to
 * enforce a display rule.
 */
function capPerDocument(chunks: FusedChunk[], max: number): FusedChunk[] {
  const seen = new Map<string, number>();
  const kept: FusedChunk[] = [];
  for (const chunk of chunks) {
    const count = seen.get(chunk.documentId) ?? 0;
    if (count >= max) continue;
    seen.set(chunk.documentId, count + 1);
    kept.push(chunk);
  }
  return kept;
}

async function vectorSearch(
  embedding: number[],
  searchTop: number,
  filters: SearchFilters,
): Promise<SearchHit[]> {
  // The client is untyped (no generated DB types), so assert the row shape.
  const rows = await rpcWithRetry<MatchRow>("vector", async () =>
    await db.rpc("match_chunks", {
      // pgvector needs the "[0.1,0.2,...]" text form; a JS array is not bound
      // as a vector correctly. Verified against the live function.
      query_embedding: JSON.stringify(embedding),
      match_count: searchTop,
      ...filters,
    }),
  );
  return rows.map((r, i) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    pageNumber: r.page_number,
    reference: r.reference,
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
  filters: SearchFilters,
): Promise<SearchHit[]> {
  // The client is untyped (no generated DB types), so assert the row shape.
  const rows = await rpcWithRetry<KeywordRow>("keyword", async () =>
    await db.rpc("keyword_chunks", {
      query_text: toOrQuery(query),
      match_count: searchTop,
      ...filters,
    }),
  );
  return rows.map((r, i) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    pageNumber: r.page_number,
    reference: r.reference,
    score: r.rank,
    rank: i + 1,
  }));
}

interface FusedChunk {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  reference: string | null;
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
          reference: hit.reference,
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
    .select("id,title,filename,work_id,author,tradition,lineages,category,century")
    .in("id", ids)
    .returns<DocMetaRow[]>();
  if (error) throw new Error(`document metadata lookup failed: ${error.message}`);
  for (const row of data ?? []) meta.set(row.id, row);
  return meta;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
