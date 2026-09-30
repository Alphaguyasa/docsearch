import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FIGURES } from "@/lib/scripture/figures";
import { SITE_URL } from "@/lib/telegram";

import { artFor } from "../../art";
import { ArtImage } from "../../components/ArtImage";
import { JsonLd } from "../../components/JsonLd";
import { ClosingCta } from "../../components/HomeSections";
import { ArrowRight } from "../../components/Icons";
import { SymbolPlate } from "../../components/SymbolPlate";
import { figureText } from "../../i18n/dict";
import { getDict } from "../../i18n/server";
import { STRUGGLES, STRUGGLE_IDS, peopleForStruggle } from "../../struggles";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const s = STRUGGLES[id];
  if (!s) return {};
  const { lang, t } = await getDict();
  return {
    title: `${s[lang].h1} — Not Alone`,
    description: `${t.struggles.intro} ${peopleForStruggle(id, FIGURES)
      .slice(0, 4)
      .map((f) => figureText(lang, f).name)
      .join(", ")}.`,
  };
}

/**
 * "Bible stories for anyone struggling with lying": the people who fell that
 * way, each linking to their story read straight from the text. Written in
 * the words people search with, in English and Amharic.
 */
export default async function StrugglePage({ params }: Params) {
  const { id } = await params;
  const s = STRUGGLES[id];
  if (!s) notFound();
  const { lang, t } = await getDict();
  const ts = t.struggles;
  const people = peopleForStruggle(id, FIGURES);

  const structured = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: s[lang].h1,
    description: ts.intro,
    inLanguage: lang,
    url: `${SITE_URL}/struggles/${id}?lang=${lang}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: people.map((f, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: figureText(lang, f).name,
        url: `${SITE_URL}/people/${f.id}?lang=${lang}`,
      })),
    },
  };

  return (
    <main>
      <JsonLd data={structured} />
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
          <Link
            href="/struggles"
            className="font-caps text-[12px] font-semibold tracking-[0.2em] text-muted hover:text-foreground"
          >
            ← {ts.nav}
          </Link>
          <p className="mt-6 font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{ts.eyebrow}</p>
          <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] sm:text-6xl">{s[lang].h1}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[19px] leading-8 text-muted">{ts.intro}</p>
          <figure className="mt-8 max-w-2xl rounded-r-2xl border-l-2 border-gold/70 bg-white/[0.04] px-5 py-4">
            <figcaption className="text-sm text-muted">{ts.perhaps}</figcaption>
            <blockquote className="mt-1 font-serif text-[20px] italic leading-8">“{s[lang].example}”</blockquote>
          </figure>
          <Link
            href="/#struggle"
            className="group mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-7 py-3 font-caps text-[13px] font-semibold tracking-[0.16em] text-background transition-shadow duration-300 hover:shadow-[0_0_40px_-6px_rgb(232_181_96_/_0.8)]"
          >
            {ts.tell}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((f) => {
            const text = figureText(lang, f);
            return (
              <li key={f.id}>
                <Link
                  href={`/people/${f.id}`}
                  className="candle-glare lit-border group flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_30px_60px_-34px_rgb(0_0_0_/_0.9)] transition-colors hover:border-gold/40"
                >
                  <div className="art-frame relative">
                    {artFor(f.id) ? (
                      <ArtImage
                        id={f.id}
                        sizes="(min-width: 1024px) 330px, (min-width: 640px) 50vw, 100vw"
                        className="aspect-[4/3] w-full"
                      />
                    ) : (
                      <SymbolPlate id={f.id} className="aspect-[4/3] w-full" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="font-display text-2xl font-semibold leading-tight">{text.name}</h2>
                    <p className="mt-2 flex-1 font-serif text-[17px] leading-7 text-muted">{text.summary}</p>
                    <span className="mt-4 inline-flex items-center gap-2 font-caps text-[12px] font-semibold tracking-[0.18em] text-gold">
                      {ts.read}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <nav aria-labelledby="others-heading" className="mt-16 border-t border-border pt-10">
          <h2 id="others-heading" className="font-caps text-[12px] font-semibold tracking-[0.2em] text-gold">
            {ts.others}
          </h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {STRUGGLE_IDS.filter((x) => x !== id).map((x) => (
              <li key={x}>
                <Link
                  href={`/struggles/${x}`}
                  className="inline-flex min-h-10 items-center rounded-full bg-foreground/[0.06] px-4 text-[14px] ring-1 ring-foreground/10 transition-colors hover:bg-foreground/[0.1]"
                >
                  {t.groups[x]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
