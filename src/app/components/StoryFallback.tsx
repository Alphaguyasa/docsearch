"use client";

import type { FigureSummary } from "@/lib/search-stream";

import { StoryFigures } from "./StoryFigures";
import { useT } from "../i18n/client";

/**
 * When the story can't be written — the free answer quota is spent, the site
 * is busy, or the stream broke — the reader still meets the people who carried
 * the same thing. Each card opens that person's page, read straight from the
 * text with no model involved.
 */
export function StoryFallback({
  people,
  busy,
  onRetry,
}: {
  people: FigureSummary[];
  busy: boolean;
  onRetry: () => void;
}) {
  const { t } = useT();
  const f = t.story.fallback;
  return (
    <div className="rise mx-auto max-w-3xl">
      <div role="status" className="rounded-[22px] border border-border bg-panel/60 px-6 py-6 sm:px-8">
        <p className="font-display text-2xl font-semibold">{f.title}</p>
        {busy && <p className="mt-2 text-sm leading-6 text-muted">{f.busy}</p>}
        <p className="mt-3 font-serif text-[18px] leading-8">{f.body}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-11 rounded-full border border-border px-5 py-2 text-sm transition-colors duration-300 hover:border-gold/60"
        >
          {t.story.retry}
        </button>
      </div>
      <div className="mt-10">
        <StoryFigures figures={people} />
      </div>
    </div>
  );
}
