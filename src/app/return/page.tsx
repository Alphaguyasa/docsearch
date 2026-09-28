import type { Metadata } from "next";
import Link from "next/link";

import { ClosingCta } from "../components/HomeSections";
import { ArrowRight } from "../components/Icons";
import { PrayerCard } from "../components/PrayerCard";
import { getDict } from "../i18n/server";
import { RETURN_PAGE, RETURN_STEPS } from "../return";

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getDict();
  const p = RETURN_PAGE[lang];
  return { title: `${p.title} — Not Alone`, description: p.intro };
}

/** A few plain steps back to God, each on a verse quoted from the text. */
export default async function ReturnPage() {
  const { lang } = await getDict();
  const p = RETURN_PAGE[lang];
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{p.eyebrow}</p>
          <h1 className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">{p.title}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[19px] leading-8 text-muted">{p.intro}</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ol className="space-y-12">
          {RETURN_STEPS.map((s, i) => (
            <li key={s.ref} className="flex gap-5">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/50 font-display text-lg font-semibold text-gold"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-semibold sm:text-3xl">{s[lang].title}</h2>
                <p className="mt-3 leading-7">{s[lang].body}</p>
                <blockquote className="mt-4 border-l-2 border-gold/60 pl-5">
                  <p lang="en" className="font-serif text-[18px] italic leading-8 text-foreground/90">
                    “{s.quote}”
                  </p>
                  <cite className="mt-2 block text-sm font-medium not-italic text-gold">
                    {lang !== "am" ? s.ref : s.ref.startsWith("Ethiopian Synaxarium") ? s.refAm : `${s.refAm} · ${p.readIn}`}
                  </cite>
                </blockquote>
              </div>
            </li>
          ))}
        </ol>
        <PrayerCard tags={[]} showReturn={false} />
        <Link
          href="/people"
          className="group mt-10 flex items-center gap-2 text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          {p.stories}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
