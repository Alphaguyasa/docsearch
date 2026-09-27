"use client";

import { prayerFor } from "@/lib/scripture/prayers";
import { useT } from "../i18n/client";

/**
 * A short prayer of repentance under a story, chosen by its struggle and
 * quoted word for word from Scripture — something to do after reading.
 */
export function PrayerCard({ tags, figureId }: { tags: readonly string[]; figureId?: string }) {
  const { lang, t } = useT();
  const p = prayerFor(tags, figureId);
  const tp = t.story.prayer;
  return (
    <section className="rise mt-12 rounded-[22px] border border-gold/40 bg-panel/60 px-6 py-7 sm:px-8">
      <p className="font-caps text-[12px] font-semibold tracking-[0.14em] text-gold">{tp.label}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold">{tp.titles[p.id]}</h2>
      <blockquote lang="en" className="mt-4 space-y-3 font-serif text-[18px] italic leading-8 text-foreground/90">
        {p.lines.map((line, i) => (
          <p key={i}>
            {i > 0 && "… "}
            {line}
          </p>
        ))}
        <p className="not-italic">Amen.</p>
      </blockquote>
      <p className="mt-4 text-sm text-muted">
        {lang === "am" ? p.refAm : p.ref} · {tp.note}
      </p>
    </section>
  );
}
