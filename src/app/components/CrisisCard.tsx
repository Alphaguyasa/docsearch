"use client";

import Link from "next/link";

import type { CrisisPayload } from "@/lib/search-stream";

/** Shown instead of a story when the safety gate trips. Calm, direct, first; numbers dial on one tap. */
export function CrisisCard({ crisis, onBack }: { crisis: CrisisPayload; onBack: () => void }) {
  const phones = crisis.resources.filter((r) => r.phone);
  const others = crisis.resources.filter((r) => !r.phone);
  return (
    <section role="alert" className="rise">
      <p className="font-serif text-[1.7rem] leading-snug sm:text-3xl">{crisis.message}</p>

      {phones.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {phones.map((r) => (
            <li key={r.name}>
              <a
                href={`tel:${r.phone}`}
                className="flex h-full flex-col rounded-sm border-2 border-gold/70 bg-background/60 px-5 py-4 transition-colors hover:bg-gold/10"
              >
                <span className="font-serif text-4xl text-gold">{r.phone}</span>
                <span className="mt-1 font-medium">{r.name}</span>
                <span className="text-sm text-muted">{r.detail} · tap to call</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-6 space-y-2 leading-7">
        {crisis.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      {others.length > 0 && (
        <ul className="mt-4 space-y-3">
          {others.map((r) => (
            <li key={r.name}>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-accent underline underline-offset-4">
                  {r.name}
                </a>
              ) : (
                <span className="font-medium">{r.name}</span>
              )}
              <span className="block text-sm text-muted">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
        <Link href="/help" className="underline underline-offset-4 hover:text-foreground">
          All help, in one place
        </Link>
        <button type="button" onClick={onBack} className="underline underline-offset-4 hover:text-foreground">
          Write something else
        </button>
      </div>
    </section>
  );
}
