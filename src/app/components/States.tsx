"use client";

/** Idle state: three example questions the user can run with one click. */
export function IdleExamples({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Try an example
      </div>
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

/** Loading state: skeleton bars shown after submit, before sources arrive. */
export function LoadingSkeleton() {
  const widths = ["w-3/4", "w-full", "w-11/12", "w-2/3", "w-5/6"];
  return (
    <div className="animate-pulse space-y-2.5" aria-label="Loading">
      {widths.map((w, i) => (
        <div key={i} className={`h-4 ${w} bg-border`} />
      ))}
    </div>
  );
}

/** Error state: readable message plus a retry of the last question. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="border border-red-500/40 bg-red-500/5 px-4 py-3">
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 border border-border px-3 py-1 text-xs transition-colors hover:border-accent"
      >
        Retry
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
        The corpus is empty, so there is nothing to search. Ingest one or more
        PDFs, then reload this page.
      </p>
      <pre className="mt-3 overflow-x-auto border border-border bg-panel p-3 font-mono text-xs">
        npm run ingest -- ./path/to/file.pdf
      </pre>
      <p className="mt-2 text-xs text-muted">
        See the project README for ingestion details.
      </p>
    </div>
  );
}
