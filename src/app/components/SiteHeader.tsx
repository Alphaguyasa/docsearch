"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The global bar: thin, frosted, pinned to the top. It tucks away while the
 * reader scrolls down into a story and slides back the moment they scroll up,
 * so it is always one flick away without ever covering the words.
 */
export function SiteHeader({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const path = usePathname();

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setScrolled(y > 8);
        if (Math.abs(y - last) > 6) {
          setHidden(y > last && y > 120);
          last = y;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // A new page always starts with the bar showing.
  useEffect(() => setHidden(false), [path]);

  // Let bars pinned beneath this one (.below-nav) follow it up and down.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-nav-hidden", hidden);
  }, [hidden]);

  return (
    <header
      onFocusCapture={() => setHidden(false)}
      className={`night sticky top-0 z-40 transition-[transform,background-color,border-color] duration-500 [transition-timing-function:var(--ease-out)] ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${
        scrolled
          ? "border-b border-white/10 bg-[#0b0907]/70 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-[#0b0907]"
      }`}
    >
      {children}
    </header>
  );
}
