"use client";

import type { UiSource } from "@/app/types";
import { emphasisRuns } from "@/lib/emphasis";
import { useT } from "../i18n/client";

interface Props {
  answer: string;
  sources: UiSource[];
  activeCitation: number | null;
  streaming: boolean;
  onCiteClick: (n: number) => void;
}

/**
 * The streaming answer body. Splits on [n] markers and renders each as a
 * small gold superscript that jumps to its passage below. A marker with no
 * matching passage (possible while streaming) is shown quietly, not as an
 * error. The model's light markdown (**bold**, *italic*, a # heading) is shown
 * as bold and italics, as the Telegram bot does, never as asterisks. Generous
 * line height — this text is read closely.
 */
export function AnswerView({ answer, sources, activeCitation, streaming, onCiteClick }: Props) {
  const { t } = useT();
  const known = new Set(sources.map((s) => s.n));
  // Emphasis first, then citations inside each run, so "**David [1]**" stays bold around its marker.
  const parts = emphasisRuns(answer).flatMap((run) =>
    run.text.split(/(\[\d+\])/g).map((text) => ({ ...run, text })),
  );

  return (
    <div className="whitespace-pre-wrap">
      {parts.map(({ text: part, bold, italic }, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) {
          if (!part) return null;
          const inner = italic ? <em>{part}</em> : part;
          return bold ? <strong key={i} className="font-semibold">{inner}</strong> : <span key={i}>{inner}</span>;
        }

        const n = Number(m[1]);
        const isKnown = known.has(n);
        const active = activeCitation === n;
        return (
          <sup key={i}>
            <button
              type="button"
              disabled={!isKnown}
              onClick={() => onCiteClick(n)}
              aria-label={isKnown ? `Passage ${n}` : undefined}
              title={isKnown ? t.story.passage(n) : undefined}
              className={`mx-px rounded px-1 font-sans text-[11px] font-semibold leading-none transition-colors ${
                isKnown ? (active ? "bg-gold text-background" : "text-gold hover:bg-gold/15") : "text-muted"
              }`}
            >
              {n}
            </button>
          </sup>
        );
      })}
      {streaming && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />}
    </div>
  );
}
