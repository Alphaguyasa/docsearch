"use client";

import { useRef } from "react";

import { prefersCalm, useScrollProgress } from "./Motion";

const LINES: { text: string; gold?: boolean }[] = [
  { text: "David took another man’s wife." },
  { text: "Peter swore he never knew Jesus." },
  { text: "Paul dragged believers to prison." },
  { text: "Augustine stole for the thrill of it." },
  { text: "None of them was left where they fell.", gold: true },
];

/**
 * A pinned statement whose words light up one by one as the reader scrolls,
 * the way a sentence lands when it is read slowly. Words are lit by writing
 * opacity straight to the DOM each frame — no React re-render per scroll.
 * Under reduced motion every word is simply lit.
 */
export function ScrollWords() {
  const section = useRef<HTMLElement>(null);
  const words = useRef<HTMLSpanElement[]>([]);

  useScrollProgress(section, (p) => {
    const all = words.current;
    if (prefersCalm()) {
      for (const w of all) w.style.opacity = "1";
      return;
    }
    // Finish lighting a little before the pin releases, so the last line rests.
    const lit = p * 1.25 * all.length;
    all.forEach((w, i) => {
      w.style.opacity = String(Math.min(1, Math.max(0.16, lit - i)));
    });
  });

  let n = 0;
  return (
    <section ref={section} aria-label="They fell too" className="relative h-[240vh]">
      <div className="sticky top-0 flex h-[100svh] items-center">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <p className="font-display text-[2.1rem] font-semibold leading-[1.12] tracking-[-0.01em] sm:text-6xl lg:text-7xl">
            {LINES.map((line, li) => (
              <span key={li} className={`block ${line.gold ? "mt-6 text-gold" : ""}`}>
                {line.text.split(" ").map((word, wi) => {
                  const i = n++;
                  return (
                    <span
                      key={wi}
                      ref={(el) => {
                        if (el) words.current[i] = el;
                      }}
                      className="transition-opacity duration-300"
                    >
                      {word}{" "}
                    </span>
                  );
                })}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
