"use client";

import { ArrowRight } from "./Icons";
import { RevealGroup } from "./Motion";

const STEPS = [
  {
    n: "01",
    title: "Say it plainly.",
    body: "Write what you are carrying, in English or Amharic. Nothing you write is saved.",
  },
  {
    n: "02",
    title: "Meet someone who fell the same way.",
    body: "A king, an apostle, a robber turned monk — from Scripture and the Church Fathers, chosen for your struggle and your church.",
  },
  {
    n: "03",
    title: "Read it for yourself.",
    body: "Every line of the story is numbered back to the passage it comes from. Nothing is retold from memory.",
  },
];

/** Three steps, Apple-plain: a big number, a short title, one sentence. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">How it works</p>
      <h2 id="how-heading" className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
        A true story, not a lecture.
      </h2>
      <RevealGroup as="ol" className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {STEPS.map((s, i) => (
          <li key={s.n} data-reveal style={{ "--i": i } as React.CSSProperties} className="border-t border-border pt-6">
            <span className="font-display text-6xl font-semibold leading-none text-gold/90">{s.n}</span>
            <h3 className="mt-6 font-display text-2xl font-semibold leading-tight">{s.title}</h3>
            <p className="mt-3 font-serif text-[18px] leading-7 text-muted">{s.body}</p>
          </li>
        ))}
      </RevealGroup>
    </section>
  );
}

/** The last word on the page: one line and one button, back up to the box. */
export function ClosingCta() {
  return (
    <section className="night relative overflow-hidden border-t border-border">
      <div className="candle-still absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-4 py-28 text-center sm:px-6 sm:py-36">
        <h2 className="font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">
          Whatever you are carrying,
          <br />
          <span className="text-gold">someone carried it first.</span>
        </h2>
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setTimeout(() => document.getElementById("struggle")?.focus({ preventScroll: true }), 600);
          }}
          className="group relative mt-12 inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-gold px-8 py-3.5 font-caps text-[13px] font-semibold tracking-[0.16em] text-background transition-[transform,box-shadow] duration-300 hover:shadow-[0_0_40px_-6px_rgb(232_181_96_/_0.8)] active:scale-[0.98]"
        >
          Tell what you are carrying
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </button>
      </div>
    </section>
  );
}
