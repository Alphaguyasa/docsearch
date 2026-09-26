"use client";

import { useEffect, useRef } from "react";

import { artByline, artFor, artSrc } from "@/app/art";

import { CandleScene, type Painting } from "./CandleScene";

/**
 * The night band at the top of the home page: a painting in the dark, lit by
 * a candle, with the words over it. The scene fades as the reader scrolls
 * into the story.
 */
export function Hero({ children, art = "hero" }: { children: React.ReactNode; art?: string }) {
  const scene = useRef<HTMLDivElement>(null);
  const a = artFor(art);
  const painting: Painting | undefined = a && {
    small: artSrc(a.id, 800),
    large: artSrc(a.id, 1600),
    aspect: a.width / a.height,
    alt: `${a.caption}, ${artByline(a)}`,
  };

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
        <CandleScene painting={painting} />
        {/* Keep the words readable where they sit over the painting. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--background)]/10 via-[var(--background)]/55 to-[var(--background)] min-[900px]:bg-gradient-to-r min-[900px]:from-[var(--background)] min-[900px]:via-[var(--background)]/70 min-[900px]:to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--background)]" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-[30vh] sm:px-6 min-[900px]:min-h-[640px] min-[900px]:pb-20 min-[900px]:pt-24">
        <div className="max-w-xl">{children}</div>
      </div>
      {a && (
        <p className="absolute bottom-3 right-4 z-10 hidden text-right text-xs text-muted min-[900px]:block sm:right-6">
          {a.caption} · {artByline(a)}
        </p>
      )}
    </section>
  );
}
