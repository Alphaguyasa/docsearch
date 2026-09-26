"use client";

import { CandleScene } from "./CandleScene";
import { ArrowRight, Quote } from "./Icons";
import { RevealGroup, Tilt } from "./Motion";

/**
 * "Start from something others have carried": four confessions as cards.
 * The hero's embers keep drifting behind them (one light three.js layer,
 * paused off screen); each card leans toward the pointer, catches the
 * candlelight where the pointer is, and its gilt edge lights up.
 */
export function ExampleCards({ examples, onPick }: { examples: string[]; onPick: (q: string) => void }) {
  return (
    <section aria-labelledby="examples-heading" className="relative">
      <div className="pointer-events-none absolute -inset-x-4 -inset-y-10 opacity-70 sm:-inset-x-10">
        <CandleScene glow={false} embers={0.45} />
      </div>
      <p id="examples-heading" className="relative font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">
        Or begin with what others have carried
      </p>
      <RevealGroup as="ul" className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {examples.map((q, i) => (
          <li key={q} data-reveal style={{ "--i": i } as React.CSSProperties}>
            <Tilt
              as="button"
              type="button"
              onClick={() => onPick(q)}
              max={6}
              className="candle-glare lit-border group flex h-full w-full flex-col rounded-sm border border-border bg-card/70 p-5 text-left shadow-[0_18px_40px_-24px_rgb(0_0_0_/_0.8)] backdrop-blur-sm transition-colors duration-500 hover:bg-card"
            >
              <Quote className="h-6 w-6 text-gold/70 transition-colors duration-500 group-hover:text-gold" />
              <span className="mt-3 block flex-1 font-serif text-[18px] italic leading-7">{q}</span>
              <span className="mt-5 flex items-center gap-2 font-caps text-[11px] tracking-[0.2em] text-muted transition-colors duration-500 group-hover:text-gold">
                Read their story
                <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
            </Tilt>
          </li>
        ))}
      </RevealGroup>
    </section>
  );
}
