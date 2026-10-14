import type { Metadata } from "next";
import Link from "next/link";

import { ABOUT } from "../about";
import { ArrowRight } from "../components/Icons";
import { getDict } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getDict();
  return { title: `${ABOUT[lang].title} — Not Alone`, description: ABOUT[lang].intro };
}

/** What Not Alone is, where its words come from, how stories are written, and what is kept. */
export default async function AboutPage() {
  const { lang, t } = await getDict();
  const a = ABOUT[lang];
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{a.eyebrow}</p>
          <h1 className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">{a.title}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[19px] leading-8 text-muted">{a.intro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {a.sections.map((s) => (
          <section key={s.title} className="mt-12 first:mt-0">
            <h2 className="font-display text-3xl font-semibold">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 24)} className="mt-4 leading-7">
                {p}
              </p>
            ))}
          </section>
        ))}
        <div className="mt-14 flex flex-wrap gap-3">
          <Link
            href="/help"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-care px-5 text-sm font-medium text-background"
          >
            {t.footer.helpNow}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/return"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-sm hover:border-gold/60"
          >
            {t.footer.comingBack}
          </Link>
        </div>
      </div>
    </main>
  );
}
