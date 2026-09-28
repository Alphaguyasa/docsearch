import type { Metadata } from "next";

import { LIBRARY, LIBRARY_PAGE } from "../library";
import { ClosingCta } from "../components/HomeSections";
import { getDict } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getDict();
  const p = LIBRARY_PAGE[lang];
  return { title: `${p.eyebrow} — Not Alone`, description: p.intro };
}

/** Every book the stories are read from, grouped by where it comes from. */
export default async function LibraryPage() {
  const { lang, t } = await getDict();
  const p = LIBRARY_PAGE[lang];
  const churches = t.church.options as Record<string, string>;
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
        {LIBRARY.map((g) => (
          <section key={g.title.en} className="mt-14 first:mt-0">
            <h2 className="font-display text-3xl font-semibold">{g.title[lang]}</h2>
            <ul className="mt-6 space-y-7">
              {g.books.map((b) => (
                <li key={b.title.en} className="border-l-2 border-gold/50 pl-5">
                  <p className="font-serif text-[20px] font-semibold leading-7">{b.title[lang]}</p>
                  <p className="mt-1 text-sm text-muted">{b.by[lang]}</p>
                  <p className="mt-2 leading-7">{b.note[lang]}</p>
                  {b.onlyFor && (
                    <p className="mt-2 text-[13px] text-gold">
                      {p.shownTo} {b.onlyFor.map((c) => churches[c] ?? c).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-14 text-sm leading-6 text-muted">{p.missing}</p>
      </div>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
