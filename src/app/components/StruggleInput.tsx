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
      <label htmlFor="struggle" className="block font-serif text-[1.9rem] leading-tight sm:text-4xl">
        What are you carrying?
      </label>
      <p className="mt-2 max-w-prose text-muted">
        Write it plainly, in English or Amharic. You will read the true story of someone holy who fell the
        same way and was restored. Nothing you write is saved.
      </p>
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
        className="mt-5 block w-full resize-y border border-border bg-background px-3 py-3 font-serif text-lg leading-7 outline-none placeholder:text-muted/70 focus:border-accent disabled:opacity-60"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          My church
          <select
            value={tradition}
            onChange={(e) => onTradition(e.target.value as TraditionChoice)}
            className="border border-border bg-background px-2 py-1.5 text-foreground"
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
          className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          {disabled ? "Finding a story…" : "Show me a story"}
        </button>
      </div>
    </form>
  );
}
