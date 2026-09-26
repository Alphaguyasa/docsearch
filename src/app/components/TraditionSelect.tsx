"use client";

import { useEffect, useId, useRef, useState } from "react";

import { TRADITION_OPTIONS, type TraditionChoice } from "@/app/traditions";

import { Check, ChevronDown, Cross } from "./Icons";

/**
 * "My church": a listbox in the site's own dress instead of the browser's
 * grey select. Keyboard: Enter/Space/↓ opens; ↑↓ Home End move; Enter picks;
 * Esc or Tab closes. Screen readers get the standard combobox/listbox roles.
 */
export function TraditionSelect({
  value,
  onChange,
  disabled,
}: {
  value: TraditionChoice;
  onChange: (t: TraditionChoice) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = TRADITION_OPTIONS.find((o) => o.value === value) ?? TRADITION_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function show() {
    setActive(
      Math.max(
        0,
        TRADITION_OPTIONS.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  }

  function pick(i: number) {
    onChange(TRADITION_OPTIONS[i].value);
    setOpen(false);
    button.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    const last = TRADITION_OPTIONS.length - 1;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <span id={`${id}-label`} className="sr-only">
        My church
      </span>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className="group flex min-h-11 items-center gap-2.5 rounded-sm border border-border bg-background/60 py-2 pl-3 pr-2.5 text-left text-sm backdrop-blur-sm transition-colors hover:border-gold/60 disabled:opacity-60 aria-expanded:border-gold/70"
      >
        <Cross className="h-4 w-4 text-gold" />
        <span className="text-muted">My church</span>
        <span id={`${id}-value`} className="font-medium text-foreground">
          {current.label}
        </span>
        <ChevronDown
          className={`ml-1 h-4 w-4 text-muted transition-transform duration-300 ${open ? "rotate-180 text-gold" : ""}`}
        />
      </button>

      <ul
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={`${id}-label`}
        className={`absolute bottom-full left-0 z-30 mb-2 w-72 origin-bottom-left overflow-hidden rounded-sm border border-border bg-card/95 py-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0_/_0.7)] backdrop-blur-md transition-all duration-200 ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
      >
        {TRADITION_OPTIONS.map((o, i) => {
          const selected = o.value === value;
          return (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={selected}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors ${
                i === active ? "bg-gold/10 text-foreground" : "text-muted"
              }`}
            >
              <span className={selected ? "font-medium text-foreground" : ""}>{o.label}</span>
              {selected && <Check className="h-4 w-4 text-gold" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
