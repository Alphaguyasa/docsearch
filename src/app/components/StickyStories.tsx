"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { artByline, artFor } from "@/app/art";

import { ArtImage } from "./ArtImage";
import { ArrowRight } from "./Icons";
import { prefersCalm, useScrollProgress } from "./Motion";

const STORIES = [
  {
    id: "david",
    name: "King David",
    fall: "Took another man’s wife, then arranged her husband’s death.",
    rise: "Confronted by the prophet Nathan, he confessed — and his prayer of repentance became Psalm 51.",
    read: "2 Samuel 11–12 · Psalm 51",
  },
  {
    id: "peter",
    name: "Peter",
    fall: "Swore three times that he had never known Jesus.",
    rise: "The risen Jesus asked him three times, “Do you love me?” — and gave him his flock to feed.",
    read: "Luke 22:54–62 · John 21:15–19",
  },
  {
    id: "paul",
    name: "Paul",
    fall: "Hunted Christians and dragged them off to prison.",
    rise: "Met on the road to Damascus, he became the apostle to the nations, calling himself the foremost of sinners.",
    read: "Acts 9 · 1 Timothy 1:12–16",
  },
  {
    id: "augustine",
    name: "St. Augustine",
    fall: "Stole for the thrill of it, and lived for years in lust and ambition.",
    rise: "Converted in a garden in Milan, he became one of the great teachers of the Church.",
    read: "Confessions, Books II and VIII",
  },
];

/**
 * Four lives, one pinned screen. As the reader scrolls, each painting
 * crossfades in and settles from a slow zoom while its story slides into
 * place — the fall, then the restoration. Desktop: words left, painting
 * right. Phone: the painting fills the screen and the words sit over it.
 */
export function StickyStories() {
  const section = useRef<HTMLElement>(null);
  const layers = useRef<HTMLDivElement[]>([]);
  const [active, setActive] = useState(0);
  const n = STORIES.length;

  useScrollProgress(section, (p) => {
    const pos = p * n;
    const idx = Math.min(n - 1, Math.floor(pos));
    setActive((a) => (a === idx ? a : idx));
    if (prefersCalm()) return;
    layers.current.forEach((el, i) => {
      // Each painting eases from 1.14x to 1x over its own stretch of scroll.
      const local = Math.min(1, Math.max(0, pos - i));
      el.style.transform = `scale(${1.14 - 0.14 * local})`;
    });
  });

  const story = STORIES[active];
  return (
    <section ref={section} aria-label="Four lives" className="night relative" style={{ height: `${(n + 1) * 100}vh` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Paintings */}
        <div className="absolute inset-0 overflow-hidden min-[900px]:left-[46%]">
          {STORIES.map((s, i) => (
            <div
              key={s.id}
              aria-hidden={i !== active}
              className={`absolute inset-0 transition-opacity duration-1000 [transition-timing-function:var(--ease-out)] ${
                i === active ? "opacity-100" : "opacity-0"
              }`}
            >
              <div
                ref={(el) => {
                  if (el) layers.current[i] = el;
                }}
                className="h-full w-full will-change-transform"
              >
                <ArtImage id={s.id} sizes="(min-width: 900px) 56vw, 100vw" className="h-full w-full" />
              </div>
            </div>
          ))}
          <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--background)_0%,var(--background)_38%,rgb(11_9_7_/_0.72)_62%,rgb(11_9_7_/_0.1)_100%)] min-[900px]:bg-[linear-gradient(90deg,var(--background)_0%,rgb(11_9_7_/_0.55)_14%,transparent_32%),linear-gradient(0deg,rgb(11_9_7_/_0.6)_0%,transparent_22%)]" />
        </div>

        {/* Words */}
        <div className="relative mx-auto flex h-full max-w-6xl items-end px-4 pb-16 sm:px-6 min-[900px]:items-center min-[900px]:pb-0">
          <div className="max-w-md">
            <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">
              {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
            </p>
            <div key={story.id} className="story-in">
              <h3 className="mt-4 font-display text-5xl font-semibold leading-none sm:text-6xl">{story.name}</h3>
              <p className="mt-6 font-serif text-[20px] leading-8 text-muted">
                <span className="font-caps text-[11px] font-semibold tracking-[0.2em] text-foreground/70">
                  The fall
                </span>
                <br />
                {story.fall}
              </p>
              <p className="mt-5 font-serif text-[20px] leading-8">
                <span className="font-caps text-[11px] font-semibold tracking-[0.2em] text-gold">The restoration</span>
                <br />
                {story.rise}
              </p>
              <p className="mt-6 text-sm text-muted">Read it: {story.read}</p>
              <Link
                href={`/people#${story.id}`}
                className="group mt-6 inline-flex items-center gap-2 font-caps text-[12px] font-semibold tracking-[0.18em] text-gold"
              >
                Their story{" "}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>

        {/* Progress */}
        <ol
          className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 sm:right-6 min-[900px]:flex"
          aria-hidden
        >
          {STORIES.map((s, i) => (
            <li
              key={s.id}
              className={`h-8 w-[3px] rounded-full transition-colors duration-500 ${i === active ? "bg-gold" : "bg-white/20"}`}
            />
          ))}
        </ol>
        {artFor(story.id) && (
          <p className="absolute bottom-3 right-4 hidden text-xs text-muted min-[900px]:block sm:right-6">
            {artFor(story.id)!.caption} · {artByline(artFor(story.id)!)}
          </p>
        )}
      </div>
    </section>
  );
}
