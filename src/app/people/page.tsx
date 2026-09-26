import Link from "next/link";

import { FIGURES } from "@/lib/scripture/figures";

import { artByline, artFor, artSrc } from "../art";
import { CandleScene } from "../components/CandleScene";
import { ArtImage } from "../components/ArtImage";
import { FigureSymbol } from "../components/FigureSymbol";
import { readablePeople, readerNote, storyRefs, tagLabel, TRADITION_NAMES } from "../people";

export const metadata = { title: "People — Not Alone" };

/** Every person in the library: their symbol, their fall, their restoration, where to read it. Static — no DB. */
export default function PeoplePage() {
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
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-[34vh] sm:px-6 min-[900px]:min-h-[520px] min-[900px]:pb-20 min-[900px]:pt-24">
          <p className="text-sm uppercase tracking-[0.18em] text-gold">The people</p>
          <h1 className="mt-3 max-w-2xl font-serif text-[2.1rem] leading-[1.1] sm:text-5xl">
            They fell. They were not left there.
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-7 text-muted">
            {people.length} people from Scripture and the Church Fathers — kings, apostles, a prostitute, a robber,
            a tax collector. Each story is read from the text itself, never retold from memory.
          </p>
        </div>
        {l && (
          <p className="absolute bottom-3 right-4 hidden text-right text-xs text-muted min-[900px]:block sm:right-6">
            {l.caption} · {artByline(l)} · {l.license}
          </p>
        )}
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((f, i) => {
            const everywhere = f.traditions.length === 4;
            const { fall, restoration } = storyRefs(f);
            const note = readerNote(f);
            return (
              <li
                key={f.id}
                id={f.id}
                className="rise group flex scroll-mt-20 flex-col overflow-hidden border border-border bg-card p-5"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                {artFor(f.id) ? (
                  <div className="relative -mx-5 -mt-5 mb-4 overflow-hidden">
                    <ArtImage
                      id={f.id}
                      sizes="(min-width: 1024px) 330px, (min-width: 640px) 50vw, 100vw"
                      className="aspect-[4/3] w-full transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3 text-[#f1e9dc]">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/25 bg-black/40 text-[#e8b560] backdrop-blur-sm">
                        <FigureSymbol id={f.id} className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-serif text-xl leading-tight">{f.name}</h2>
                        <p className="text-xs uppercase tracking-wider text-white/70">
                          {f.kind === "tradition" ? "Church tradition" : "Scripture"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 flex items-start gap-4">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-border bg-panel text-gold">
                      <FigureSymbol id={f.id} className="h-11 w-11" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-serif text-xl leading-tight">{f.name}</h2>
                      <p className="mt-1 text-xs uppercase tracking-wider text-muted">
                        {f.kind === "tradition" ? "Church tradition" : "Scripture"}
                      </p>
                    </div>
                  </div>
                )}

                <p className="font-serif text-[17px] leading-7">{f.summary}</p>

                <dl className="mt-4 space-y-2 text-sm leading-6">
                  {fall.length > 0 && (
                    <div>
                      <dt className="inline text-muted">The fall · </dt>
                      <dd className="inline">{fall.join("; ")}</dd>
                    </div>
                  )}
                  {restoration.length > 0 && (
                    <div>
                      <dt className="inline text-muted">The restoration · </dt>
                      <dd className="inline">{restoration.join("; ")}</dd>
                    </div>
                  )}
                </dl>

                {note && <p className="mt-3 text-sm italic leading-6 text-muted">{note}</p>}

                <div className="mt-auto pt-4">
                  <ul className="flex flex-wrap gap-1.5">
                    {f.sins.map((s) => (
                      <li key={s} className="rounded-full bg-panel px-2.5 py-0.5 text-xs text-muted">
                        {tagLabel(s)}
                      </li>
                    ))}
                  </ul>
                  {!everywhere && (
                    <p className="mt-2 text-xs text-muted">
                      Honoured in {f.traditions.map((t) => TRADITION_NAMES[t]).join(", ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-12 border-t border-border pt-8 text-center">
          <p className="font-serif text-xl">Whatever you are carrying, someone here carried it first.</p>
          <Link
            href="/#struggle"
            className="mt-4 inline-block rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Tell what you are carrying
          </Link>
        </div>
      </div>
    </main>
  );
}
