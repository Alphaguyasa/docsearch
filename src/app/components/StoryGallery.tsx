import Link from "next/link";

import { artFor } from "@/app/art";
import { readablePeople } from "@/app/people";
import { FIGURES } from "@/lib/scripture/figures";

import { ArtImage } from "./ArtImage";

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
          <p className="text-sm uppercase tracking-[0.16em] text-gold">They fell, too</p>
          <h2 id="gallery-heading" className="mt-2 font-serif text-3xl leading-tight">
            Holy people, true stories
          </h2>
        </div>
        <Link href="/people" className="shrink-0 text-sm text-muted underline underline-offset-4 hover:text-foreground">
          All {readablePeople(FIGURES).length} people
        </Link>
      </div>
      <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {people.slice(0, 8).map((f) => (
          <li key={f.id} className="w-[72vw] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none [perspective:900px]">
            <Link
              href={`/people#${f.id}`}
              className="group relative block overflow-hidden border border-border bg-card transition-transform duration-500 [transform-style:preserve-3d] hover:[transform:rotateY(-6deg)_rotateX(3deg)]"
            >
              <ArtImage id={f.id} sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 72vw" className="aspect-[3/4] w-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-[#f1e9dc]">
                <p className="font-serif text-xl leading-tight">{f.name}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-white/75">{f.summary}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
