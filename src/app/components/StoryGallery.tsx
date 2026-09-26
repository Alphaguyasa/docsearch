"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { artFor } from "@/app/art";
import { readablePeople } from "@/app/people";
import { FIGURES } from "@/lib/scripture/figures";

import { ArtImage } from "./ArtImage";
import { ArrowRight } from "./Icons";
import { RevealGroup, Tilt } from "./Motion";
import { SymbolPlate } from "./SymbolPlate";
import { useT } from "../i18n/client";
import { figureText } from "../i18n/dict";

/**
 * "Holy people, true stories": every person in one row that scrolls
 * sideways — a thumb on phones, the round arrows (or a trackpad) on desktop —
 * snapping card by card. The row starts aligned with the page's text column
 * and runs off the right edge, inviting the swipe.
 */
export function StoryGallery() {
  const people = readablePeople(FIGURES);
  const track = useRef<HTMLElement>(null);
  const { lang, t } = useT();
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section aria-labelledby="gallery-heading" className="py-24 sm:py-32">
      <div className="mx-auto flex max-w-6xl items-end justify-between gap-4 px-4 sm:px-6">
        <div>
          <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{t.gallery.eyebrow}</p>
          <h2 id="gallery-heading" className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
            {t.gallery.heading}
          </h2>
        </div>
        <Link
          href="/people"
          className="group hidden shrink-0 items-center gap-1.5 text-[15px] text-accent hover:underline sm:inline-flex"
        >
          {t.gallery.all(readablePeople(FIGURES).length)}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <RevealGroup
        as="ul"
        elRef={track}
        className="gallery-track mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {people.map((f, i) => (
          <li
            key={f.id}
            data-reveal
            style={{ "--i": Math.min(i, 4) } as React.CSSProperties}
            className="w-[78vw] max-w-[360px] shrink-0 snap-start sm:w-[360px]"
          >
            <Tilt
              as={Link}
              href={`/people#${f.id}`}
              max={4}
              className="candle-glare lit-border group relative block overflow-hidden rounded-[22px] bg-card shadow-[0_30px_60px_-30px_rgb(0_0_0_/_0.9)]"
            >
              <div className="art-frame">
                {artFor(f.id) ? (
                  <ArtImage id={f.id} sizes="(min-width: 640px) 360px, 78vw" className="aspect-[4/5] w-full" />
                ) : (
                  <SymbolPlate id={f.id} className="aspect-[4/5] w-full pb-[22%]" />
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-[#f1e9dc] transition-transform duration-700 [transition-timing-function:var(--ease-out)] group-hover:-translate-y-1">
                <p className="font-display text-3xl font-semibold leading-tight">{figureText(lang, f).name}</p>
                <p className="mt-2 line-clamp-2 text-[14px] leading-6 text-white/80">{figureText(lang, f).summary}</p>
              </div>
            </Tilt>
          </li>
        ))}
      </RevealGroup>

      <div className="mx-auto flex max-w-6xl justify-end gap-3 px-4 sm:px-6">
        <Link href="/people" className="mr-auto inline-flex items-center gap-1.5 text-[15px] text-accent sm:hidden">
          {t.gallery.all(readablePeople(FIGURES).length)} <ArrowRight className="h-4 w-4" />
        </Link>
        {([-1, 1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => page(dir)}
            disabled={dir === -1 ? edge.start : edge.end}
            aria-label={dir === -1 ? t.gallery.prev : t.gallery.next}
            className="grid h-11 w-11 place-items-center rounded-full bg-foreground/10 text-foreground transition-colors hover:bg-foreground/20 disabled:opacity-30"
          >
            <ArrowRight className={`h-5 w-5 ${dir === -1 ? "rotate-180" : ""}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
