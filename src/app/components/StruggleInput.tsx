"use client";

import { TRADITION_OPTIONS, type TraditionChoice } from "@/app/traditions";

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
      <h1 className="font-serif text-[2.4rem] leading-[1.05] sm:text-6xl">You are not the only one.</h1>
      <p className="mt-4 max-w-xl text-[16px] leading-7 text-muted">
        David, Peter, Augustine, Abba Moses — holy people fell the same way you have, and were restored. Tell what
        you are carrying, in English or Amharic, and read their true story from Scripture and the Church Fathers.
      </p>
      <label htmlFor="struggle" className="mt-10 block font-serif text-2xl">
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
        placeholder="I keep lying to the people I love…"
        className="mt-3 block w-full resize-y rounded-sm border border-border bg-background/70 px-4 py-3 font-serif text-lg leading-7 shadow-[0_0_40px_-12px_rgb(232_181_96_/_0.35)] outline-none backdrop-blur-sm placeholder:text-muted/70 focus:border-gold disabled:opacity-60"
      />
      <p className="mt-2 text-xs text-muted">Nothing you write is saved.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          My church
          <select
            value={tradition}
            onChange={(e) => onTradition(e.target.value as TraditionChoice)}
            className="rounded-sm border border-border bg-background px-2 py-1.5 text-foreground"
          >
            {TRADITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="w-full rounded-sm bg-gold px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 sm:w-auto sm:py-2.5"
        >
          {disabled ? "Finding a story…" : "Show me a story"}
        </button>
      </div>
    </form>
  );
}
