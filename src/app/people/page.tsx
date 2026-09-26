import Link from "next/link";

import { FIGURES } from "@/lib/scripture/figures";

import { FigureSymbol } from "../components/FigureSymbol";
import { readablePeople, readerNote, storyRefs, tagLabel, TRADITION_NAMES } from "../people";

export const metadata = { title: "People — Not Alone" };

/** Every person in the library: their symbol, their fall, their restoration, where to read it. Static — no DB. */
export default function PeoplePage() {
  const people = readablePeople(FIGURES);
  return (
    <main>
      <section className="night relative overflow-hidden border-b border-border">
        <div className="candle-still absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          <p className="text-sm uppercase tracking-[0.18em] text-gold">The people</p>
          <h1 className="mt-3 max-w-2xl font-serif text-[2.1rem] leading-[1.1] sm:text-5xl">
            They fell. They were not left there.
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-7 text-muted">
            {people.length} people from Scripture and the Church Fathers — kings, apostles, a prostitute, a robber,
            a tax collector. Each story is read from the text itself, never retold from memory.
          </p>
        </div>
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
                className="rise flex scroll-mt-20 flex-col border border-border bg-card p-5"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <div className="flex items-start gap-4">
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

                <p className="mt-4 font-serif text-[17px] leading-7">{f.summary}</p>

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
