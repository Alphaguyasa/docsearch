"use client";

import type { UiSource } from "@/app/types";

interface Props {
  answer: string;
  sources: UiSource[];
  activeCitation: number | null;
  streaming: boolean;
  onCiteClick: (n: number) => void;
  onCiteHover: (n: number | null) => void;
}

/**
 * The streaming answer body. Splits on [n] markers and renders each as a
 * clickable superscript chip; hovering a chip highlights its panel entry, and
 * an unknown [n] (no matching source) is flagged. Generous line height — this
 * text is read closely.
 */
export function AnswerView({
  answer,
  sources,
  activeCitation,
  streaming,
  onCiteClick,
  onCiteHover,
}: Props) {
  const known = new Set(sources.map((s) => s.n));
  const parts = answer.split(/(\[\d+\])/g);

  return (
    <div className="whitespace-pre-wrap text-[15px] leading-8">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;

        const n = Number(m[1]);
        const isKnown = known.has(n);
        const active = activeCitation === n;
        return (
          <sup key={i}>
            <button
              type="button"
              disabled={!isKnown}
              onClick={() => onCiteClick(n)}
              onMouseEnter={() => onCiteHover(n)}
              onMouseLeave={() => onCiteHover(null)}
              title={isKnown ? `Open source [${n}]` : `Unknown source [${n}]`}
              className={`mx-0.5 rounded-sm px-1 font-mono text-[11px] leading-none transition-colors ${
                isKnown
                  ? active
                    ? "bg-accent text-accent-fg"
                    : "bg-accent/15 text-accent hover:bg-accent hover:text-accent-fg"
                  : "bg-red-500/15 text-red-600 dark:text-red-400"
              }`}
            >
              [{n}]
            </button>
          </sup>
        );
      })}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
      )}
    </div>
  );
}
