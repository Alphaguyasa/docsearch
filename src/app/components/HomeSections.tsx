"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ArtImage } from "./ArtImage";
import { ArrowRight, Lock } from "./Icons";
import { useT } from "../i18n/client";
import { figureText } from "../i18n/dict";

/** What the phone shows at each step: the site itself, in miniature, acting the step out. */
function Screen({ step }: { step: number }) {
  const { lang, t } = useT();
  const m = t.how.mock;
  return (
    <div key={step} className="mock-screen flex h-full flex-col px-4 pb-5 pt-10 text-[#f1e9dc]">
      <p className="font-caps text-[9px] font-semibold tracking-[0.2em] text-[#e8b560]">Not Alone</p>
      {step === 0 && (
        <>
          <p className="mt-6 font-display text-[22px] font-semibold leading-tight">{m.question}</p>
          <div className="mt-4 rounded-2xl p-[1.5px] [background:linear-gradient(135deg,#e8b560,rgb(232_181_96_/_0.2)_60%,#e8b560)]">
            <div className="rounded-[15px] bg-[#120e0a] p-3">
              <p className="mock-type font-serif text-[14px] leading-6">{m.typed}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] text-[#b3a48f]">
                  ✝ {t.church.options.all}
                </span>
                <span className="mock-send grid h-7 w-7 place-items-center rounded-full bg-[#e8b560] text-[#0b0907]">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[#b3a48f]">
            <Lock className="h-3 w-3 text-[#e8b560]" /> {t.hero.privacy}
          </p>
        </>
      )}
      {step === 1 && (
        <>
          <p className="mt-6 font-caps text-[9px] font-semibold tracking-[0.2em] text-[#e8b560]">{m.notOnly}</p>
          <div className="mock-rise mt-3 overflow-hidden rounded-2xl bg-[#17120d] ring-1 ring-white/10">
            <ArtImage id="peter" sizes="260px" className="aspect-[16/10] w-full" />
            <div className="p-3">
              <p className="font-display text-[18px] font-semibold">
                {figureText(lang, { id: "peter", name: "Peter", summary: "" }).name}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-[#b3a48f]">{m.peter}</p>
            </div>
          </div>
          <div className="mock-rise mt-2 flex items-center gap-2 rounded-2xl bg-[#17120d] p-2.5 ring-1 ring-white/10 [animation-delay:250ms]">
            <ArtImage id="jacob" sizes="60px" className="h-9 w-9 rounded-lg" />
            <p className="font-display text-[15px] font-semibold">
              {figureText(lang, { id: "jacob", name: "Jacob", summary: "" }).name}
            </p>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <p className="mt-6 font-serif text-[13px] leading-6">
            <span className="float-left mr-1 font-caps text-[34px] leading-[0.85] text-[#e8b560]">{m.initial}</span>
            {m.story}
            <sup className="mock-cite mx-0.5 rounded px-1 text-[9px] font-bold text-[#0b0907]">1</sup>
            {m.story2}
          </p>
          <div className="mock-quote mt-4 rounded-r-xl border-l-2 border-[#e8b560] p-3">
            <p className="text-[10px] text-[#e8b560]">
              1 <span className="ml-1 text-[#f1e9dc]">Luke 22:54–62</span>
            </p>
            <p className="mt-1 font-serif text-[11.5px] italic leading-5 text-[#f1e9dc]/90">
              “Immediately, while he was still speaking, a rooster crowed. The Lord turned and looked at Peter… He went
              out, and wept bitterly.”
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Phone({ step, className = "" }: { step: number; className?: string }) {
  return (
    <div
      className={`relative aspect-[9/19] w-full overflow-hidden rounded-[2.6rem] bg-[#0b0907] shadow-[0_50px_100px_-40px_rgb(0_0_0_/_1),0_0_80px_-30px_rgb(232_181_96_/_0.35)] ring-[9px] ring-[#1c1610] ${className}`}
    >
      <div className="absolute left-1/2 top-2.5 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" aria-hidden />
      <Screen step={step} />
    </div>
  );
}

/**
 * How it works, shown rather than told (after Apple's and Stripe's product
 * walkthroughs): on a desktop a phone stays pinned beside three steps and
 * acts each one out as the reader scrolls to it — the words typed, the
 * person found, the verse lit. On a phone each step carries its own small
 * screen.
 */
export function HowItWorks() {
  const { t } = useT();
  const STEPS = t.how.steps.map((s, i) => ({ ...s, n: String(i + 1).padStart(2, "0") }));
  const [step, setStep] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    steps.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">{t.how.eyebrow}</p>
      <h2 id="how-heading" className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
        {t.how.title}
      </h2>

      <div className="mt-14 grid gap-16 min-[900px]:grid-cols-[1fr_300px] min-[900px]:gap-20">
        <ol className="space-y-20 min-[900px]:space-y-0">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              ref={(el) => {
                steps.current[i] = el;
              }}
              data-step={i}
              className={`transition-opacity duration-700 min-[900px]:flex min-[900px]:min-h-[70vh] min-[900px]:flex-col min-[900px]:justify-center ${
                step === i ? "min-[900px]:opacity-100" : "min-[900px]:opacity-30"
              }`}
            >
              <span className="font-display text-7xl font-semibold leading-none text-gold/90">{s.n}</span>
              <h3 className="mt-5 max-w-md font-display text-3xl font-semibold leading-tight sm:text-4xl">{s.title}</h3>
              <p className="mt-4 max-w-md font-serif text-[19px] leading-8 text-muted">{s.body}</p>
              <div className="mx-auto mt-10 w-[240px] min-[900px]:hidden">
                <Phone step={i} />
              </div>
            </li>
          ))}
        </ol>
        <div className="hidden min-[900px]:block">
          <div className="sticky top-[calc(50vh-300px)]">
            <Phone step={step} />
            <div className="mt-6 flex justify-center gap-2" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.n}
                  className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? "w-6 bg-gold" : "w-1.5 bg-foreground/20"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CTA =
  "group relative mt-12 inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-gold px-8 py-3.5 font-caps text-[13px] font-semibold tracking-[0.16em] text-background transition-[transform,box-shadow] duration-300 hover:shadow-[0_0_40px_-6px_rgb(232_181_96_/_0.8)] active:scale-[0.98]";

/**
 * The last word on the page: one line and one button. On the home page it
 * scrolls back up to the story box; elsewhere (`href`) it links there.
 */
export function ClosingCta({ href }: { href?: string }) {
  const { t } = useT();
  return (
    <section className="night relative overflow-hidden border-t border-border">
      <div className="candle-still absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-4 py-28 text-center sm:px-6 sm:py-36">
        <h2 className="font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">
          {t.closing.line1}
          <br />
          <span className="text-gold">{t.closing.line2}</span>
        </h2>
        {href ? (
          <Link href={href} className={CTA}>
            {t.closing.cta}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setTimeout(() => document.getElementById("struggle")?.focus({ preventScroll: true }), 600);
            }}
            className={CTA}
          >
            {t.closing.cta}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        )}
      </div>
    </section>
  );
}
