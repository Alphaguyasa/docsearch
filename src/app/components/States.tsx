"use client";

import { useT } from "../i18n/client";

/** Loading state: a still candle and a line of reassurance while the story is found. */
export function LoadingSkeleton() {
  const { t } = useT();
  const widths = ["w-3/4", "w-full", "w-11/12", "w-2/3", "w-5/6"];
  return (
    <div aria-live="polite">
      <p className="text-sm text-muted">{t.story.loading}</p>
      <div className="mt-4 animate-pulse space-y-3" aria-hidden>
        {widths.map((w, i) => (
          <div key={i} className={`h-4 ${w} rounded bg-border`} />
        ))}
      </div>
    </div>
  );
}

/** Error state: calm, readable, one way forward. Not alarm-red — the reader has done nothing wrong. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <div role="status" className="border border-border bg-panel px-5 py-4">
      <p className="leading-7">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 border border-border bg-background px-4 py-1.5 text-sm transition-colors hover:border-accent"
      >
        {t.story.retry}
      </button>
    </div>
  );
}
