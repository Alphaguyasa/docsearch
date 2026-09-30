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
  /** Inline fragments to remove from every line (replaced by a space). */
  inline?: RegExp[];
  /** Characters to delete outright, e.g. the underscores Gutenberg uses for italics. */
  strip?: RegExp;
  /** OCR repairs applied to the raw text first (use the m flag for ^ / $), e.g. "|" read for "I". */
  replace?: [RegExp, string][];
  /**
   * Drop picture captions: a mixed-case line standing alone between blank
   * lines with no closing punctuation — under 100 characters when it starts
   * with a capital ("The cannibal gives a drink of water to a leprous b"),
   * under 60 for a broken-off tail ("and the souls are outw"). Headings are all
   * capitals and prose paragraphs run over several lines, so both stay.
   */
  dropCaptions?: boolean;
  /** A paragraph whose first line matches this is dropped whole, e.g. footnotes "[614] Luke ii. 29." */
  dropParagraphs?: RegExp;
  /**
   * A line matching this opens a picture plate (OCR'd Ethiopic lettering and
   * a caption): drop it and what follows up to the next two lines of prose or
   * a CHAPTER heading, looking no further than 80 lines.
   */
  dropPlates?: RegExp;
  /**
   * Drop paragraphs set wholly in capitals (running headers, margin notes)
   * unless the paragraph starts with a match (a chapter heading) or is part
   * of the title under one (up to two paragraphs of capitals).
   */
  keepCapsAfter?: RegExp;
  /**
   * Scans set with a blank line under every line of a page: remove a blank
   * line where the sentence runs on ("…and every one whom he" / "saw standing…").
   */
  joinBrokenLines?: boolean;
  /** Drop lines that are mostly not words: OCR'd Ethiopic or Syriac lettering on plates. */
  dropGarbage?: boolean;
}

