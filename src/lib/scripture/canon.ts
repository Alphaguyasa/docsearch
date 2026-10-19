/**
 * Canon map: which traditions treat each WEB (USFM) book as scripture.
 * Source of truth is data/canon.json — see docs/PIVOT.md, decision 3.
 */
import canonJson from "../../../data/canon.json";

export const TRADITIONS = [
  "protestant",
  "catholic",
  "orthodox",
  "eastern_orthodox",
  "oriental_orthodox",
  "ethiopian_orthodox",
] as const;
export type Tradition = (typeof TRADITIONS)[number];


export interface CanonBook {
  code: string;
  name: string;
  traditions: Tradition[];
  section: "protocanon" | "deuterocanon";
  note?: string;
  /** Why the book carries (or lacks) each Orthodox tag, citing `references` keys in [brackets]. */
  basis?: string;
  skip?: boolean;
}

export interface Canon {
  version: number;
  source: string;
  traditions: Tradition[];
  references: Record<string, string>;
  books: CanonBook[];
}

/** Throws with every problem listed, so a bad edit to canon.json fails loudly. */
export function validateCanon(raw: unknown): Canon {
  const c = raw as Canon;
  const problems: string[] = [];
  if (!c || !Array.isArray(c.books)) throw new Error("canon: missing books[]");
  const seen = new Set<string>();
  for (const b of c.books) {
    if (!/^[1-4A-Z][A-Z0-9]{2}$/.test(b.code)) problems.push(`bad code ${b.code}`);
    if (seen.has(b.code)) problems.push(`duplicate code ${b.code}`);
    seen.add(b.code);
    if (!b.name) problems.push(`${b.code}: missing name`);
    for (const t of b.traditions) {
      if (!(TRADITIONS as readonly string[]).includes(t)) problems.push(`${b.code}: unknown tradition ${t}`);
    }
    // A book any Oriental church is unconfirmed for stays out of `oriental_orthodox`
    // and says so (decided 2026-10-18); every other protocanonical book carries all tags.
    const review = /NEEDS REVIEW/.test(b.basis ?? "");
    const expected = TRADITIONS.filter((t) => !(review && t === "oriental_orthodox"));
    if (b.section === "protocanon" && !expected.every((t) => b.traditions.includes(t))) {
      problems.push(`${b.code}: protocanonical books must carry all traditions`);
    }
    if (review && b.traditions.includes("oriental_orthodox")) {
      problems.push(`${b.code}: marked NEEDS REVIEW but tagged oriental_orthodox`);
    }
    // `orthodox` stays the same set as `eastern_orthodox` until Alpha approves removing it.
    if (b.traditions.includes("orthodox") !== b.traditions.includes("eastern_orthodox")) {
      problems.push(`${b.code}: orthodox and eastern_orthodox must go together`);
    }
    // All six Oriental churches include the Ethiopian one.
    if (b.traditions.includes("oriental_orthodox") && !b.traditions.includes("ethiopian_orthodox")) {
      problems.push(`${b.code}: oriental_orthodox without ethiopian_orthodox`);
    }
    if (!b.skip && !b.basis) problems.push(`${b.code}: missing basis (cite why each Orthodox tag is or is not set)`);
    for (const [, key] of (b.basis ?? "").matchAll(/\[([a-z0-9-]+)\]/g)) {
      if (!c.references?.[key]) problems.push(`${b.code}: basis cites unknown reference [${key}]`);
    }
    if (b.section === "deuterocanon" && b.traditions.includes("protestant")) {
      problems.push(`${b.code}: deuterocanonical book tagged protestant`);
    }
    if (!b.skip && b.traditions.length === 0) problems.push(`${b.code}: no traditions but not skipped`);
  }
  if (problems.length) throw new Error(`canon.json invalid:\n  ${problems.join("\n  ")}`);
  return c;
}

let cached: Map<string, CanonBook> | null = null;

export function canonByCode(): Map<string, CanonBook> {
  if (!cached) cached = new Map(validateCanon(canonJson).books.map((b) => [b.code, b]));
  return cached;
}

/** Traditions for a USFM book code. Unknown codes throw: never guess canonicity. */
export function traditionsFor(code: string): Tradition[] {
  const book = canonByCode().get(code);
  if (!book) throw new Error(`canon: unknown book code ${code} — add it to data/canon.json`);
  return book.traditions;
}
