import Link from "next/link";

import { FIGURES } from "@/lib/scripture/figures";

import { artByline, artFor, artSrc } from "../art";
import { CandleScene } from "../components/CandleScene";
import { ArtImage } from "../components/ArtImage";
import { FigureSymbol } from "../components/FigureSymbol";
import { ArrowRight } from "../components/Icons";
import { RevealGroup, Tilt } from "../components/Motion";
import { ClosingCta } from "../components/HomeSections";
import { PeopleFilter } from "../components/PeopleFilter";
import { SymbolPlate } from "../components/SymbolPlate";
import { figureText } from "../i18n/dict";
import { getDict } from "../i18n/server";
import { groupCounts, groupsFor, readablePeople, readerNote, storyRefs, tagLabel } from "../people";

export const metadata = { title: "People — Not Alone" };

/** Every person in the library: their symbol, their fall, their restoration, where to read it. Static — no DB. */
export default async function PeoplePage() {
  const { lang, t } = await getDict();
  const tp = t.people;
  const people = readablePeople(FIGURES);
  const l = artFor("lalibela");
  const lalibela = l && {
    small: artSrc("lalibela", 800),
    large: artSrc("lalibela", 1600),
    aspect: l.width / l.height,
    alt: `${l.caption}, ${artByline(l)}`,
  };
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <CandleScene painting={lalibela} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--background)]/10 via-[var(--background)]/60 to-[var(--background)] min-[900px]:bg-gradient-to-r min-[900px]:from-[var(--background)] min-[900px]:via-[var(--background)]/70 min-[900px]:to-transparent"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-[34vh] sm:px-6 min-[900px]:min-h-[560px] min-[900px]:pb-24 min-[900px]:pt-28">
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{tp.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-[2.8rem] font-semibold leading-[1.02] sm:text-7xl">
            {tp.title}
          </h1>
          <p className="mt-5 max-w-xl font-serif text-[19px] leading-8 text-muted">{tp.intro(people.length)}</p>
        </div>
        {l && (
          <p className="absolute bottom-3 right-4 hidden text-right text-xs text-muted min-[900px]:block sm:right-6">
            {l.caption} · {artByline(l)} · {l.license}
          </p>
        )}
      </section>

      <PeopleFilter total={people.length} counts={groupCounts(people)}>
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
          <RevealGroup as="ul" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((f, i) => {
              const everywhere = f.traditions.length === 4;
              const { fall, restoration } = storyRefs(f);
              const note = lang === "am" ? t.notes[f.id] : readerNote(f);
              const text = figureText(lang, f);
              return (
                <li
                  key={f.id}
                  id={f.id}
                  data-reveal
                  data-groups={groupsFor(f.sins)}
                  className="scroll-mt-32"
                  style={{ "--i": i % 3 } as React.CSSProperties}
                >
                  <Tilt
                    max={3}
                    className="paper candle-glare lit-border group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border p-6 shadow-[0_30px_60px_-34px_rgb(0_0_0_/_0.9)] hover:border-gold/40 hover:shadow-[0_40px_70px_-30px_rgb(0_0_0_/_1),0_0_50px_-20px_rgb(232_181_96_/_0.35)]"
                  >
                    <div className="art-frame relative -mx-6 -mt-6 mb-5">
                      {artFor(f.id) ? (
                        <ArtImage
                          id={f.id}
                          sizes="(min-width: 1024px) 330px, (min-width: 640px) 50vw, 100vw"
                          className="aspect-[4/3] w-full"
                        />
                      ) : (
                        <SymbolPlate id={f.id} className="aspect-[4/3] w-full pb-[14%]" />
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3 text-[#f1e9dc]">
                        {artFor(f.id) && (
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/25 bg-black/40 text-[#e8b560] backdrop-blur-sm">
                            <FigureSymbol id={f.id} className="h-7 w-7" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h2 className="font-display text-2xl font-semibold leading-tight">{text.name}</h2>
                          <p className="font-caps text-[11px] tracking-[0.2em] text-white/70">
                            {f.kind === "tradition" ? tp.tradition : tp.scripture}
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="font-serif text-[17px] leading-7">{text.summary}</p>

                    <dl className="mt-4 space-y-2 text-sm leading-6">
                      {fall.length > 0 && (
                        <div>
                          <dt className="inline text-muted">{tp.fall} · </dt>
                          <dd className="inline">{fall.join("; ")}</dd>
                        </div>
                      )}
                      {restoration.length > 0 && (
                        <div>
                          <dt className="inline text-muted">{tp.rise} · </dt>
                          <dd className="inline">{restoration.join("; ")}</dd>
                        </div>
                      )}
                    </dl>

                    {note && <p className="mt-3 text-sm italic leading-6 text-muted">{note}</p>}

                    <Link
                      href={`/people/${f.id}`}
                      className="group/link mt-5 inline-flex min-h-11 items-center gap-2 self-start font-caps text-[12px] font-semibold tracking-[0.18em] text-gold after:absolute after:inset-0 after:content-['']"
                    >
                      {t.person.readStory}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-1" />
                    </Link>

                    <div className="mt-auto pt-4">
                      <ul className="flex flex-wrap gap-1.5">
                        {f.sins.map((s) => (
                          <li key={s} className="rounded-full bg-panel px-2.5 py-0.5 text-xs text-muted">
                            {t.tags[s] ?? tagLabel(s)}
                          </li>
                        ))}
                      </ul>
                      {!everywhere && (
                        <p className="mt-2 text-xs text-muted">
                          {tp.honoured(
                            f.traditions
                              .map((tr) => t.church.options[tr as keyof typeof t.church.options])
                              .join(lang === "am" ? "፣ " : ", "),
                          )}
                        </p>
                      )}
                    </div>
                  </Tilt>
                </li>
              );
            })}
          </RevealGroup>
        </div>
      </PeopleFilter>
      <ClosingCta href="/#struggle" />
    </main>
  );
}
