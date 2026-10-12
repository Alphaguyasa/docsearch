"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { churchDay, type ChurchDay } from "@/lib/ethiopian-calendar";

import { useT } from "../i18n/client";

/**
 * Today's Ethiopian date, the feast the Church keeps and the fast it keeps,
 * worked out from the calendar after mount (the day turns in Addis Ababa).
 * In the seasons of repentance it points to the 40-day journey.
 */
export function ChurchToday() {
  const { t } = useT();
  const [day, setDay] = useState<ChurchDay | null>(null);
  useEffect(() => setDay(churchDay(new Date())), []);
  if (!day) return <div className="min-h-[88px]" aria-hidden />;

  const c = t.churchDay;
  const { date, feast, monthly, fast } = day;
  const title = feast ? c.feasts[feast] : fast ? c.fasts[fast].name : monthly ? c.monthly(c.saints[monthly]) : null;
  const lines = [
    feast && fast ? c.fasts[fast].name : null,
    (feast || fast) && monthly ? c.monthly(c.saints[monthly]) : null,
    fast ? c.fasts[fast].note : null,
  ].filter(Boolean) as string[];

  return (
    <aside aria-labelledby="church-heading" className="rise rounded-[18px] border border-border bg-card/70 px-5 py-4 sm:px-6">
      <p id="church-heading" className="font-caps text-[12px] font-semibold tracking-[0.18em] text-gold">
        {c.eyebrow} · {c.date(c.months[date.month - 1], date.day, date.year)}
      </p>
      {title && <p className="mt-2 font-display text-xl font-semibold leading-snug sm:text-2xl">{title}</p>}
      {lines.map((l) => (
        <p key={l} className="mt-1 font-serif text-[16px] leading-7 text-muted">
          {l}
        </p>
      ))}
      {(fast === "hudade" || fast === "nineveh") && (
        <Link href="/journey" className="mt-2 inline-block font-caps text-[12px] font-semibold tracking-[0.16em] text-gold hover:underline">
          {c.journey} →
        </Link>
      )}
    </aside>
  );
}
