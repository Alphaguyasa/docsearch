"use client";

import type { UiSource } from "@/app/types";

/**
 * How a source is named wherever it appears.
 *
 * There are three places a citation is rendered — the panel, the retrieved-chunk
 * list, and the hover card — and they must not drift, because the label IS the
 * claim. "St John Chrysostom, Homilies on Matthew 33" and "npnf110.txt p.412"
 * are the difference between a citation a reader can check and one they cannot.
 *
 * The tradition badge is not decoration either. A reader asking an Oriental
 * Orthodox question needs to see at a glance that a passage came from a council
 * their Church does not receive.
 */

const TRADITION_LABEL: Record<string, string> = {
  eastern: "Eastern Orthodox",
  oriental: "Oriental Orthodox",
  both: "Both traditions",
};

const TRADITION_STYLE: Record<string, string> = {
  // Distinguished by hue, but each also carries its own text, so the meaning
  // never depends on colour alone.
  eastern: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  oriental: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  both: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export function TraditionBadge({ tradition }: { tradition: string | null }) {
  if (!tradition || !TRADITION_LABEL[tradition]) return null;
  return (
    <span
      className={`shrink-0 border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${TRADITION_STYLE[tradition]}`}
    >
      {TRADITION_LABEL[tradition]}
    </span>
  );
}

/**
 * The citation line for one source: who wrote it, and where to find it.
 *
 * Falls back to the page number when a document has no recovered reference —
 * the research PDFs this project began with still cite that way, and so would
 * any future upload.
 */
export function SourceLabel({ source }: { source: UiSource }) {
  const locator =
    source.reference ?? (source.pageNumber === null ? null : `p.${source.pageNumber}`);

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      {source.author && <span className="font-medium">{source.author},</span>}
      <span className={source.author ? "text-foreground/80" : "font-medium"}>
        {source.title}
      </span>
      {locator && <span className="font-mono text-[11px] text-muted">{locator}</span>}
      <TraditionBadge tradition={source.tradition} />
    </div>
  );
}
