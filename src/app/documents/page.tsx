/**
 * /documents — list ingested documents with page + chunk counts and a delete
 * control. Server component: reads the corpus directly through the shared db
 * client (import only; src/lib is unchanged). Rendered on demand so the list is
 * always fresh after a delete.
 */
import { db } from "@/lib/db";
import type { DocumentSummary } from "@/app/types";

import { DocumentsTable } from "./DocumentsTable";
import { Uploader } from "./Uploader";

export const dynamic = "force-dynamic";

interface DocRow {
  id: string;
  title: string;
  filename: string;
  page_count: number | null;
  byte_size: number | null;
  status: string;
  error: string | null;
  created_at: string;
  chunks: { count: number }[];
}

export default async function DocumentsPage() {
  const { data, error } = await db
    .from("documents")
    .select("id,title,filename,page_count,byte_size,status,error,created_at,chunks(count)")
    .order("created_at", { ascending: false })
    .returns<DocRow[]>();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Documents</h1>

      {error ? (
        <p className="mt-4 border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Failed to load documents: {error.message}
        </p>
      ) : (
        <DocumentsView data={data ?? []} />
      )}
    </main>
  );
}

function DocumentsView({ data }: { data: DocRow[] }) {
  const documents: DocumentSummary[] = data.map((d) => ({
    id: d.id,
    title: d.title,
    filename: d.filename,
    page_count: d.page_count,
    byte_size: d.byte_size,
    status: d.status,
    error: d.error,
    created_at: d.created_at,
    chunk_count: d.chunks?.[0]?.count ?? 0,
  }));

  return (
    <>
      <p className="mt-1 text-sm text-muted">
        {documents.length} document{documents.length === 1 ? "" : "s"} in the corpus.
      </p>
      <div className="mt-6">
        <Uploader />
        <DocumentsTable documents={documents} />
      </div>
    </>
  );
}
