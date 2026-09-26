"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { personOfTheDay } from "@/lib/scripture/today";
import type { Figure } from "@/lib/scripture/figures";

import { artFor } from "../art";
import { ArtImage } from "./ArtImage";
import { ArrowRight } from "./Icons";
import { SymbolPlate } from "./SymbolPlate";
import { useT } from "../i18n/client";
import { figureText } from "../i18n/dict";

/**
 * One person a day, the same for everyone (the day turns in Addis Ababa).
 * Chosen after mount so the server and the reader's clock never disagree.
 * Opens their page, read straight from the text.
 */
export function TodayStory() {
  const { lang, t } = useT();
  const [f, setF] = useState<Figure | null>(null);
  useEffect(() => setF(personOfTheDay(new Date())), []);

  return (
    <section aria-labelledby="today-heading" className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
      <p id="today-heading" className="font-caps text-[13px] font-semibold tracking-[0.2em] text-gold">
        {t.today.eyebrow}
      </p>
      <div className="mt-4 min-h-[180px]">
        {f && (
          <Link
            href={`/people/${f.id}`}
            className="rise candle-glare lit-border group grid overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_30px_60px_-34px_rgb(0_0_0_/_0.9)] transition-colors hover:border-gold/40 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          >
            <div className="art-frame relative">
              {artFor(f.id) ? (
                <ArtImage id={f.id} sizes="(min-width: 640px) 400px, 100vw" className="aspect-[16/10] h-full w-full" />
              ) : (
                <SymbolPlate id={f.id} className="aspect-[16/10] h-full w-full" />
              )}
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
                {figureText(lang, f).name}
              </h2>
              <p className="mt-3 font-serif text-[18px] leading-8 text-muted">{figureText(lang, f).summary}</p>
              <span className="mt-5 inline-flex items-center gap-2 font-caps text-[12px] font-semibold tracking-[0.18em] text-gold">
                {t.today.read}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
