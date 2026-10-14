"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ethiopianFromDay } from "@/lib/ethiopian-calendar";
import { PRAYERS, type Prayer } from "@/lib/scripture/prayers";
import { addisDay } from "@/lib/scripture/today";

import {
  EMPTY_JOURNAL,
  JOURNAL_KEY,
  addEntry,
  begin,
  beginAgain,
  daysSince,
  markPrayed,
  parseJournal,
  recentDays,
  removeEntry,
  type Journal,
} from "../journal-store";
import { useT } from "../i18n/client";
import { Lock } from "./Icons";

/** The journal in this browser's storage; null until read after mount. */
function useJournal() {
  const [j, setJ] = useState<Journal | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(JOURNAL_KEY);
    } catch {
      /* private mode or blocked storage: an empty journal that won't be kept */
    }
    setJ(parseJournal(saved));
  }, []);
  const update = useCallback((f: (j: Journal) => Journal) => {
    setJ((prev) => {
      const next = f(prev ?? EMPTY_JOURNAL);
      try {
        localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const erase = useCallback(() => {
    try {
      localStorage.removeItem(JOURNAL_KEY);
    } catch {
      /* ignore */
    }
    setJ(EMPTY_JOURNAL);
  }, []);
  return { j, update, erase };
}

const card = "rounded-[22px] border border-border bg-card px-6 py-7 sm:px-8";
const gold = "font-caps text-[12px] font-semibold tracking-[0.16em] text-gold";
const button =
  "rounded-full border border-gold/50 px-5 py-2.5 font-caps text-[12px] font-semibold tracking-[0.14em] text-gold transition-colors hover:bg-gold/10 disabled:opacity-60";
const quiet = "font-caps text-[12px] font-semibold tracking-[0.14em] text-muted underline-offset-4 hover:underline";

export function JournalBook() {
  const { lang, t } = useT();
  const tj = t.journal;
  const c = t.churchDay;
  const { j, update, erase } = useJournal();
  const [today, setToday] = useState(0);
  const [asking, setAsking] = useState<"fell" | "erase" | null>(null);
  const [justFell, setJustFell] = useState(false);
  const [draft, setDraft] = useState("");
  const [prayerId, setPrayerId] = useState<Prayer["id"]>("psalm51");
  useEffect(() => setToday(addisDay(new Date())), []);

  const ethDate = (day: number) => {
    const d = ethiopianFromDay(day);
    return c.date(c.months[d.month - 1], d.day, d.year);
  };

  if (!j || !today) return <div className="min-h-[320px]" aria-hidden />;

  const days = daysSince(j, today);
  const prayedToday = j.prayed.includes(today);
  const prayer = PRAYERS.find((p) => p.id === prayerId)!;
  const lines = lang === "am" && prayer.linesAm ? prayer.linesAm : prayer.lines;

  return (
    <div className="space-y-8">
      <section className={card} aria-label={tj.since}>
        {j.start === null ? (
          <div className="text-center">
            <p className="font-serif text-[18px] leading-8 text-muted">{tj.beginNote}</p>
            <button type="button" className={`${button} mt-5`} onClick={() => update((x) => begin(x, today))}>
              {tj.begin}
            </button>
          </div>
        ) : (
          <>
            <p className="text-center">
              <span className="font-display text-6xl font-semibold text-foreground">{days}</span>{" "}
              <span className="font-display text-2xl text-foreground/90">{tj.days(days)}</span>
            </p>
            <p className="mt-1 text-center font-serif text-[17px] text-muted">
              {j.restarts > 0 ? tj.sinceAgain : tj.since} · {ethDate(j.start)}
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className={button}
                disabled={prayedToday}
                onClick={() => update((x) => markPrayed(x, today))}
              >
                {prayedToday ? `✓ ${tj.prayed}` : tj.pray}
              </button>
            </div>
            <p className={`${gold} mt-7 text-center`}>{tj.last}</p>
            <ol className="mt-3 flex justify-center gap-1.5" aria-label={tj.last}>
              {recentDays(j, today).map((d) => (
                <li
                  key={d.day}
                  title={ethDate(d.day)}
                  className={`h-3.5 w-3.5 rounded-full border ${d.prayed ? "border-gold bg-gold" : "border-border bg-transparent"}`}
                >
                  <span className="sr-only">
                    {ethDate(d.day)}
                    {d.prayed ? ` — ${tj.prayed}` : ""}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-7 text-center">
              {asking === "fell" ? (
                <div className="space-y-3">
                  <p className="font-serif text-[17px] text-foreground/90">{tj.fellAsk}</p>
                  <div className="flex justify-center gap-4">
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        update((x) => beginAgain(x, today));
                        setAsking(null);
                        setJustFell(true);
                      }}
                    >
                      {tj.fellYes}
                    </button>
                    <button type="button" className={quiet} onClick={() => setAsking(null)}>
                      {tj.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className={quiet} onClick={() => setAsking("fell")}>
                  {tj.fell}
                </button>
              )}
            </div>
            {justFell && (
              <div className="mt-6 rounded-[16px] border border-gold/40 bg-panel/60 px-5 py-4 font-serif text-[17px] leading-8">
                <p>{tj.fellWord}</p>
                <Link href="/people/peter" className={`${gold} mt-2 inline-block hover:underline`}>
                  {tj.fellLink} →
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <section className={card}>
        <label htmlFor="journal-write" className="font-display text-2xl font-semibold">
          {tj.write}
        </label>
        <p className="mt-1 font-serif text-[16px] text-muted">{tj.writeHint}</p>
        <textarea
          id="journal-write"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          maxLength={4000}
          className="mt-4 w-full rounded-[14px] border border-border bg-background/60 px-4 py-3 font-serif text-[17px] leading-7 outline-none focus:border-gold/60"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className={button}
            disabled={!draft.trim()}
            onClick={() => {
              update((x) => addEntry(x, today, draft));
              setDraft("");
            }}
          >
            {tj.save}
          </button>
        </div>
        {j.entries.length > 0 && (
          <div className="mt-8">
            <p className={gold}>{tj.entries}</p>
            <ul className="mt-3 space-y-4">
              {j.entries.map((e, i) => (
                <li key={`${e.day}-${i}`} className="border-l-2 border-gold/40 pl-4">
                  <p className="font-caps text-[11px] tracking-[0.14em] text-muted">{ethDate(e.day)}</p>
                  <p className="mt-1 whitespace-pre-wrap font-serif text-[17px] leading-7">{e.text}</p>
                  <button type="button" className={`${quiet} mt-1`} onClick={() => update((x) => removeEntry(x, i))}>
                    {tj.remove}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-[22px] border border-gold/40 bg-panel/60 px-6 py-7 sm:px-8">
        <p className={gold}>{tj.prayerHeading}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist">
          {PRAYERS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === prayerId}
              onClick={() => setPrayerId(p.id)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                p.id === prayerId ? "border-gold bg-gold/15 text-foreground" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {t.story.prayer.titles[p.id]}
            </button>
          ))}
        </div>
        <blockquote lang={lines === prayer.linesAm ? "am" : "en"} className="mt-5 space-y-3 font-serif text-[18px] leading-8">
          {lines.map((l, i) => (
            <p key={i}>
              {i > 0 && "… "}
              {l}
            </p>
          ))}
        </blockquote>
        <p className="mt-3 text-[13px] text-muted">{lang === "am" && prayer.linesAm ? prayer.refAm : prayer.ref}</p>
      </section>

      <section className="text-center">
        <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
          <Lock className="h-3.5 w-3.5 text-gold/80" />
          {tj.privacy}
        </p>
        <div className="mt-4">
          {asking === "erase" ? (
            <div className="space-y-3">
              <p className="font-serif text-[16px]">{tj.eraseAsk}</p>
              <div className="flex justify-center gap-4">
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    erase();
                    setAsking(null);
                    setJustFell(false);
                  }}
                >
                  {tj.eraseYes}
                </button>
                <button type="button" className={quiet} onClick={() => setAsking(null)}>
                  {tj.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={quiet} onClick={() => setAsking("erase")}>
              {tj.erase}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
