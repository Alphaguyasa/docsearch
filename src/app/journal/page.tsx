import type { Metadata } from "next";

import { JournalBook } from "../components/JournalBook";
import { getDict } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.journal.eyebrow} — Not Alone`, description: t.journal.intro };
}

/** A private journal of days, prayers and notes, kept only on the reader's phone. */
export default async function JournalPage() {
  const { t } = await getDict();
  const tj = t.journal;
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 pb-14 pt-24 sm:px-6 sm:pb-16 sm:pt-28">
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{tj.eyebrow}</p>
          <h1 className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">{tj.title}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[19px] leading-8 text-muted">{tj.intro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <JournalBook />
      </div>
    </main>
  );
}
