import Link from "next/link";

import type { FigureSummary } from "@/lib/search-stream";

import { FigureSymbol } from "./FigureSymbol";

/** The people this answer is about, each with their symbol, shown before the story begins. */
export function StoryFigures({ figures }: { figures: FigureSummary[] }) {
  if (figures.length === 0) return null;
  return (
    <div className="mb-8">
      <p className="text-sm uppercase tracking-[0.16em] text-gold">You are not the only one</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {figures.map((f) => (
          <li key={f.id} className="rise flex items-start gap-4 border border-border bg-card p-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border bg-panel text-gold">
              <FigureSymbol id={f.id} className="draw-in h-10 w-10" />
            </div>
            <div className="min-w-0">
              <Link href={`/people#${f.id}`} className="font-serif text-lg leading-tight hover:underline">
                {f.name}
              </Link>
              <p className="mt-1 text-sm leading-6 text-muted">{f.summary}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
