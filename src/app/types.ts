/**
 * Client-side view types for the web UI. The wire contract itself lives in
 * src/lib/search-stream.ts (SourceChunk / SearchStreamMessage); this file only
 * layers on the extra fields the /api/search route emits for the UI and the
 * shape returned by /api/documents.
 */
import type { SourceChunk } from "@/lib/search-stream";

/**
 * A retrieved chunk as rendered in the UI. Extends the base SourceChunk with the
 * fusion scores the route adds to each "sources" entry (see route.ts).
 */
export interface UiSource extends SourceChunk {
  fusedScore: number;
  vectorScore: number | null;
  keywordScore: number | null;
}

/** A document row as returned by GET /api/documents. */
export interface DocumentSummary {
  id: string;
  title: string;
  filename: string;
  page_count: number | null;
  chunk_count: number;
  byte_size: number | null;
  status: string;
  error: string | null;
  created_at: string;
}
