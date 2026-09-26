import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FIGURES } from "@/lib/scripture/figures";
import { figureStory, type StoryPart } from "@/lib/scripture/retrieve-struggle";
import { SITE_URL } from "@/lib/telegram";

import { artByline, artFor } from "../../art";
import { ArtImage } from "../../components/ArtImage";
import { ClosingCta } from "../../components/HomeSections";
import { ArrowRight } from "../../components/Icons";
import { ShareStory } from "../../components/ShareStory";
import { SymbolPlate } from "../../components/SymbolPlate";
import { figureText } from "../../i18n/dict";
import { getDict } from "../../i18n/server";
import { readablePeople, readerNote, storyRefs, tagLabel } from "../../people";

type Params = { params: Promise<{ id: string }> };

function findPerson(id: string) {
  return readablePeople(FIGURES).find((f) => f.id === id);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const f = findPerson((await params).id);
  if (!f) return {};
  const { lang } = await getDict();
  const text = figureText(lang, f);
  const art = artFor(f.id);
  return {
    title: `${text.name} — Not Alone`,
    description: text.summary,
    openGraph: {
      title: `${text.name} — Not Alone`,
      description: text.summary,
      url: `/people/${f.id}`,
      // Each painting has a 1200×630 crop made by scripts/og-images.ts; without one, the site image is used.
      images: art ? [{ url: `/art/og/${f.id}.jpg`, width: 1200, height: 630, alt: art.caption }] : undefined,
    },
    twitter: { card: "summary_large_image", title: `${text.name} — Not Alone`, description: text.summary },
  };
}

/**
 * One person, told by the text itself: their painting, what they did, and the
 * passages of their fall and restoration read straight from the corpus — no
 * model, so it works even when the day's answer quota is spent. Shareable.
 */
export default async function PersonPage({ params }: Params) {
  const f = findPerson((await params).id);
  if (!f) notFound();
  const { lang, t } = await getDict();
  const tp = t.person;
  const text = figureText(lang, f);
  const note = lang === "am" ? t.notes[f.id] : readerNote(f);
  const art = artFor(f.id);

  let parts: StoryPart[] | null = null;
  try {
    parts = await figureStory(f);
  } catch (err) {
    console.error(`person page ${f.id}:`, err);
  }
  const refs = storyRefs(f);
  const heading = { fall: tp.fall, restoration: tp.rise, context: tp.context };

  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="absolute inset-0" aria-hidden={!art}>
          {art ? (
            <ArtImage id={f.id} eager sizes="100vw" className="h-full w-full" />
          ) : (
            <SymbolPlate id={f.id} className="h-full w-full" />
          )}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-[var(--background)]/70 to-[var(--background)] min-[900px]:bg-gradient-to-r min-[900px]:from-[var(--background)] min-[900px]:via-[var(--background)]/80 min-[900px]:to-transparent"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-[38vh] sm:px-6 min-[900px]:min-h-[560px] min-[900px]:pb-20 min-[900px]:pt-24">
          <Link
            href={`/people#${f.id}`}
            className="font-caps text-[12px] font-semibold tracking-[0.2em] text-muted hover:text-foreground"
          >
            ← {tp.back}
          </Link>
          <p className="mt-6 font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">
            {f.kind === "tradition" ? t.people.tradition : t.people.scripture}
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-[2.8rem] font-semibold leading-[1.02] sm:text-7xl">
            {text.name}
          </h1>
          <p className="mt-5 max-w-xl font-serif text-[20px] leading-8">{text.summary}</p>
          {note && <p className="mt-4 max-w-xl text-sm italic leading-6 text-muted">{note}</p>}
          <ul className="mt-6 flex flex-wrap gap-1.5">
            {f.sins.map((s) => (
              <li key={s} className="rounded-full bg-panel/80 px-2.5 py-0.5 text-xs text-muted">
                {t.tags[s] ?? tagLabel(s)}
              </li>
            ))}
          </ul>
        </div>
        {art && (
          <p className="absolute bottom-3 right-4 hidden text-right text-xs text-muted min-[900px]:block sm:right-6">
            {art.caption} · {artByline(art)} · {art.license}
          </p>
        )}
      </section>

      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {parts && parts.length > 0 ? (
          <>
            <p className="text-sm text-muted">{tp.fromText}</p>
            {parts.map((part, i) => (
              <section key={`${part.role}-${i}`} className="mt-12">
                {(i === 0 || parts![i - 1].role !== part.role) && (
                  <h2 className="font-display text-3xl font-semibold sm:text-4xl">{heading[part.role]}</h2>
                )}
                <ol className="mt-6 space-y-8">
                  {part.passages.map((p) => (
                    <li key={p.id} className="border-l-2 border-gold/60 pl-5">
                      <cite className="text-sm font-medium not-italic text-gold">{p.ref}</cite>
                      <blockquote
                        lang="en"
                        className="mt-2 whitespace-pre-wrap font-serif text-[18px] leading-8 text-foreground/90"
                      >
                        {p.content}
                      </blockquote>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        ) : (
          <div>
            <p className="text-muted">{tp.unavailable}</p>
            <dl className="mt-6 space-y-2 leading-7">
              {refs.fall.length > 0 && (
                <div>
                  <dt className="inline text-muted">{tp.fall} · </dt>
                  <dd className="inline">{refs.fall.join("; ")}</dd>
                </div>
              )}
              {refs.restoration.length > 0 && (
                <div>
                  <dt className="inline text-muted">{tp.rise} · </dt>
                  <dd className="inline">{refs.restoration.join("; ")}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="mt-16 border-t border-border pt-10">
          <ShareStory url={`${SITE_URL}/people/${f.id}`} name={text.name} />
          <a
            href="https://t.me/U_not_the_only_bot"
            target="_blank"
            rel="noreferrer"
            className="group mt-8 inline-flex items-center gap-2 text-sm text-muted underline underline-offset-4 hover:text-foreground"
          >
            {tp.bot}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </div>
      </div>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
