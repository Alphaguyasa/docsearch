"use client";

import type { TraditionChoice } from "@/app/traditions";

import { ArrowRight } from "./Icons";
import { TraditionSelect } from "./TraditionSelect";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  tradition: TraditionChoice;
  onTradition: (t: TraditionChoice) => void;
}

/** A sentence-sized box: people describe a struggle, they don't type keywords. */
export function StruggleInput({ value, onChange, onSubmit, disabled, tradition, onTradition }: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h1 className="font-display text-[2.8rem] font-semibold leading-[1.02] sm:text-7xl">You are not the only one.</h1>
      <p className="mt-5 max-w-xl font-serif text-[19px] leading-8 text-muted">
        David, Peter, Augustine, Abba Moses — holy people fell the same way you have, and were restored. Tell what you
        are carrying, in English or Amharic, and read their true story from Scripture and the Church Fathers.
      </p>
      <label htmlFor="struggle" className="mt-10 block font-display text-[1.75rem] font-semibold">
        What are you carrying?
      </label>
      <textarea
        id="struggle"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
        disabled={disabled}
        maxLength={1000}
        rows={3}
        onInput={(e) => {
          // Grow with the words instead of showing a resize handle.
          const t = e.currentTarget;
          t.style.height = "auto";
          t.style.height = `${Math.min(t.scrollHeight, 320)}px`;
        }}
        placeholder="I keep lying to the people I love…"
        className="mt-3 block min-h-[7.5rem] w-full resize-none rounded-sm border border-border bg-background/70 px-5 py-4 font-serif text-[19px] leading-8 shadow-[0_0_40px_-12px_rgb(232_181_96_/_0.35)] outline-none backdrop-blur-sm transition-[border-color,box-shadow] duration-500 placeholder:italic placeholder:text-muted/70 focus:border-gold/80 focus:shadow-[0_0_60px_-10px_rgb(232_181_96_/_0.55)] disabled:opacity-60"
      />
      <p className="mt-2 text-xs text-muted">Nothing you write is saved.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <TraditionSelect value={tradition} onChange={onTradition} disabled={disabled} />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="group relative inline-flex min-h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-sm bg-gold px-6 py-3 font-caps text-[13px] font-semibold tracking-[0.16em] text-background transition-[transform,opacity,box-shadow] duration-300 hover:shadow-[0_0_32px_-4px_rgb(232_181_96_/_0.7)] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none sm:w-auto"
        >
          {/* A sheen passes over the button, like light over gilt. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/30 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 group-disabled:hidden"
          />
          {disabled ? "Finding a story…" : "Show me a story"}
          {!disabled && <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />}
        </button>
      </div>
    </form>
  );
}
