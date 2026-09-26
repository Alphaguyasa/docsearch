"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { TRADITION_OPTIONS, type TraditionChoice } from "@/app/traditions";

import { useT } from "../i18n/client";
import { Check, ChevronDown, Cross } from "./Icons";

/**
 * "My church": a compact pill in the composer's toolbar. On a desktop it
 * opens a popover above itself; on a phone it opens a bottom sheet with
 * large rows, like the system's own pickers. Keyboard: Enter/Space/↑↓ open;
 * ↑↓ Home End move; Enter picks; Esc or Tab closes. Standard
 * combobox/listbox roles for screen readers.
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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = TRADITION_OPTIONS.find((o) => o.value === value) ?? TRADITION_OPTIONS[0];

  // Popover: close on a tap outside. Sheet: its backdrop closes it.
  useEffect(() => {
    if (!open || sheet) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, sheet]);

  // While the sheet is up, the page behind it does not scroll.
  useEffect(() => {
    if (!open || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    list.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet]);

  function show() {
    setActive(
      Math.max(
        0,
        TRADITION_OPTIONS.findIndex((o) => o.value === value),
      ),
    );
    setSheet(window.matchMedia("(max-width: 639px)").matches);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function pick(i: number) {
    onChange(TRADITION_OPTIONS[i].value);
    close();
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
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const options = (big: boolean) =>
    TRADITION_OPTIONS.map((o, i) => {
      const selected = o.value === value;
      return (
        <li
          key={o.value}
          id={`${id}-opt-${i}`}
          role="option"
          aria-selected={selected}
          onPointerEnter={() => setActive(i)}
          onClick={() => pick(i)}
          className={`flex cursor-pointer items-center justify-between gap-3 transition-colors ${
            big ? "rounded-2xl px-4 py-3.5" : "px-4 py-2.5"
          } ${i === active ? "bg-white/[0.07]" : ""}`}
        >
          <span className="min-w-0">
            <span
              className={`block ${big ? "text-[17px]" : "text-sm"} ${
                selected ? "font-medium text-[#f1e9dc]" : "text-[#f1e9dc]/80"
              }`}
            >
              {t.church.options[o.value]}
            </span>
            {big && <span className="mt-0.5 block text-[13px] text-[#b3a48f]">{t.church.hints[o.value]}</span>}
          </span>
          {selected && <Check className={`${big ? "h-5 w-5" : "h-4 w-4"} shrink-0 text-[#e8b560]`} />}
        </li>
      );
    });

  return (
    <div ref={root} className="relative min-w-0">
      <span id={`${id}-label`} className="sr-only">
        {t.church.label}
      </span>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open && !sheet ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-white/[0.06] pl-3 pr-2.5 text-left text-[13px] ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] disabled:opacity-60 aria-expanded:ring-[#e8b560]/60"
      >
        <Cross className="h-4 w-4 shrink-0 text-gold" />
        <span className="hidden text-muted min-[400px]:inline">{t.church.label}</span>
        <span id={`${id}-value`} className="truncate font-medium text-foreground">
          {t.church.options[current.value]}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Desktop: a popover above the pill. */}
      {!sheet && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`absolute bottom-full left-0 z-30 mb-3 w-72 origin-bottom-left overflow-hidden rounded-2xl bg-[#17120d]/95 py-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0_/_0.8)] ring-1 ring-white/10 backdrop-blur-xl transition-all duration-200 ${
            open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
          }`}
        >
          {options(false)}
        </ul>
      )}

      {/* Phone: a bottom sheet, portalled out of the composer's blurred box. */}
      {sheet &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label={t.church.close}
              onClick={close}
              className="sheet-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-sheet-title`}
              className="sheet absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#17120d] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-20px_60px_-20px_rgb(0_0_0_/_0.9)] ring-1 ring-white/10"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" aria-hidden />
              <p id={`${id}-sheet-title`} className="px-4 pb-1 font-display text-2xl font-semibold text-[#f1e9dc]">
                {t.church.label}
              </p>
              <p className="px-4 pb-3 text-[13px] text-[#b3a48f]">{t.church.sheetNote}</p>
              <ul
                ref={list}
                id={`${id}-list`}
                role="listbox"
                tabIndex={-1}
                aria-labelledby={`${id}-sheet-title`}
                aria-activedescendant={`${id}-opt-${active}`}
                onKeyDown={onKey}
                className="space-y-1 outline-none"
              >
                {options(true)}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
