"use client";

import type { UiSource } from "@/app/types";

interface Props {
  sources: UiSource[];
  activeCitation: number | null;
  onSelect: (n: number) => void;
  onHover: (n: number | null) => void;
}

/**
 * Compact list of the numbered citation targets. Rendered the instant the
 * "sources" line arrives — before the first answer delta — so the reader can
 * see what [n] will refer to. Selecting one opens the citation panel.
 */
export function CitationTargets({ sources, activeCitation, onSelect, onHover }: Props) {
  if (sources.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        Citation targets
      </div>
      <ol className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => onSelect(s.n)}
              onMouseEnter={() => onHover(s.n)}
              onMouseLeave={() => onHover(null)}
              className={`flex items-baseline gap-1.5 border px-2 py-1 text-xs transition-colors ${
                activeCitation === s.n
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-accent/50"
              }`}
            >
              <span className="font-mono text-accent">[{s.n}]</span>
              <span className="max-w-[16rem] truncate">{s.title}</span>
              {s.pageNumber !== null && (
                <span className="text-muted">p.{s.pageNumber}</span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
