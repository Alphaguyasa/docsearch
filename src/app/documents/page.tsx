/**
 * /documents — the library: every book that has been loaded, grouped by the
 * communion it belongs to, with how much of it is indexed.
 *
 * Grouped rather than listed flat because the grouping is the point. A reader
 * should be able to see at a glance that the Oriental Orthodox shelf is real and
 * not a token gesture, and which books both communions share.
 *
 * Server component: reads through the shared db client (import only; src/lib is
 * unchanged). Rendered on demand so the list is fresh after a delete, and
 * because ingestion runs for hours — a cached page would show a stale count.
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
  work_id: string | null;
  author: string | null;
  tradition: string | null;
  category: string | null;
  century: number | null;
  chunks: { count: number }[];
}

export default async function DocumentsPage() {
  const { data, error } = await db
    .from("documents")
    .select(
      "id,title,filename,page_count,byte_size,status,error,created_at," +
        "work_id,author,tradition,category,century,chunks(count)",
    )
    .order("created_at", { ascending: false })
    .returns<DocRow[]>();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">The library</h1>

      {error ? (
        <p className="mt-4 border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Failed to load the library: {error.message}
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
    work_id: d.work_id,
    author: d.author,
    tradition: d.tradition,
    category: d.category,
    century: d.century,
  }));

  // A catalogued work has a tradition; anything else is an upload or a leftover
  // from before this became a library. They are shown apart because they answer
  // to different standards — the library is curated and public domain, an
  // upload is whatever someone happened to add.
  const library = documents.filter((d) => d.tradition !== null);
  const other = documents.filter((d) => d.tradition === null);

  const complete = library.filter((d) => d.status === "complete").length;
  const passages = library.reduce((sum, d) => sum + d.chunk_count, 0);

  return (
    <>
      <p className="mt-1 text-sm text-muted">
        {library.length} book{library.length === 1 ? "" : "s"} in the library
        {complete < library.length && ` (${complete} fully loaded)`} ·{" "}
        {passages.toLocaleString()} passages indexed.
      </p>

      {library.length > 0 && <Library documents={library} />}

      <div className="mt-10">
        <h2 className="text-base font-semibold tracking-tight">
          {library.length > 0 ? "Other documents" : "Documents"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Anything uploaded here sits outside the Orthodox library and is not used
          when answering questions.
        </p>
        <div className="mt-4">
          <Uploader />
          <DocumentsTable documents={other} />
        </div>
      </div>
    </>
  );
}

const TRADITION_ORDER: { key: string; heading: string; blurb: string }[] = [
  {
    key: "both",
    heading: "Received by both traditions",
    blurb:
      "The scriptures, and the Fathers and councils of the undivided Church — the inheritance the Eastern and Oriental Churches hold in common.",
  },
  {
    key: "eastern",
    heading: "Eastern Orthodox",
    blurb: "Byzantine, Greek, Slavic and Antiochian sources.",
  },
  {
    key: "oriental",
    heading: "Oriental Orthodox",
    blurb: "Coptic, Ethiopian, Syriac and Armenian sources.",
  },
];

/** The library, grouped by which communion each book belongs to. */
function Library({ documents }: { documents: DocumentSummary[] }) {
  return (
    <div className="mt-8 space-y-8">
      {TRADITION_ORDER.map(({ key, heading, blurb }) => {
        const books = documents
          .filter((d) => d.tradition === key)
          .sort((a, b) => a.title.localeCompare(b.title));
        if (books.length === 0) return null;

        return (
          <section key={key}>
            <h2 className="text-base font-semibold tracking-tight">
              {heading}{" "}
              <span className="font-normal text-muted">({books.length})</span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{blurb}</p>

            <ul className="mt-3 divide-y divide-border border border-border">
              {books.map((book) => (
                <li key={book.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      {book.author && (
                        <span className="text-sm font-medium">{book.author}, </span>
                      )}
                      <span className="text-sm">{book.title}</span>
                    </div>
                    <div className="shrink-0 font-mono text-xs text-muted">
                      {book.chunk_count.toLocaleString()} passages
                      {/* Still loading: the corpus is ingested over hours
                          against a rate limit, so a partially-loaded book is
                          normal and should read as progress, not as an error. */}
                      {book.status !== "complete" && ` · ${book.status}`}
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[
                      book.category,
                      book.century ? `${book.century}th century` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
