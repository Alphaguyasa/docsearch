import type { Metadata } from "next";
import Link from "next/link";

import { FIGURES } from "@/lib/scripture/figures";

import { ClosingCta } from "../components/HomeSections";
import { ArrowRight } from "../components/Icons";
import { getDict } from "../i18n/server";
import { STRUGGLES, STRUGGLE_IDS, peopleForStruggle } from "../struggles";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.struggles.indexTitle} — Not Alone`, description: t.struggles.indexIntro };
}

/** Every struggle, each opening the stories of the people who fell that way. */
export default async function StrugglesPage() {
  const { lang, t } = await getDict();
  const ts = t.struggles;
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{ts.eyebrow}</p>
          <h1 className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">{ts.indexTitle}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[19px] leading-8 text-muted">{ts.indexIntro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {STRUGGLE_IDS.map((id) => (
            <li key={id}>
              <Link
                href={`/struggles/${id}`}
                className="group flex h-full items-center justify-between gap-4 rounded-[20px] border border-border bg-card px-6 py-5 transition-colors hover:border-gold/40"
              >
                <div>
                  <h2 className="font-display text-2xl font-semibold leading-tight">{t.groups[id]}</h2>
                  <p className="mt-1 text-sm text-muted">{STRUGGLES[id][lang].h1}</p>
                  <p className="mt-2 font-caps text-[11px] font-semibold tracking-[0.18em] text-gold">
                    {ts.count(peopleForStruggle(id, FIGURES).length)}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-gold transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
