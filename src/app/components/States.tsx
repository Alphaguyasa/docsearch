"use client";

import { useT } from "../i18n/client";

/** Idle state: three example questions the user can run with one click. */
export function IdleExamples({ examples, onPick }: { examples: string[]; onPick: (q: string) => void }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Try an example</div>
      <ul className="divide-y divide-border border border-border">
        {examples.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-panel"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

/** Empty state: no documents ingested — point the user at the ingest command. */
export function EmptyState() {
  return (
    <div className="border border-border p-6">
      <h2 className="text-base font-semibold">No documents ingested</h2>
      <p className="mt-1 text-muted">
        The corpus is empty, so there is nothing to search. Ingest one or more PDFs, then reload this page.
      </p>
      <pre className="mt-3 overflow-x-auto border border-border bg-panel p-3 font-mono text-xs">
        npm run ingest -- ./path/to/file.pdf
      </pre>
      <p className="mt-2 text-xs text-muted">See the project README for ingestion details.</p>
    </div>
  );
}
