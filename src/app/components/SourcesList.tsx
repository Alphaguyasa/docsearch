"use client";

import { useState } from "react";

import type { UiSource } from "@/app/types";

/** Collapsible list of ALL retrieved chunks with their fusion scores. */
export function SourcesList({ sources }: { sources: UiSource[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
      >
        <span className="font-mono">{open ? "▾" : "▸"}</span>
        Retrieved chunks ({sources.length})
      </button>

      {open && (
        <ol className="mt-2 divide-y divide-border border border-border">
          {sources.map((s) => (
            <li key={s.n} className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-muted">[{s.n}]</span>
                  <span className="truncate font-medium">{s.title}</span>
                  {s.pageNumber !== null && (
                    <span className="shrink-0 text-muted">p.{s.pageNumber}</span>
                  )}
                </div>
                <div className="shrink-0 font-mono text-muted">
                  fused {s.fusedScore.toFixed(4)}
                  {s.vectorScore !== null && ` · vec ${s.vectorScore.toFixed(3)}`}
                  {s.keywordScore !== null && ` · kw ${s.keywordScore.toFixed(3)}`}
                </div>
              </div>
              <p className="mt-1 line-clamp-3 text-[13px] leading-6 text-foreground/80">
                {s.content}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
