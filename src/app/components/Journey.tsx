"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FIGURES } from "@/lib/scripture/figures";

import { JOURNEY, JOURNEY_KEY, journeyDay } from "../journey";
import { useT } from "../i18n/client";
import { figureText } from "../i18n/dict";
import { ArrowRight } from "./Icons";

/** Which days this reader has marked read — kept only in their own browser. */
function useJourney() {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? "[]");
      if (Array.isArray(saved)) setDone(new Set(saved.filter((id) => JOURNEY.includes(id))));
    } catch {
      /* private mode or blocked storage: start fresh */
    }
  }, []);
  const mark = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(JOURNEY_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return { done, mark };
}

const nameOf = (lang: "en" | "am", id: string) => {
  const f = FIGURES.find((x) => x.id === id)!;
  return figureText(lang, f);
};

/** The 40 days, with a way to pick up where the reader left off. */
export function JourneyList() {
  const { lang, t } = useT();
  const tj = t.journey;
  const { done } = useJourney();
  const nextDay = JOURNEY.findIndex((id) => !done.has(id)) + 1;

  return (
    <div>
      {nextDay === 0 ? (
        <p className="rounded-[20px] border border-gold/40 bg-panel/60 px-6 py-5 font-serif text-[19px] leading-8">
          {tj.finished}
        </p>
      ) : (
        <Link
          href={`/people/${JOURNEY[nextDay - 1]}`}
          className="group inline-flex h-12 items-center gap-2 rounded-full bg-gold px-6 font-medium text-background transition-transform active:scale-[0.97]"
        >
          {nextDay === 1 ? tj.start : tj.continue(nextDay)}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
      <ol className="mt-10 grid gap-3 sm:grid-cols-2">
        {JOURNEY.map((id, i) => {
          const x = nameOf(lang, id);
          const read = done.has(id);
          return (
            <li key={id}>
              <Link
                href={`/people/${id}`}
                className="group flex h-full items-start gap-4 rounded-[18px] border border-border bg-card px-5 py-4 transition-colors hover:border-gold/40"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                    read ? "border-gold bg-gold text-background" : "border-gold/50 text-gold"
                  }`}
                  aria-hidden
                >
                  {read ? "✓" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">
                    {tj.day(i + 1)}
                    {read && ` · ${tj.read}`}
                  </span>
                  <span className="mt-0.5 block font-display text-xl font-semibold leading-tight">{x.name}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-muted">{x.summary}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** On a person's page: which day of the journey this is, mark it read, go on. */
export function JourneyMark({ id }: { id: string }) {
  const { lang, t } = useT();
  const tj = t.journey;
  const { done, mark } = useJourney();
  const day = journeyDay(id);
  if (!day) return null;
  const nextId = JOURNEY[day];
  const read = done.has(id);

  return (
    <section className="mt-12 flex flex-wrap items-center gap-3 rounded-[22px] border border-border bg-panel/60 px-6 py-5">
      <Link href="/journey" className="mr-auto text-sm text-muted underline underline-offset-4 hover:text-foreground">
        {tj.title} · {tj.day(day)} {tj.of}
      </Link>
      <button
        type="button"
        onClick={() => mark(id)}
        disabled={read}
        aria-pressed={read}
        className={`min-h-11 rounded-full border px-5 py-2 text-sm transition-colors ${
          read ? "border-gold bg-gold/15 text-foreground" : "border-gold/60 text-foreground hover:bg-gold/10"
        }`}
      >
        {read ? tj.marked : tj.mark}
      </button>
      {nextId && (
        <Link
          href={`/people/${nextId}`}
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 py-2 text-sm hover:border-gold/60"
        >
          {tj.next}: {nameOf(lang, nextId).name}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </section>
  );
}

/** On the home page: an invitation into the 40 days, or where the reader left off. */
export function JourneyInvite() {
  const { t } = useT();
  const tj = t.journey;
  const { done } = useJourney();
  const nextDay = JOURNEY.findIndex((id) => !done.has(id)) + 1;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
      <Link
        href="/journey"
        className="group flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-border bg-card px-6 py-5 transition-colors hover:border-gold/40"
      >
        <span>
          <span className="block font-caps text-[12px] font-semibold tracking-[0.2em] text-gold">{tj.eyebrow}</span>
          <span className="mt-1 block font-display text-2xl font-semibold leading-tight">{tj.title}</span>
        </span>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-gold">
          {done.size === 0 ? tj.start : nextDay === 0 ? tj.all : tj.continue(nextDay)}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </Link>
    </section>
  );
}
