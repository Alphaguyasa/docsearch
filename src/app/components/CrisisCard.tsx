"use client";

import type { CrisisPayload } from "@/lib/search-stream";

/** Shown instead of a story when the safety gate trips. Calm, direct, first. */
export function CrisisCard({ crisis, onBack }: { crisis: CrisisPayload; onBack: () => void }) {
  return (
    <section role="alert" className="border-l-4 border-care bg-panel px-5 py-5">
      <p className="font-serif text-xl leading-8">{crisis.message}</p>
      <ul className="mt-4 space-y-2">
        {crisis.steps.map((s) => (
          <li key={s} className="leading-7">
            {s}
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2">
        {crisis.resources.map((r) => (
          <li key={r.name}>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-accent underline underline-offset-4">
                {r.name}
              </a>
            ) : (
              <span className="font-medium">{r.name}</span>
            )}
            {r.phone && <span className="ml-2">{r.phone}</span>}
            <span className="block text-sm text-muted">{r.detail}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onBack} className="mt-5 text-sm text-muted underline underline-offset-4">
        Write something else
      </button>
    </section>
  );
}
