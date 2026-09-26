"use client";

import { useEffect, useRef, useState } from "react";

import type { TraditionChoice } from "@/app/traditions";

import { ArrowRight, Lock } from "./Icons";
import { prefersCalm } from "./Motion";
import { TraditionSelect } from "./TraditionSelect";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  tradition: TraditionChoice;
  onTradition: (t: TraditionChoice) => void;
}

const MAX = 1000;

/** What the empty box quietly writes to itself, one line at a time. */
const WHISPERS = [
  "I keep lying to the people I love…",
  "I cheated, and I don’t know how to live with it…",
  "I have walked away from God for years…",
  "My anger is hurting my family…",
  "ሁልጊዜ በጣም እቆጣለሁ…",
];

/**
 * The typewriter placeholder: types a line, rests, erases, moves on. Only
 * while the box is empty and not focused, and never under reduced motion.
 */
function useWhisper(active: boolean): string {
  const [text, setText] = useState(WHISPERS[0]);
  useEffect(() => {
    if (!active || prefersCalm()) {
      setText(WHISPERS[0]);
      return;
    }
    let line = 0;
    let i = 0;
    let erasing = false;
    let timer = 0;
    const tick = () => {
      const full = WHISPERS[line];
      if (!erasing) {
        i++;
        setText(full.slice(0, i));
        if (i >= full.length) {
          erasing = true;
          timer = window.setTimeout(tick, 2200);
          return;
        }
        timer = window.setTimeout(tick, 42 + Math.random() * 60);
      } else {
        i -= 2;
        setText(full.slice(0, Math.max(0, i)));
        if (i <= 0) {
          erasing = false;
          line = (line + 1) % WHISPERS.length;
          timer = window.setTimeout(tick, 500);
          return;
        }
        timer = window.setTimeout(tick, 18);
      }
    };
    timer = window.setTimeout(tick, 900);
    return () => window.clearTimeout(timer);
  }, [active]);
  return text;
}

/**
 * The composer. A sentence-sized box — people describe a struggle, they don't
 * type keywords — built like a message you are about to send: the send button
 * lives inside the box, the church picker sits in its toolbar, and the rim
 * warms like candlelight while you write. On a phone everything stays inside
 * one card; the picker opens as a bottom sheet.
 */
export function StruggleInput({ value, onChange, onSubmit, disabled, tradition, onTradition }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const whisper = useWhisper(!focused && value.length === 0);
  const ready = value.trim().length > 0 && !disabled;

  // Grow with the words; shrink back when cleared (e.g. after picking an example).
  useEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 320)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit();
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

      <div
        className={`composer mt-3 ${focused ? "is-focused" : ""} ${ready ? "is-ready" : ""} ${disabled ? "is-busy" : ""}`}
      >
        <div className="composer-inner rounded-[20px] bg-[#120e0a]/90 backdrop-blur-md">
          <div className="relative">
            <textarea
              ref={box}
              id="struggle"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                // Enter sends on a keyboard; Shift+Enter is a new line. Phones keep Enter as a new line.
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  if (ready) onSubmit();
                }
              }}
              disabled={disabled}
              maxLength={MAX}
              rows={3}
              aria-describedby="struggle-privacy"
              className="block min-h-[7.5rem] w-full resize-none bg-transparent focus-visible:outline-none px-5 pb-2 pt-5 font-serif text-[19px] leading-8 text-foreground caret-[#e8b560] outline-none disabled:opacity-60 sm:px-6 sm:text-[20px]"
            />
            {value.length === 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-5 right-5 top-5 font-serif text-[19px] italic leading-8 text-muted/70 sm:left-6 sm:text-[20px]"
              >
                {focused ? WHISPERS[0] : whisper}
                {!focused && <span className="composer-caret" />}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 pb-3 pt-1 sm:px-4">
            <TraditionSelect value={tradition} onChange={onTradition} disabled={disabled} />
            <span
              className={`ml-auto hidden text-xs tabular-nums text-muted transition-opacity duration-300 sm:inline ${
                focused && value.length > MAX * 0.6 ? "opacity-100" : "opacity-0"
              }`}
            >
              {value.length} / {MAX}
            </span>
            <button
              type="submit"
              disabled={!ready}
              aria-label={disabled ? "Finding a story" : "Show me a story"}
              className="composer-send group ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 font-caps text-[12px] font-semibold tracking-[0.14em] sm:ml-0 sm:px-5"
            >
              {disabled ? (
                <span className="composer-spinner" aria-hidden />
              ) : (
                <>
                  <span className="hidden sm:inline">Show me a story</span>
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <p id="struggle-privacy" className="mt-3 flex items-center gap-2 px-1 text-[13px] text-muted">
        <Lock className="h-3.5 w-3.5 shrink-0 text-gold/80" />
        Nothing you write is saved.
        <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
      </p>
    </form>
  );
}
