import type { Metadata } from "next";

import { ClosingCta } from "../components/HomeSections";
import { JourneyList } from "../components/Journey";
import { getDict } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.journey.title} — Not Alone`, description: t.journey.intro };
}

/** Forty days, one person a day who fell and came back. */
export default async function JourneyPage() {
  const { t } = await getDict();
  const tj = t.journey;
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{tj.eyebrow}</p>
          <h1 className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">{tj.title}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[19px] leading-8 text-muted">{tj.intro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <JourneyList />
      </div>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
