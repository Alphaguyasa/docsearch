import Link from "next/link";

import type { FigureSummary } from "@/lib/search-stream";

import { artFor } from "@/app/art";

import { ArtImage } from "./ArtImage";
import { FigureSymbol } from "./FigureSymbol";
import { RevealGroup, Tilt } from "./Motion";
import { SymbolPlate } from "./SymbolPlate";

/** The people this answer is about, each with their symbol, shown before the story begins. */
export function StoryFigures({ figures }: { figures: FigureSummary[] }) {
  if (figures.length === 0) return null;
  return (
    <div className="mb-8">
      <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">You are not the only one</p>
      <RevealGroup as="ul" className="mt-3 grid gap-3 sm:grid-cols-2">
        {figures.map((f, i) => (
          <li key={f.id} data-reveal style={{ "--i": i } as React.CSSProperties}>
            <Tilt
              max={4}
              className="candle-glare lit-border group h-full overflow-hidden rounded-sm border border-border bg-card"
            >
              {artFor(f.id) ? (
                <div className="art-frame">
                  <ArtImage id={f.id} eager sizes="(min-width: 640px) 360px, 100vw" className="aspect-[16/9] w-full" />
                </div>
              ) : (
                <SymbolPlate id={f.id} className="aspect-[16/9] w-full" />
              )}
              <div className="flex items-start gap-4 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border bg-panel text-gold">
                  <FigureSymbol id={f.id} className="draw-in h-8 w-8" />
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/people#${f.id}`}
                    className="font-display text-xl font-semibold leading-tight hover:underline"
                  >
                    {f.name}
                  </Link>
                  <p className="mt-1 text-sm leading-6 text-muted">{f.summary}</p>
                </div>
              </div>
            </Tilt>
          </li>
        ))}
      </RevealGroup>
    </div>
  );
}
