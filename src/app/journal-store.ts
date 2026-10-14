/**
 * The private journal, kept only in the reader's own browser: nothing here
 * is ever sent to a server. Days are counted in Addis Ababa days (see
 * addisDay), so "today" matches the rest of the site.
 */
export const JOURNAL_KEY = "not-alone:journal:v1";

export interface JournalEntry {
  day: number;
  text: string;
}

export interface Journal {
  /** The day the reader began (or began again); null before they start. */
  start: number | null;
  /** The days they marked "I prayed today", newest last. */
  prayed: number[];
  /** How many times they began again — never shown as a failure count. */
  restarts: number;
  entries: JournalEntry[];
}

export const EMPTY_JOURNAL: Journal = { start: null, prayed: [], restarts: 0, entries: [] };

const MAX_ENTRIES = 200;
const MAX_PRAYED = 400;

/** Reads what was saved, keeping only well-formed fields (storage can be edited or stale). */
export function parseJournal(raw: string | null): Journal {
  try {
    const j = JSON.parse(raw ?? "null") as Partial<Journal> | null;
    if (!j || typeof j !== "object") return EMPTY_JOURNAL;
    const int = (n: unknown): n is number => Number.isInteger(n);
    return {
      start: int(j.start) ? j.start : null,
      prayed: Array.isArray(j.prayed) ? j.prayed.filter(int).slice(-MAX_PRAYED) : [],
      restarts: int(j.restarts) && j.restarts >= 0 ? j.restarts : 0,
      entries: Array.isArray(j.entries)
        ? j.entries
            .filter((e): e is JournalEntry => !!e && int(e.day) && typeof e.text === "string")
            .slice(0, MAX_ENTRIES)
        : [],
    };
  } catch {
    return EMPTY_JOURNAL;
  }
}

export function begin(j: Journal, today: number): Journal {
  return { ...j, start: today };
}

/** "I fell today": begin again from today, with no record of the fall itself. */
export function beginAgain(j: Journal, today: number): Journal {
  return { ...j, start: today, restarts: j.restarts + 1 };
}

export function markPrayed(j: Journal, today: number): Journal {
  if (j.prayed.includes(today)) return j;
  return { ...j, prayed: [...j.prayed, today].slice(-MAX_PRAYED) };
}

export function addEntry(j: Journal, today: number, text: string): Journal {
  const t = text.trim().slice(0, 4000);
  if (!t) return j;
  return { ...j, entries: [{ day: today, text: t }, ...j.entries].slice(0, MAX_ENTRIES) };
}

export function removeEntry(j: Journal, index: number): Journal {
  return { ...j, entries: j.entries.filter((_, i) => i !== index) };
}

/** Days counted from the start, the first day being day 1. */
export function daysSince(j: Journal, today: number): number {
  return j.start === null ? 0 : Math.max(1, today - j.start + 1);
}

/** The last `n` days, oldest first, each marked whether they prayed. */
export function recentDays(j: Journal, today: number, n = 14): { day: number; prayed: boolean }[] {
  const set = new Set(j.prayed);
  return Array.from({ length: n }, (_, i) => today - (n - 1 - i)).map((day) => ({ day, prayed: set.has(day) }));
}
