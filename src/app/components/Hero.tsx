"use client";

import { useEffect, useRef } from "react";

import { CandleScene } from "./CandleScene";

/** The night band at the top of the home page. The candle fades as the reader scrolls into the story. */
export function Hero({ children }: { children: React.ReactNode }) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = scene.current;
        if (!el) return;
        const h = el.offsetHeight || 1;
        el.style.opacity = String(Math.max(0, 1 - window.scrollY / (h * 0.9)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section className="night relative overflow-hidden border-b border-border">
      <div ref={scene} className="absolute inset-0">
        <CandleScene />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--background)]" />
      </div>
      <div className="relative mx-auto max-w-3xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-24">{children}</div>
    </section>
  );
}
