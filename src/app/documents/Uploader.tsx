"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { DocumentSummary } from "@/app/types";

type Phase = "uploading" | "pending" | "processing" | "complete" | "failed" | "error";
const TERMINAL: Phase[] = ["complete", "failed", "error"];

interface Item {
  key: string;
  name: string;
  id?: string;
  pct: number;
  phase: Phase;
  error?: string;
}

const LABEL: Record<Phase, string> = {
  uploading: "Uploading",
  pending: "Queued",
  processing: "Processing…",
  complete: "Done",
  failed: "Failed",
  error: "Error",
};

/** Drag-and-drop PDF upload with per-file progress and status polling. */
export function Uploader() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = items.some((i) => !TERMINAL.includes(i.phase));

  const patch = (key: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));

  function uploadOne(item: Item, file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) patch(item.key, { pct: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        let body: { id?: string; error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error body */
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.id) {
          patch(item.key, { id: body.id, phase: "pending", pct: 100 });
          resolve(body.id);
        } else {
          patch(item.key, { phase: "error", error: body.error ?? `Upload failed (${xhr.status}).` });
          resolve(null);
        }
      };
      xhr.onerror = () => {
        patch(item.key, { phase: "error", error: "Network error during upload." });
        resolve(null);
      };
      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    });
  }

  async function drainAndPoll(ids: string[]) {
    const pending = new Set(ids);
    for (let guard = 0; guard < 300 && pending.size > 0; guard++) {
      await fetch("/api/process", { method: "POST" }).catch(() => {});
      const docs: DocumentSummary[] = await fetch("/api/documents")
        .then((r) => r.json())
        .then((d) => d.documents ?? [])
        .catch(() => []);

      setItems((prev) =>
        prev.map((i) => {
          const d = i.id ? docs.find((x) => x.id === i.id) : undefined;
          if (!d) return i;
          const phase = d.status as Phase;
          return { ...i, phase, error: phase === "failed" ? "Processing failed." : i.error };
        }),
      );
      for (const id of [...pending]) {
        const d = docs.find((x) => x.id === id);
        if (d && (d.status === "complete" || d.status === "failed")) pending.delete(id);
      }
      router.refresh();
      if (pending.size > 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function addFiles(fileList: FileList | File[]) {
    const files = [...fileList].filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (files.length === 0) return;

    const fresh: Item[] = files.map((f) => ({
      key: crypto.randomUUID(),
      name: f.name,
      pct: 0,
      phase: "uploading" as Phase,
    }));
    setItems((prev) => [...prev, ...fresh]);

    const ids: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const id = await uploadOne(fresh[i], files[i]);
      if (id) ids.push(id);
    }
    if (ids.length > 0) await drainAndPoll(ids);
  }

  return (
    <div className="mb-8">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`cursor-pointer border border-dashed px-6 py-8 text-center text-sm transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
        }`}
      >
        <p>
          Drop PDFs here, or <span className="text-accent">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted">Up to 15 MB each.</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files ?? []);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-border border border-border">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              {i.phase === "uploading" ? (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden bg-border">
                    <span className="block h-full bg-accent" style={{ width: `${i.pct}%` }} />
                  </span>
                  <span className="w-10 text-right font-mono text-xs text-muted">{i.pct}%</span>
                </span>
              ) : (
                <span
                  className={`font-mono text-xs ${
                    i.phase === "failed" || i.phase === "error"
                      ? "text-red-600 dark:text-red-400"
                      : i.phase === "complete"
                        ? "text-accent"
                        : "text-muted"
                  }`}
                  title={i.error}
                >
                  {LABEL[i.phase]}
                  {(i.phase === "failed" || i.phase === "error") && i.error ? `: ${i.error}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p className="mt-2 text-xs text-muted">Processing… you can keep this tab open.</p>
      )}
    </div>
  );
}
