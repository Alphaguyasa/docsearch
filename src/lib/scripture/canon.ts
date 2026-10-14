/**
 * Canon map: which traditions treat each WEB (USFM) book as scripture.
 * Source of truth is data/canon.json — see docs/PIVOT.md, decision 3.
 */
import canonJson from "../../../data/canon.json";

export const TRADITIONS = ["protestant", "catholic", "orthodox", "ethiopian_orthodox"] as const;
export type Tradition = (typeof TRADITIONS)[number];

export interface CanonBook {
  code: string;
  name: string;
  traditions: Tradition[];
  section: "protocanon" | "deuterocanon";
  note?: string;
  skip?: boolean;
}

export interface Canon {
  version: number;
  source: string;
  traditions: Tradition[];
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
    if (b.section === "protocanon" && b.traditions.length !== TRADITIONS.length) {
      problems.push(`${b.code}: protocanonical books must carry all traditions`);
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
