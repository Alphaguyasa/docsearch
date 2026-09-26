"use client";

import { useEffect, useRef, useState } from "react";

import { GROUPS } from "@/app/people";

/**
 * A frosted bar of struggle chips that sticks under the site bar. Picking one
 * shows only the people who fell that way. The cards are server-rendered;
 * this only toggles `hidden` on them, so the page works without JavaScript
 * (everyone shown, no bar).
 */
export function PeopleFilter({
  children,
  total,
  counts,
}: {
  children: React.ReactNode;
  total: number;
  /** People per group id, shown on each chip. */
  counts: Record<string, number>;
}) {
  const [active, setActive] = useState("all");
  const [shown, setShown] = useState(total);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let n = 0;
    list.current?.querySelectorAll<HTMLElement>("[data-groups]").forEach((el) => {
      const match = active === "all" || el.dataset.groups!.split(" ").includes(active);
      el.hidden = !match;
      if (match) {
        n++;
        el.classList.add("is-shown");
      }
    });
    setShown(n);
  }, [active]);

  // Same pill as the church picker: a thin ring at rest, gilt when chosen.
  const chip = (id: string, label: string, n: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={active === id}
      onClick={() => setActive(id)}
      className={`flex h-10 shrink-0 snap-start items-center gap-2 rounded-full pl-4 pr-3 text-[14px] ring-1 transition-[background-color,color,box-shadow] duration-300 active:scale-[0.97] ${
        active === id
          ? "bg-gold text-background ring-gold shadow-[0_0_24px_-6px_rgb(232_181_96_/_0.7)]"
          : "bg-foreground/[0.06] text-foreground ring-foreground/10 hover:bg-foreground/[0.1]"
      }`}
    >
      {label}
      <span
        className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
          active === id ? "bg-background/15" : "bg-foreground/10 text-muted"
        }`}
      >
        {n}
      </span>
    </button>
  );

  return (
    <>
      <div className="below-nav sticky z-30 border-b border-border/60 bg-[var(--background)]/75 backdrop-blur-xl backdrop-saturate-150">
        <div
          role="toolbar"
          aria-label="Filter by struggle"
          className="gallery-track chip-row flex snap-x gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chip("all", "Everyone", total)}
          {GROUPS.map((g) => chip(g.id, g.label, counts[g.id] ?? 0))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <p aria-live="polite" className="text-sm text-muted">
          {active === "all" ? `${shown} people` : `${shown} ${shown === 1 ? "person" : "people"} who fell this way`}
        </p>
      </div>
      <div ref={list}>{children}</div>
    </>
  );
}
