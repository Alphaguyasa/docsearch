/**
 * SERVER-ONLY. Shared ingestion pipeline steps, used by BOTH the CLI
 * (scripts/ingest.ts) and the browser upload processing route, so PDF
 * extraction and chunk insertion live in exactly one place. Chunking and
 * embedding themselves stay in chunk.ts / embed.ts — this module only reuses
 * them.
 *
 * Deliberately db-free at import time: `db` is passed in as a parameter (not
 * imported here), so importing `extractPdf` on the CLI's --dry-run path pulls in
 * no credentials and makes no network calls. Never import into a client
 * component.
 */
import { extractText } from "unpdf";

import type { Chunk, Page } from "./chunk";

// Passing db as a parameter (rather than importing it) keeps this module free of
// the env-validating db import — see the file header.
type Db = typeof import("./db").db;

const MIN_PAGE_CHARS = 50; // pages shorter than this are likely scanned images
const CHUNK_INSERT_BATCH = 500;

export interface ExtractedPdf {
  totalPages: number;
  /** Pages that passed the length filter. */
  pages: Page[];
  /** Page numbers dropped as likely scanned (too little text). */
  skipped: number[];
}

/**
 * Extract text per page from PDF bytes, dropping likely-scanned pages (under
 * MIN_PAGE_CHARS). Page numbers are 1-based and preserved — they become the
 * citation later.
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  const { totalPages, text } = await extractText(bytes, { mergePages: false });

  const pages: Page[] = [];
  const skipped: number[] = [];
  text.forEach((pageText, i) => {
    const pageNumber = i + 1;
    if (pageText.trim().length < MIN_PAGE_CHARS) skipped.push(pageNumber);
    else pages.push({ pageNumber, text: pageText });
  });

  return { totalPages, pages, skipped };
}

/**
 * Insert chunk rows for an existing document, aligning each chunk with its
 * precomputed embedding. Inserted in batches so a large document is one request
 * per batch, not per chunk.
 */
export async function insertChunks(
  db: Db,
  documentId: string,
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    content: c.content,
    page_number: c.pageNumber,
    chunk_index: i,
    token_count: c.tokenCount,
    // pgvector wants the "[1,2,3]" text form; a raw JS array serializes to a
    // Postgres array literal ("{1,2,3}") and fails to cast.
    embedding: JSON.stringify(embeddings[i]),
  }));

  for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
    const ins = await db.from("chunks").insert(rows.slice(i, i + CHUNK_INSERT_BATCH));
    if (ins.error) throw new Error(`Chunk insert failed: ${ins.error.message}`);
  }
}
