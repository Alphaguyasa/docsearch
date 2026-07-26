/**
 * Read-only corpus access for the eval harness: sampling chunks for golden set
 * generation, and resolving chunk ids for validation.
 *
 * Imports the app's shared db client rather than opening its own connection, so
 * there is exactly one place that knows how to reach Postgres.
 */
import { db } from "../../src/lib/db";
import { assertCompleteRead, fetchAllRows, fetchByIds } from "../../src/lib/paginate";

import type { CorpusChunk } from "./entities";

// Re-exported so callers keep importing corpus-shaped things from one place;
// the pure half lives in entities.ts only so it is testable without credentials.
export * from "./entities";

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
}

interface DocRow {
  id: string;
  title: string;
  filename: string;
}

/** Authoritative row count, straight from the server. */
async function tableCount(table: "chunks" | "documents"): Promise<number> {
  const res = await db.from(table).select("id", { count: "exact", head: true });
  if (res.error) throw new Error(`${table} count failed: ${res.error.message}`);
  if (res.count === null) {
    throw new Error(
      `${table}: server returned no exact count, so a complete read cannot be verified.`,
    );
  }
  return res.count;
}

/**
 * Every chunk in the corpus, joined to its document's title and filename.
 *
 * Paged and then ASSERTED against `count(*)`. Both matter: a plain `.select()`
 * silently stops at 1,000 rows, which previously made this report "1000 chunks
 * across 40 documents" for a corpus of 2,134 across 90. Sampling was therefore
 * drawn from the alphabetical first slice of the corpus, and nothing anywhere
 * complained.
 */
export async function loadCorpus(): Promise<CorpusChunk[]> {
  // Counts first: taking them before the read means a concurrent ingest shows up
  // as a mismatch rather than being masked by rows arriving mid-scan.
  const expectedDocs = await tableCount("documents");
  const expectedChunks = await tableCount("chunks");

  // Ordered by the primary key — a total order, as .range() paging requires.
  const docRows = await fetchAllRows<DocRow>("documents", (from, to) =>
    db.from("documents").select("id,title,filename").order("id").range(from, to).returns<DocRow[]>(),
  );
  assertCompleteRead("documents", docRows.length, expectedDocs);
  const meta = new Map(docRows.map((d) => [d.id, d]));

  // (document_id, chunk_index) is UNIQUE (chunks_doc_index_idx), so this is a
  // total order and no row can repeat or be skipped across page boundaries.
  const chunkRows = await fetchAllRows<ChunkRow>("chunks", (from, to) =>
    db
      .from("chunks")
      .select("id,document_id,content,page_number,chunk_index")
      .order("document_id")
      .order("chunk_index")
      .range(from, to)
      .returns<ChunkRow[]>(),
  );
  assertCompleteRead("chunks", chunkRows.length, expectedChunks);

  return chunkRows.map((c) => ({
    id: c.id,
    documentId: c.document_id,
    filename: meta.get(c.document_id)?.filename ?? "(unknown)",
    title: meta.get(c.document_id)?.title ?? "(unknown)",
    content: c.content,
    pageNumber: c.page_number,
    chunkIndex: c.chunk_index,
  }));
}

/**
 * Which of `ids` actually exist in the chunks table. Used by validation.
 *
 * Batched: a single `.in()` over more than 1,000 ids is truncated exactly like
 * any other select, and here truncation would report perfectly valid chunk ids
 * as "does not exist in the DB" — failing validation for a bug in the reader.
 */
export async function existingChunkIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const rows = await fetchByIds<{ id: string }>("chunk id lookup", ids, (batch) =>
    db.from("chunks").select("id").in("id", batch).returns<{ id: string }[]>(),
  );
  return new Set(rows.map((r) => r.id));
}
