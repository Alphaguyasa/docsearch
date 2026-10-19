/**
 * The reader's "My church" choice, and the data tags each choice reads.
 *
 * WHY a separate choice from the data tags: "Oriental Orthodox" is the default
 * view. canon.json now carries `oriental_orthodox` and `eastern_orthodox`
 * (ROADMAP item 3), but rows in the DB only get them once ingest retags, so for
 * now the default still reads every book tagged for an Orthodox church and
 * never a book tagged only Catholic or only Protestant, so Western sources
 * that come back stay opt-in. The next step points the choices at the new tags.
 */
import type { Tradition } from "./canon";

// The choices, in the picker's order; `orthodox` is the Eastern Orthodox choice.
export const TRADITION_CHOICES = ["oriental_orthodox", "protestant", "catholic", "orthodox", "ethiopian_orthodox"] as const;
export type TraditionChoice = (typeof TRADITION_CHOICES)[number];

export const DEFAULT_TRADITION: TraditionChoice = "oriental_orthodox";

const FILTERS: Record<TraditionChoice, Tradition[]> = {
  oriental_orthodox: ["orthodox", "ethiopian_orthodox"],
  ethiopian_orthodox: ["ethiopian_orthodox"],
  orthodox: ["orthodox"],
  catholic: ["catholic"],
  protestant: ["protestant"],
};

/** The tags a choice reads: a passage is shown when it carries ANY of them. */
export function filterFor(choice: TraditionChoice): Tradition[] {
  return FILTERS[choice];
}

/** True when a passage with these tags is read under this choice. */
export function readIn(traditions: readonly string[], choice: TraditionChoice): boolean {
  return traditions.some((t) => FILTERS[choice].includes(t as Tradition));
}

/**
 * A saved choice, checked against what the picker offers. Anything else — the
 * old "all" value, a removed option, junk — falls back to the default.
 */
export function savedChoice(saved: string | null | undefined, offered: readonly string[]): TraditionChoice {
  return saved && offered.includes(saved) && (TRADITION_CHOICES as readonly string[]).includes(saved)
    ? (saved as TraditionChoice)
    : DEFAULT_TRADITION;
}
