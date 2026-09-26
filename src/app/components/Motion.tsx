"use client";

import { createElement, useEffect, useRef } from "react";

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals every [data-reveal] inside it as it scrolls into view: cards rise,
 * paintings unveil from the bottom like a curtain lifting. The hidden state
 * only applies once this has mounted (data-armed), so without JavaScript
 * everything is simply visible.
 */
export function RevealGroup({
  as = "div",
  className,
  children,
}: {
  as?: React.ElementType;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || calm()) return;
    el.dataset.armed = "";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-shown");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    el.querySelectorAll("[data-reveal]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return createElement(as, { ref, className }, children);
}

/**
 * A card that leans toward the pointer and catches candlelight where the
 * pointer is: sets --rx/--ry (tilt) and --mx/--my (light position) for the
 * .tilt / .candle-glare / .lit-border styles. Mouse and pen only; on touch it
 * just presses in.
 */
export function Tilt({
  as = "div",
  className = "",
  max = 7,
  children,
  ...rest
}: {
  as?: React.ElementType;
  className?: string;
  max?: number;
  children: React.ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || calm() || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
        el.style.setProperty("--ry", `${(x - 0.5) * max * 2}deg`);
        el.style.setProperty("--rx", `${(0.5 - y) * max * 2}deg`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [max]);
  return createElement(as, { ref, className: `tilt ${className}`, ...rest }, children);
}
