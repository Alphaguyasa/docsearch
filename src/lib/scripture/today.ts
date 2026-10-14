/**
 * The story of the day: one person per day, the same for everyone. The day
 * turns at midnight in Addis Ababa (UTC+3). People are walked in a fixed
 * shuffled order (by a hash of their id), so neighbouring days aren't
 * alphabetical and adding someone new doesn't bunch the list.
 */
import { FIGURES, type Figure } from "./figures";

const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Days since 1970-01-01 in Addis Ababa time. */
export function addisDay(date: Date): number {
  return Math.floor((date.getTime() + ADDIS_OFFSET_MS) / DAY_MS);
}

/** Hour of the day in Addis Ababa (UTC+3). */
export function addisHour(date: Date): number {
  return (date.getUTCHours() + 3) % 24;
}

export function personOfTheDay(date: Date, all: Figure[] = FIGURES): Figure {
  const readable = all
    .filter((f) => f.passages.some((p) => p.sourceId !== "pending"))
    .sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id));
  return readable[addisDay(date) % readable.length];
}
