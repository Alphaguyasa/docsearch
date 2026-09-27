/**
 * GET /api/documents — list ingested documents with page and chunk counts.
 *
 * Read-only view over the corpus, used by the /documents page and by the search
 * page to detect the empty (nothing-ingested) state. Imports the shared db
 * client; does not modify src/lib.
 */
import { db } from "@/lib/db";
import type { DocumentSummary } from "@/app/types";

interface DocRow {
  id: string;
  title: string;
  filename: string;
  page_count: number | null;
  byte_size: number | null;
  status: string;
  error: string | null;
  created_at: string;
  work_id: string | null;
  author: string | null;
  tradition: string | null;
  category: string | null;
  century: number | null;
  chunks: { count: number }[];
}

export async function GET(): Promise<Response> {
  const { data, error } = await db
    .from("documents")
    .select(
      "id,title,filename,page_count,byte_size,status,error,created_at," +
        "work_id,author,tradition,category,century,chunks(count)",
    )
    .order("created_at", { ascending: false })
    .returns<DocRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const documents: DocumentSummary[] = (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    filename: d.filename,
    page_count: d.page_count,
    byte_size: d.byte_size,
    status: d.status,
    error: d.error,
    created_at: d.created_at,
    chunk_count: d.chunks?.[0]?.count ?? 0,
    work_id: d.work_id,
    author: d.author,
    tradition: d.tradition,
    category: d.category,
    century: d.century,
  }));

  return Response.json({ documents });
}
