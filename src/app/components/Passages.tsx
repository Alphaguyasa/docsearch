"use client";

import { useEffect, useRef, useState } from "react";

import { sourceKindLabel, sourceName, type UiSource } from "@/app/types";

import { ChevronDown } from "./Icons";
import { useT } from "../i18n/client";

/**
 * The passages the story was told from, set as quotations so the reader can
 * check every line against the text. Cited passages come first and are always
 * shown; the rest of what was read sits behind one tap. Pressing a [n] in the
 * story scrolls here and lights up that passage.
 */
export function Passages({
  sources,
  cited,
  active,
  onClear,
}: {
  sources: UiSource[];
  cited: number[];
  active: number | null;
  onClear: () => void;
}) {
  const { t } = useT();
  const refs = useRef(new Map<number, HTMLElement>());
  const [more, setMore] = useState(false);

  const citedSet = new Set(cited);
  const main = sources.filter((s) => citedSet.has(s.n)).sort((a, b) => a.n - b.n);
  const rest = sources.filter((s) => !citedSet.has(s.n));

  useEffect(() => {
    if (active === null) return;
    if (!cited.includes(active)) setMore(true);
    requestAnimationFrame(() => refs.current.get(active)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [active]);

  if (sources.length === 0) return null;

  const quote = (s: UiSource) => (
    <li
      key={s.n}
      id={`passage-${s.n}`}
      ref={(el) => {
        if (el) refs.current.set(s.n, el);
      }}
      className={`scroll-mt-24 border-l-2 py-1 pl-4 transition-colors duration-500 ${
        active === s.n ? "border-gold bg-gold/10" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-mono text-xs text-gold">{s.n}</span>
        <cite className="font-medium not-italic">{sourceName(s)}</cite>
        {sourceKindLabel(s) && (
          <span className="text-xs text-muted">{s.kind === "scripture" ? t.story.scripture : t.story.tradition}</span>
        )}
      </div>
      <blockquote className="mt-1.5 whitespace-pre-wrap font-serif text-[16px] leading-7 text-foreground/90">
        {s.content}
      </blockquote>
    </li>
  );

  return (
    <section aria-labelledby="passages-heading" className="border-t border-border pt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="passages-heading" className="font-display text-3xl font-semibold">
          {t.story.readTitle}
        </h2>
        {active !== null && (
          <button type="button" onClick={onClear} className="text-xs text-muted hover:text-foreground">
            {t.story.clear}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{t.story.readNote}</p>
      {main.length > 0 && <ol className="mt-6 space-y-6">{main.map(quote)}</ol>}
      {rest.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className="flex items-center gap-1.5 text-sm text-muted underline underline-offset-4 hover:text-foreground"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${more ? "rotate-180" : ""}`} />
            {more ? t.story.less(rest.length) : t.story.more(rest.length)}
          </button>
          {more && <ol className="mt-6 space-y-6">{rest.map(quote)}</ol>}
        </div>
      )}
    </section>
  );
}
