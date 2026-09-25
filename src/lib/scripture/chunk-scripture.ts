/**
 * Scripture-aware chunking. Pure, no I/O.
 *
 * Bible: verses are the atoms — a chunk NEVER splits a verse. A section
 * heading always starts a new chunk. Otherwise verses are packed greedily up to
 * `targetTokens`, preferring to break at a paragraph start once the chunk is
 * past `minFill` of the target. No overlap: every verse lives in exactly one
 * chunk, so a ref maps to a precise, non-overlapping set of chunks.
 *
 * Tradition texts: split into sections at headings, then into paragraphs, then
 * packed the same way. Refs name the work and section ("Confessions, Book VIII").
 */
import { countTokens, sanitizeText } from "../chunk";
import type { Tradition } from "./canon";
import type { ScriptureChunk, Verse } from "./types";
import { formatRef } from "./usfm";

export interface PackOptions {
  targetTokens?: number;
  minFill?: number;
}
const DEFAULT_TARGET = 600;
const DEFAULT_MIN_FILL = 0.5;

export function chunkBook(
  verses: Verse[],
  meta: { sourceId: string; code: string; bookName: string; traditions: Tradition[] },
  opts: PackOptions = {},
): ScriptureChunk[] {
  const target = opts.targetTokens ?? DEFAULT_TARGET;
  const minFill = opts.minFill ?? DEFAULT_MIN_FILL;
  const groups: Verse[][] = [];
  let group: Verse[] = [];
  let tokens = 0;

  for (const v of verses) {
    const t = countTokens(v.text);
    const full = group.length > 0 && tokens + t > target;
    const niceBreak = group.length > 0 && v.paragraphStart && tokens >= target * minFill;
    const forced = group.length > 0 && v.heading !== undefined;
    if (full || niceBreak || forced) {
      groups.push(group);
      group = [];
      tokens = 0;
    }
    group.push(v);
    tokens += t;
  }
  if (group.length) groups.push(group);

  return groups.map((g, i) => {
    const first = g[0];
    const last = g[g.length - 1];
    const ref = formatRef(meta.bookName, first, last);
    const heading = g.find((v) => v.heading)?.heading;
    const body = sanitizeText(g.map((v) => v.text).join(" "));
    const content = `${ref}${heading ? ` — ${heading}` : ""}\n\n${body}`;
    return {
      sourceId: meta.sourceId,
      documentKey: `${meta.sourceId}:${meta.code}`,
      documentTitle: meta.bookName,
      chunkIndex: i,
      ref,
      book: meta.code,
      chapterStart: first.chapter,
      verseStart: first.verse,
      verseEnd: last.chapter === first.chapter ? last.verse : null,
      content,
      tokenCount: countTokens(content),
      traditions: meta.traditions,
    };
  });
}

// ---------------------------------------------------------------------------
// Tradition texts (Gutenberg plain text and archive.org OCR)
// ---------------------------------------------------------------------------

export interface Section {
  heading: string;
  paragraphs: string[];
}

/** Share of letters among non-space characters; OCR garbage scores low. */
function letterRatio(line: string): number {
  const chars = line.replace(/\s/g, "");
  if (!chars) return 0;
  const letters = chars.replace(/[^A-Za-z]/g, "").length;
  return letters / chars.length;
}

export interface CleanOptions {
  /** Drop everything before the first line matching this. */
  startAt?: RegExp;
  /** Drop everything from the first line matching this (after startAt). */
  endAt?: RegExp;
  /** Running headers / page furniture to drop. */
  dropLines?: RegExp[];
  /** Inline fragments to remove from every line. */
  inline?: RegExp[];
}

/**
 * Clean OCR / e-text into lines: trims front and back matter, drops page
 * furniture and garbage, and rejoins words hyphenated across line breaks.
 * Blank lines are kept as paragraph separators.
 */
export function cleanText(raw: string, opts: CleanOptions = {}): string[] {
  let lines = sanitizeText(raw).replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n").split("\n");
  if (opts.startAt) {
    const i = lines.findIndex((l) => opts.startAt!.test(l.trim()));
    if (i > 0) lines = lines.slice(i);
  }
  if (opts.endAt) {
    const j = lines.findIndex((l, idx) => idx > 0 && opts.endAt!.test(l.trim()));
    if (j > 0) lines = lines.slice(0, j);
  }
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = stripInline(rawLine, opts.inline ?? []);
    if (line === "") {
      out.push("");
      continue;
    }
    if (/^\d+$/.test(line)) continue; // bare page numbers
    if (opts.dropLines?.some((re) => re.test(line))) continue;
    if (line.length < 40 && letterRatio(line) < 0.6) continue; // OCR debris
    out.push(line);
  }
  // Rejoin hyphenated words: "pro-" + "cess" -> "process".
  for (let i = 0; i < out.length - 1; i++) {
    if (/[a-z]-$/.test(out[i]) && /^[a-z]/.test(out[i + 1])) {
      const [word, ...rest] = out[i + 1].split(" ");
      out[i] = out[i].slice(0, -1) + word;
      out[i + 1] = rest.join(" ");
    }
  }
  return out;
}

/** A short line that looks like a heading: mostly capitals, or "BOOK IV" / "CHAPTER XII". */
export function isHeading(line: string): boolean {
  if (line.length === 0 || line.length > 70) return false;
  if (/^(BOOK|CHAPTER|PART|SECTION)\s+[IVXLC\d]+\.?$/i.test(line)) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.85 && !/[.,;:]$/.test(line.replace(/\.$/, ""));
}

