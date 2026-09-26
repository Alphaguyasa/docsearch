"use client";

import { useState } from "react";

import { CandleScene } from "./CandleScene";
import { ArrowRight } from "./Icons";
import { RevealGroup, Tilt } from "./Motion";
import { useT } from "../i18n/client";

/** Each card rests at its own small angle, as notes do on a prayer wall. */
const LEAN = [-2.2, 1.6, -1.1, 2.4];

/**
 * "Begin with what others have carried": four confessions as votive prayer
 * cards, each with its own small candle. They rest a little askew; under the
 * pointer a card straightens, lifts and leans toward it while its flame rises.
 * Choosing one lights it — the flame flares and the card glows — and then its
 * story opens. On a phone they sit in a row to swipe through, the next card
 * peeking in from the edge. The hero's three.js embers drift behind them.
 */
export function ExampleCards({ examples, onPick }: { examples: string[]; onPick: (q: string) => void }) {
  const [lit, setLit] = useState<string | null>(null);
  const { t } = useT();

  function choose(q: string) {
    if (lit) return;
    setLit(q);
    window.setTimeout(() => {
      onPick(q);
      setLit(null);
    }, 520);
  }

  return (
    <section aria-labelledby="examples-heading" className="relative">
      <div className="pointer-events-none absolute -inset-x-4 -inset-y-10 opacity-70 sm:-inset-x-10">
        <CandleScene glow={false} embers={0.45} />
      </div>
      <p id="examples-heading" className="relative font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">
        {t.examples.heading}
      </p>
      <RevealGroup
        as="ul"
        className="gallery-track relative -mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-8 pt-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:!px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden"
      >
        {examples.map((q, i) => (
          <li
            key={q}
            data-reveal
            style={{ "--i": i, "--lean": `${LEAN[i % LEAN.length]}deg` } as React.CSSProperties}
            className="votive-slot w-[74vw] max-w-[300px] shrink-0 snap-center sm:w-auto sm:max-w-none"
          >
            <Tilt
              as="button"
              type="button"
              onClick={() => choose(q)}
              max={6}
              aria-label={`${t.examples.aria} ${q}`}
              className={`votive candle-glare group flex h-full min-h-[15rem] w-full flex-col rounded-[18px] p-6 text-left ${
                lit === q ? "is-lit" : ""
              }`}
            >
              <span className="votive-candle" aria-hidden>
                <span className="votive-flame" />
                <span className="votive-wax" />
              </span>
              <span className="mt-5 block flex-1 font-serif text-[19px] italic leading-8 text-[#efe4cf]">“{q}”</span>
              <span className="mt-6 flex items-center gap-2 font-caps text-[11px] font-semibold tracking-[0.2em] text-[#b3a48f] transition-colors duration-500 group-hover:text-[#e8b560]">
                {t.examples.light}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1" />
              </span>
            </Tilt>
          </li>
        ))}
      </RevealGroup>
    </section>
  );
}
