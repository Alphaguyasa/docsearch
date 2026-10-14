/**
 * USFM -> verses. Pure, no I/O.
 *
 * Handles what eBible.org's WEB USFM uses: \id \c \v, section headings (\s\d?),
 * psalm titles (\d), paragraph/poetry markers, footnotes (\f..\f*) and cross
 * references (\x..\x*) which are removed entirely, word markers
 * (\w text|attrs\w*) which keep only the text, and character styles
 * (\wj \add \nd ...) which keep their content.
 */
import type { Verse } from "./types";

/** Peripheral books in eBible zips: not scripture, skipped. */
export const PERIPHERAL = new Set(["FRT", "BAK", "OTH", "INT", "CNC", "GLO", "TDX", "NDX", "TOC"]);

/** Paragraph-level markers: they start a new block and never carry a closing \*. */
const BLOCK_MARKERS =
  "c|v|s\\d?|ms\\d?|mr|sr|r|d|sp|cl|mt\\d?|mte\\d?|toc\\d|h|id|ide|rem|usfm|sts|periph|" +
  "p|m|pi\\d?|mi|nb|pc|pm|pmo|pmc|pmr|ph\\d?|q\\d?|qc|qr|qa|qm\\d?|li\\d?|b|ie|ip|is\\d?|imt\\d?";
const SPLIT = new RegExp(`(?=\\\\(?:${BLOCK_MARKERS})(?=\\s|$))`);
const PARAGRAPHISH = /^(p|m|pi\d?|mi|nb|pc|pm|pmo|pmc|pmr|ph\d?|q\d?|qc|qr|qm\d?|li\d?|b)$/;
const SKIPPED = /^(ms\d?|mr|sr|r|sp|cl|mt\d?|mte\d?|toc\d|h|id|ide|rem|usfm|sts|periph|qa|ie|ip|is\d?|imt\d?)$/;

/** Strip inline markup from a run of verse text. */
export function cleanInline(text: string): string {
  return text
    .replace(/\\f\s.*?\\f\*/g, "") // footnotes
    .replace(/\\fe\s.*?\\fe\*/g, "") // endnotes
    .replace(/\\x\s.*?\\x\*/g, "") // cross references
    .replace(/\\\+?w\s([^|\\]*?)(\|[^\\]*)?\\\+?w\*/g, "$1") // \w word|strong="..."\w*
    .replace(/\\\+?[a-z]+\d?\*/g, "") // closing character markers
    .replace(/\\\+?[a-z]+\d?(\s|$)/g, "") // opening character markers
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedBook {
  code: string;
  verses: Verse[];
}

export function parseUsfm(source: string): ParsedBook {
  const idMatch = source.match(/^\\id\s+([0-9A-Z]{3})/m);
  if (!idMatch) throw new Error("usfm: no \\id line");
  const code = idMatch[1];

  // Remove notes up front: they contain markers (\fr, \ft) that would confuse splitting.
  const body = source
    .replace(/\r\n?/g, "\n")
    .replace(/\\f\s[\s\S]*?\\f\*/g, "")
    .replace(/\\fe\s[\s\S]*?\\fe\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "")
    .replace(/\n/g, " ");

  const verses: Verse[] = [];
  let chapter = 0;
  let current: Verse | null = null;
  let pendingHeading: string | undefined;
  let pendingParagraph = true;
  let preface = ""; // text before the next verse (psalm titles, stray paragraph text)

  const flush = () => {
    if (current) {
      current.text = cleanInline(current.text);
      if (current.text) verses.push(current);
    }
    current = null;
  };

  for (const seg of body.split(SPLIT)) {
    const m = seg.match(/^\\([a-z]+\d?)(?:\s+([\s\S]*))?$/);
    if (!m) {
      if (current) current.text += " " + seg; // leading text before first marker
      continue;
    }
    const marker = m[1];
    const rest = (m[2] ?? "").trim();

    if (marker === "c") {
      flush();
      chapter = Number(rest.split(/\s/)[0]);
      pendingParagraph = true;
      preface = "";
    } else if (marker === "v") {
      flush();
      const v = rest.match(/^(\d+)(?:-\d+)?\s*([\s\S]*)$/);
      if (!v) continue;
      const lead = preface.trim() ? cleanInline(preface) + " " : "";
      preface = "";
      current = {
        book: code,
        chapter,
        verse: Number(v[1]),
        text: lead + v[2],
        paragraphStart: pendingParagraph,
        ...(pendingHeading ? { heading: pendingHeading } : {}),
      };
      pendingHeading = undefined;
      pendingParagraph = false;
    } else if (marker === "d") {
      flush();
      preface += " " + rest;
    } else if (/^s\d?$/.test(marker)) {
      flush();
      pendingHeading = cleanInline(rest);
      pendingParagraph = true;
    } else if (PARAGRAPHISH.test(marker)) {
      // A new block. Text after the marker belongs to the verse in progress
      // (verses often continue across poetry lines).
      if (current) current.text += " " + rest;
      else preface += " " + rest;
      pendingParagraph = true;
    } else if (SKIPPED.test(marker)) {
      // titles, TOC, intro material: not verse text
    } else if (current) {
      current.text += " " + seg; // unexpected marker: keep text, cleanInline strips the marker
    }
  }
  flush();
  return { code, verses };
}

/** "2 Samuel 11:1-27", "Genesis 1:31-2:3", "Jude 1:5". */
export function formatRef(
  bookName: string,
  start: { chapter: number; verse: number },
  end: { chapter: number; verse: number },
): string {
  if (start.chapter === end.chapter) {
    return start.verse === end.verse
      ? `${bookName} ${start.chapter}:${start.verse}`
      : `${bookName} ${start.chapter}:${start.verse}-${end.verse}`;
  }
  return `${bookName} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
}

/** Parse a ref like "2 Samuel 11:1-27" into its parts; null if not verse-shaped. */
export function parseRef(
  ref: string,
): { book: string; c1: number; v1: number; c2: number; v2: number } | null {
  const m = ref.match(/^(.+?)\s+(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
  if (!m) return null;
  const book = m[1];
  const c1 = Number(m[2]);
  if (m[3] === undefined) {
    // Whole chapter, e.g. "Psalm 51"
    return { book, c1, v1: 1, c2: c1, v2: 999 };
  }
  const v1 = Number(m[3]);
  if (m[4] === undefined) return { book, c1, v1, c2: c1, v2: v1 };
  if (m[5] === undefined) return { book, c1, v1, c2: c1, v2: Number(m[4]) };
  return { book, c1, v1, c2: Number(m[4]), v2: Number(m[5]) };
}
