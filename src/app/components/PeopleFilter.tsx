"use client";

import { useEffect, useRef, useState } from "react";

import { GROUPS } from "@/app/people";

/**
 * A frosted bar of struggle chips that sticks under the site bar. Picking one
 * shows only the people who fell that way. The cards are server-rendered;
 * this only toggles `hidden` on them, so the page works without JavaScript
 * (everyone shown, no bar).
 */
export function PeopleFilter({ children, total }: { children: React.ReactNode; total: number }) {
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

  const chip = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={active === id}
      onClick={() => setActive(id)}
      className={`shrink-0 snap-start rounded-full px-4 py-2 text-[14px] transition-colors duration-300 ${
        active === id
          ? "bg-foreground text-background"
          : "bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.14]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="below-nav sticky z-30 border-b border-border/60 bg-[var(--background)]/75 backdrop-blur-xl backdrop-saturate-150">
        <div
          role="toolbar"
          aria-label="Filter by struggle"
          className="gallery-track flex snap-x gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chip("all", "Everyone")}
          {GROUPS.map((g) => chip(g.id, g.label))}
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
