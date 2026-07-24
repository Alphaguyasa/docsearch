"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { DocumentSummary } from "@/app/types";

/** Documents table with a two-step (click → confirm) delete per row. */
export function DocumentsTable({ documents }: { documents: DocumentSummary[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function del(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Delete failed (${res.status}).`);
      }
      setConfirmId(null);
      router.refresh(); // re-render the server component with the updated list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted">No documents ingested.</p>;
  }

  return (
    <div>
      {error && (
        <p className="mb-3 border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Title</th>
            <th className="py-2 pr-3 font-medium">File</th>
            <th className="py-2 pr-3 text-right font-medium">Pages</th>
            <th className="py-2 pr-3 text-right font-medium">Chunks</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="border-b border-border">
              <td className="py-2 pr-3">{d.title}</td>
              <td className="py-2 pr-3 font-mono text-xs text-muted">{d.filename}</td>
              <td className="py-2 pr-3 text-right font-mono">{d.page_count ?? "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{d.chunk_count}</td>
              <td className="py-2 pr-3">
                <span
                  title={d.error ?? undefined}
                  className={`font-mono text-xs ${
                    d.status === "failed"
                      ? "text-red-600 dark:text-red-400"
                      : d.status === "complete"
                        ? "text-muted"
                        : "text-accent"
                  }`}
                >
                  {d.status}
                </span>
              </td>
              <td className="py-2 text-right">
                {confirmId === d.id ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-xs text-muted">Delete?</span>
                    <button
                      type="button"
                      disabled={deletingId === d.id}
                      onClick={() => del(d.id)}
                      className="border border-red-500/50 px-2 py-0.5 text-xs text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-60 dark:text-red-400"
                    >
                      {deletingId === d.id ? "…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="border border-border px-2 py-0.5 text-xs transition-colors hover:border-accent"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(d.id)}
                    className="border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:border-red-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
