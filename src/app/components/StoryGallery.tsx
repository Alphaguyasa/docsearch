import Link from "next/link";

import { artFor } from "@/app/art";
import { readablePeople } from "@/app/people";
import { FIGURES } from "@/lib/scripture/figures";

import { ArtImage } from "./ArtImage";
import { ArrowRight } from "./Icons";
import { RevealGroup, Tilt } from "./Motion";

/**
 * The home page's gallery: the people, each in the painting of their story.
 * A horizontal strip that scrolls with a thumb on phones and becomes a grid on
 * large screens. Only people with a painting are shown here.
 */
export function StoryGallery() {
  const people = readablePeople(FIGURES).filter((f) => artFor(f.id));
  return (
    <section aria-labelledby="gallery-heading" className="mt-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">They fell, too</p>
          <h2 id="gallery-heading" className="mt-2 font-display text-4xl font-semibold leading-tight">
            Holy people, true stories
          </h2>
        </div>
        <Link href="/people" className="shrink-0 text-sm text-muted underline underline-offset-4 hover:text-foreground">
          All {readablePeople(FIGURES).length} people
        </Link>
      </div>
      <RevealGroup
        as="ul"
        className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4"
      >
        {people.slice(0, 8).map((f, i) => (
          <li
            key={f.id}
            data-reveal
            style={{ "--i": i % 4 } as React.CSSProperties}
            className="w-[72vw] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none"
          >
            <Tilt
              as={Link}
              href={`/people#${f.id}`}
              className="candle-glare lit-border group relative block overflow-hidden rounded-sm border border-border bg-card shadow-[0_24px_50px_-28px_rgb(0_0_0_/_0.9)]"
            >
              <div className="art-frame">
                <ArtImage
                  id={f.id}
                  sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 72vw"
                  className="aspect-[3/4] w-full"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent transition-opacity duration-700 group-hover:opacity-80" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-[#f1e9dc] transition-transform duration-700 [transition-timing-function:var(--ease-out)] group-hover:-translate-y-1">
                <p className="font-display text-2xl font-semibold leading-tight">{f.name}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-white/75">{f.summary}</p>
                <span className="mt-3 flex items-center gap-2 font-caps text-[10px] tracking-[0.22em] text-[#e8b560] opacity-0 transition-opacity duration-700 group-hover:opacity-100">
                  Read their story <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Tilt>
          </li>
        ))}
      </RevealGroup>
    </section>
  );
}
