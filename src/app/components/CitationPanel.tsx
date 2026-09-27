"use client";

import { useEffect, useRef } from "react";

import type { UiSource } from "@/app/types";

import { SourceLabel } from "./SourceLabel";

interface Props {
  sources: UiSource[];
  cited: number[];
  activeCitation: number | null;
  hoveredCitation: number | null;
  onClose: () => void;
}

/**
 * Right-side panel opened by clicking a citation. Lists the cited chunks in
 * full, each headed by the work, its author and a reference the reader can look
 * up in a printed edition. The active entry is scrolled into
 * view; the active or hovered entry is highlighted (hovering a chip highlights
 * the matching entry here).
 */
export function CitationPanel({
  sources,
  cited,
  activeCitation,
  hoveredCitation,
  onClose,
}: Props) {
  const refs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    if (activeCitation !== null) {
      refs.current.get(activeCitation)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeCitation]);

  const entries = sources.filter((s) => cited.includes(s.n));

  return (
    <aside className="border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Cited sources
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {entries.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted">
            No citations in the answer yet.
          </p>
        )}
        {entries.map((s) => {
          const highlight = s.n === activeCitation || s.n === hoveredCitation;
          return (
            <div
              key={s.n}
              ref={(el) => {
                if (el) refs.current.set(s.n, el);
              }}
              className={`border-b border-border px-3 py-2.5 last:border-b-0 ${
                highlight ? "bg-accent/10" : ""
              }`}
            >
              <div className="mb-1 flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-accent">[{s.n}]</span>
                <SourceLabel source={s} />
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
                {s.content}
              </p>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