/** Share of a line's tokens that look like words ("him,", "“Blessed", "Za’ab"). */
function wordShare(line: string): number {
  const tokens = line.trim().split(/\s+/);
  const words = tokens.filter((t) => /^[“"‘'(\[]*([A-Za-z][a-z’'-]*|[A-Z][A-Z’'-]*)[.,;:!?”"’')\]]*$/.test(t)).length;
  return words / tokens.length;
}

/** A full line of running prose, as a plate's end marker. */
function proseLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 50 && t.length <= 90 && /[a-z]{3}/.test(t) && letterRatio(t) >= 0.85;
}

/**
 * Clean OCR / e-text into lines: trims front and back matter, drops page
 * furniture and garbage, and rejoins words hyphenated across line breaks.
 * Blank lines are kept as paragraph separators.
 */
export function cleanText(raw: string, opts: CleanOptions = {}): string[] {
  let lines = (opts.replace ?? []).reduce((acc, [re, to]) => acc.replace(re, to), sanitizeText(raw)).replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n").split("\n");
  if (opts.startAt) {
    const i = lines.findIndex((l) => opts.startAt!.test(l.trim()));
    if (i > 0) lines = lines.slice(i);
  }
  if (opts.endAt) {
    const j = lines.findIndex((l, idx) => idx > 0 && opts.endAt!.test(l.trim()));
    if (j > 0) lines = lines.slice(0, j);
  }
  if (opts.dropPlates) {
    const kept: string[] = [];
    for (let k = 0; k < lines.length; k++) {
      if (!opts.dropPlates.test(lines[k].trim())) {
        kept.push(lines[k]);
        continue;
      }
      let end = k + 1;
      while (end < Math.min(lines.length, k + 80) && !/^CHAPTER\b/.test(lines[end].trim()) && !(proseLine(lines[end]) && proseLine(lines[end + 1] ?? ""))) end++;
      if (end < k + 80) k = end - 1;
      kept.push("");
    }
    lines = kept;
  }
  const out: string[] = [];
  let skipping = false;
  for (let k = 0; k < lines.length; k++) {
    const rawLine = lines[k];
    if (opts.dropParagraphs) {
      if (rawLine.trim() === "") skipping = false;
      else if (!skipping && (k === 0 || lines[k - 1].trim() === "") && opts.dropParagraphs.test(rawLine.trim())) skipping = true;
      if (skipping) continue;
    }
    const line = stripInline(opts.strip ? rawLine.replace(opts.strip, "") : rawLine, opts.inline ?? []);
    if (line === "") {
      out.push("");
      continue;
    }
    if (/^\d+$/.test(line)) continue; // bare page numbers
    if (opts.dropLines?.some((re) => re.test(line))) continue;
    if (line.length < 40 && letterRatio(line) < 0.6) continue; // OCR debris
    if (opts.dropGarbage && wordShare(line) < 0.5) continue;
    out.push(line);
  }
  if (opts.keepCapsAfter) {
    let titleBlocks = 0; // a title may be split over two paragraphs
    for (let i = 0; i < out.length; i++) {
      if (out[i] === "" || (i > 0 && out[i - 1] !== "")) continue;
      let j = i;
      while (j < out.length && out[j] !== "") j++;
      const caps = out.slice(i, j).every(isCaps);
      if (opts.keepCapsAfter.test(out[i])) titleBlocks = 3;
      else if (caps && titleBlocks === 0) out.fill("", i, j);
      titleBlocks = caps && titleBlocks > 0 ? titleBlocks - 1 : 0;
      i = j - 1;
    }
  }
  if (opts.dropCaptions) {
    const blank = (i: number) => i < 0 || i >= out.length || out[i] === "";
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      if (!l || !blank(i - 1) || !blank(i + 1) || !/[a-z]/.test(l)) continue; // headings are all capitals
      const caption = /^[A-Z]/.test(l)
        ? l.length < 100 && !/[.!?”"'’;:,)\]]$/.test(l)
        : l.length < 60 && !/[.!?”"’]$/.test(l); // a caption's broken-off tail: "and the souls are outw"
      if (caption) out[i] = "";
    }
  }
  if (opts.joinBrokenLines) {
    for (let i = out.length - 2; i > 0; i--) {
      if (out[i] === "" && /[a-z,;-]$/.test(out[i - 1]) && /^["“]?[a-z]/.test(out[i + 1])) out.splice(i, 1);
    }
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

/** A paragraph that opens with its own number: "12. And now…". */
const PARA_NO = /^(\d{1,3})\.\s/;

/** Pack sections into chunks; a chunk never spans two sections. */
export function chunkSections(
  sections: Section[],
  meta: {
    sourceId: string;
    title: string;
    refPrefix: string;
    traditions: Tradition[];
    /** Name chunks by the text's own paragraph numbers ("2. His teaching…") as "§2–4" instead of "(part N)". */
    paragraphNumbers?: boolean;
  },
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
    // Paragraph numbers: an unnumbered paragraph belongs to the last number seen (1 at a section's start).
    let para = 1;
    let firstPara = 1;
    const head = s.heading ? `${meta.refPrefix}, ${titleCase(s.heading)}` : meta.refPrefix;
    const numbered = meta.paragraphNumbers && units.some((u) => PARA_NO.test(u));
    // A long paragraph spread over several chunks: "§4", "§4 (part 2)", …
    const seen = new Map<string, number>();
    const emit = () => {
      if (!buf.length) return;
      let ref = numbered
        ? `${head} §${firstPara}${para > firstPara ? `–${para}` : ""}`
        : `${head}${part > 1 ? ` (part ${part})` : ""}`;
      const n = (seen.get(ref) ?? 0) + 1;
      seen.set(ref, n);
      if (n > 1) ref = `${ref} (part ${n})`;
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
      const n = numbered ? u.match(PARA_NO) : null;
      if (n && Number(n[1]) > para) para = Number(n[1]);
      if (!buf.length) firstPara = para;
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
  name?: "firstWords" | "contextCounter" | "contextFirstWords" | "contextLine" | "chapterNumeral" | "numberedChapter" | "romanChapterStart" | "loneNumeral";
  /** "contextLine": the capture group holding the heading, when the line carries brackets or marks. */
  titleGroup?: number;
  /** Section label for "loneNumeral" ("Treatise"); default "Chapter". */
  label?: string;
  /** "loneNumeral": a title ends at its first line ending in a full stop (the next caps line is text). */
  titleEndsWithPeriod?: boolean;
  /** Map the runningContext capture to a canonical label (OCR-proof). */
  contextLabel?: (capture: string) => string;
}

/** Mostly capitals: an OCR'd heading like "How THE MERCHANT RETURNED". */
function isCaps(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.7;
}

/** Long titles are cut at a word boundary: "Treatise VII: On Other Subjects, Chapter By…". */
function shortTitle(heading: string, max = 90): string {
  if (heading.length <= max) return heading;
  return heading.slice(0, max).replace(/[\s,.;:]+\S*$/, "") + "…";
}

function capsTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.,;:]+$/, "")
    .replace(/(^|[\s(\[“"-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

function roman(n: number): string {
  const table: [number, string][] = [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) (out += s), (n -= v);
  return out;
}

function fromRoman(s: string): number | null {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]];
    const b = v[s[i + 1]] ?? 0;
    n += a < b ? -a : a;
  }
  return n > 0 && roman(n) === s ? n : null; // canonical numerals only
}

/**
 * Read an OCR'd chapter numeral: stray lowercase x / i / l may each be a real
 * X / I or a smudge. Prefer the reading that follows the previous chapter;
 * prefer the reading that follows the previous chapter, else the first
 * canonical one (texts may reorder chapters). Truly ambiguous lines are fixed
 * per source with CleanOptions.replace.
 */
export function ocrNumeral(raw: string, prev: number): number {
  // Y and T are common misreads of V and I in these scans ("XXYI", "IT").
  const t = raw.replace(/[\s.§]/g, "").replace(/Y/g, "V").replace(/T/g, "I");
  const readings: number[] = [];
  for (let mask = 0; mask < 8; mask++) {
    const keep = { x: !(mask & 1), i: !(mask & 2), l: !(mask & 4) };
    const s = t.replace(/[xil]/g, (c) => (keep[c as "x" | "i" | "l"] ? (c === "x" ? "X" : "I") : ""));
    const n = fromRoman(s);
    if (n) readings.push(n);
  }
  return readings.find((n) => n === prev + 1) ?? readings[0] ?? prev + 1;
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
      // Name by the first paragraph that opens like prose (Budge sets the
      // opening word in capitals: "THEY say...", "NOW in Mount Nitria...").
      if (pendingName && text.length > 20 && /^[“"]?[A-Z]{2,}\b/.test(text)) {
        const words = firstWords(text);
        cur.heading = rule.name === "contextFirstWords" && context ? `${context} — ${words}` : words;
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

  let titling = false;
  for (const line of lines) {
    if (line === "") {
      endPara();
      continue;
    }
    if (rule.name === "loneNumeral" && rule.sectionStart) {
      // "XXX" alone on a line, then the title in capitals over one or more lines.
      const m = line.match(rule.sectionStart);
      const n = m ? ocrNumeral(m[1], counter) : NaN;
      // The first numeral may come after unnumbered opening treatises.
      if (m && n > counter && n <= counter + (counter ? 5 : 10)) {
        if (n > counter + 1 && counter > 0) cur.heading = cur.heading.replace(/^(\S+) (\S+?):/, `$1s $2–${roman(n - 1)}:`);
        open(`${rule.label ?? "Chapter"} ${roman(n)}:`);
        counter = n;
        titling = true;
        continue;
      }
      if (titling && !para.length && isCaps(line)) {
        const more = capsTitle(line.replace(/^\d+\s+/, "")); // a page number set before the title
        cur.heading = /[A-Za-z]-$/.test(cur.heading)
          ? cur.heading.slice(0, -1) + more.charAt(0).toLowerCase() + more.slice(1)
          : `${cur.heading} ${more}`;
        if (rule.titleEndsWithPeriod && /\.\s*$/.test(line)) {
          cur.heading = shortTitle(cur.heading);
          titling = false;
        }
        continue;
      }
      if (titling) cur.heading = shortTitle(cur.heading);
      titling = false;
    }
    if (rule.name === "romanChapterStart" && rule.sectionStart) {
      // "VI. And on the new moon…": the numeral opens a chapter and the rest of the line is its first verse.
      const m = line.match(rule.sectionStart);
      const n = m ? ocrNumeral(m[1], counter) : NaN;
      if (m && n > counter && n <= counter + 3) {
        if (n > counter + 1 && counter > 0) cur.heading = cur.heading.replace(/^Chapter (\S+)/, `Chapters $1–${roman(n - 1)}`);
        open(`Chapter ${roman(n)}`);
        counter = n;
        para.push(line.slice(m[0].length).trim());
        continue;
      }
    }
    if (rule.name === "numberedChapter" && rule.sectionStart) {
      // "22. CONCERNING TAMRIN, THE MERCHANT": group 1 the number (OCR may read 1 as i/l), group 2 the title.
      const m = line.match(rule.sectionStart);
      const n = m ? Number(m[1].replace(/[iIl]/g, "1")) : NaN;
      if (m && n > counter && n <= counter + 6 && isCaps(m[2])) {
        // Headings the scan lost: the section before runs up to this one.
        if (n > counter + 1 && counter > 0) cur.heading = cur.heading.replace(/^Chapter (\d+)/, `Chapters $1–${n - 1}`);
        open(`Chapter ${n}: ${capsTitle(m[2])}`);
        counter = n;
        titling = true;
        continue;
      }
      // A heading wrapped onto the next line ("TO THEM").
      if (titling && !para.length && isCaps(line) && line.length < 70) {
        const more = capsTitle(line);
        // "THE COM-" + "MANDER OF HIS ARMY"
        cur.heading = /[A-Za-z]-$/.test(cur.heading) ? cur.heading.slice(0, -1) + more.charAt(0).toLowerCase() + more.slice(1) : `${cur.heading} ${more}`;
        continue;
      }
      titling = false;
    }
    const ctx = rule.runningContext ? line.match(rule.runningContext) : null;
    if (ctx) {
      const next = rule.contextLabel ? rule.contextLabel(ctx[1]) : titleCase(ctx[1].trim());
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
    if (!["numberedChapter", "romanChapterStart", "loneNumeral"].includes(rule.name ?? "") && rule.sectionStart?.test(line)) {
      if (rule.name === "contextFirstWords") {
        open(context || defaultHeading);
        pendingName = true;
      } else if (rule.name === "chapterNumeral") {
        // OCR mangles the numerals ("CHAPTER XxiIll." for XXIII): read them with repairs.
        counter = ocrNumeral(line.replace(/^\S+\s+/, ""), counter);
        open(`${context ? `${context}, ` : ""}Chapter ${roman(counter)}`);
      } else if (rule.name === "contextLine") {
        // "Book I" + "CHAPTER III" -> "Book I, Chapter III"; "Demonstration VII.--Of Penitents." -> "Demonstration VII — Of Penitents".
        // titleGroup picks the heading out of its brackets: "[The parable of the Four Coffers.]".
        const raw = (rule.titleGroup && line.match(rule.sectionStart)?.[rule.titleGroup]) || line;
        const title = shortTitle(titleCase(raw.replace(/\.--/, " — ").replace(/\.$/, "").replace(/([a-z])- ([a-z])/g, "$1$2")));
        open(context ? `${context}, ${title}` : title);
      } else if (rule.name === "contextCounter") {
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