/** Group cleaned lines into headed sections of paragraphs. */
export function toSections(lines: string[], defaultHeading: string): Section[] {
  const sections: Section[] = [];
  let cur: Section = { heading: defaultHeading, paragraphs: [] };
  let para: string[] = [];
  const endPara = () => {
    if (para.length) cur.paragraphs.push(para.join(" ").replace(/\s+/g, " ").trim());
    para = [];
  };
  for (const line of lines) {
    if (line === "") {
      endPara();
      continue;
    }
    if (isHeading(line)) {
      endPara();
      if (cur.paragraphs.length) sections.push(cur);
      cur = { heading: line, paragraphs: [] };
      continue;
    }
    para.push(line);
  }
  endPara();
  if (cur.paragraphs.length) sections.push(cur);
  return sections;
}

/** Pack sections into chunks; a chunk never spans two sections. */
export function chunkSections(
  sections: Section[],
  meta: { sourceId: string; title: string; refPrefix: string; traditions: Tradition[] },
  opts: PackOptions = {},
): ScriptureChunk[] {
  const target = opts.targetTokens ?? DEFAULT_TARGET;
  const chunks: ScriptureChunk[] = [];
  for (const s of sections) {
    // Paragraphs longer than the target are split at sentence boundaries.
    // Drop OCR debris paragraphs (library stamps, scan noise) before packing.
    const paragraphs = s.paragraphs.filter((p) => p.length >= 20 && letterRatio(p) >= 0.75);
    const units = paragraphs.flatMap((p) =>
      countTokens(p) <= target ? [p] : p.split(/(?<=[.!?”"])\s+(?=[A-Z“"])/),
    );
    let buf: string[] = [];
    let tokens = 0;
    let part = 1;
    const emit = () => {
      if (!buf.length) return;
      const ref = `${meta.refPrefix}, ${titleCase(s.heading)}${part > 1 ? ` (part ${part})` : ""}`;
      const body = buf.join("\n\n");
      const content = `${ref}\n\n${body}`;
      chunks.push({
        sourceId: meta.sourceId,
        documentKey: meta.sourceId,
        documentTitle: meta.title,
        chunkIndex: chunks.length,
        ref,
        book: null,
        chapterStart: null,
        verseStart: null,
        verseEnd: null,
        content,
        tokenCount: countTokens(content),
        traditions: meta.traditions,
      });
      buf = [];
      tokens = 0;
      part++;
    };
    for (const u of units) {
      const t = countTokens(u);
      if (buf.length && tokens + t > target) emit();
      buf.push(u);
      tokens += t;
    }
    emit();
  }
  return chunks;
}

function titleCase(heading: string): string {
  if (/[a-z]/.test(heading)) return heading;
  return heading
    .split(" ")
    .map((w) => (/^[IVXLC]+\.?$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Remove inline OCR furniture such as manuscript folio markers ("fol. 29b]"). */
export function stripInline(line: string, patterns: RegExp[]): string {
  return patterns.reduce((acc, re) => acc.replace(re, " "), line).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Rule-driven sectioning for OCR sources, where generic heading detection
// picks up running headers and scan noise.
// ---------------------------------------------------------------------------

export interface SectionRule {
  /**
   * Running header carrying the section title, e.g. "MACARIUS OF ALEXANDRIA 85".
   * Group 1 is the title. A new title starts a new section; the line is dropped.
   */
  runningTitle?: RegExp;
  /** Running header carrying a context label only (e.g. the Synaxarium month). Group 1. */
  runningContext?: RegExp;
  /** A line that opens a new section (e.g. a chapter line or the daily invocation). Dropped. */
  sectionStart?: RegExp;
  /** How to name a section opened by `sectionStart`. */
  name?: "firstWords" | "contextCounter";
}

function firstWords(text: string, n = 8): string {
  const words = text.replace(/^[“"'\s]+/, "").split(/\s+/).slice(0, n).join(" ");
  return `“${words.replace(/[,;:.]+$/, "")}…”`;
}

export function sectionize(lines: string[], rule: SectionRule, defaultHeading: string): Section[] {
  const sections: Section[] = [];
  let cur: Section = { heading: defaultHeading, paragraphs: [] };
  let para: string[] = [];
  let context = "";
  let counter = 0;
  let pendingName = false;

  const endPara = () => {
    if (para.length) {
      const text = para.join(" ").replace(/\s+/g, " ").trim();
      if (pendingName && rule.name === "firstWords" && text.length > 20) {
        cur.heading = firstWords(text);
        pendingName = false;
      }
      cur.paragraphs.push(text);
    }
    para = [];
  };
  const open = (heading: string) => {
    endPara();
    if (cur.paragraphs.length) sections.push(cur);
    cur = { heading, paragraphs: [] };
  };

  for (const line of lines) {
    if (line === "") {
      endPara();
      continue;
    }
    const ctx = rule.runningContext ? line.match(rule.runningContext) : null;
    if (ctx) {
      const next = titleCase(ctx[1].trim());
      if (next !== context) {
        context = next;
        counter = 0;
      }
      continue;
    }
    const rt = rule.runningTitle ? line.match(rule.runningTitle) : null;
    if (rt) {
      const title = titleCase(rt[1].replace(/[\s.•·-]+$/, "").trim());
      if (title !== cur.heading) open(title);
      continue;
    }
    if (rule.sectionStart?.test(line)) {
      if (rule.name === "contextCounter") {
        counter++;
        open(`${context || defaultHeading}, entry ${counter}`);
      } else {
        open(defaultHeading);
        pendingName = true;
      }
      continue;
    }
    para.push(line);
  }
  endPara();
  if (cur.paragraphs.length) sections.push(cur);
  return sections;
}
