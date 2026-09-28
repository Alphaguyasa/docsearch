/**
 * The 1962 Amharic Bible (data/bible-am.json, built by
 * scripts/build-amharic-bible.py), looked up by the English references the
 * site already uses: "Luke 15:17-24", "Psalm 51", "Luke 15:18, 20",
 * "Psalm 51:1–2, 10–12". SERVER-ONLY — the data is 5 MB; client components
 * get their few Amharic lines as plain strings (see prayers.ts).
 *
 * A passage is returned only when it can be shown whole and clean: a book
 * whose verse numbers differ from the English, or a verse that still
 * carries a transliteration leftover, gives null and the page stays English.
 * Jonah 2 is numbered as in Hebrew (the English 1:17 is its 2:1), so it and
 * Jonah 1:17 stay English.
 */
import bible from "../../../data/bible-am.json";

type Book = { title: string; chapters: string[][] };
const BIBLE = bible as Record<string, Book>;

/** Chapters whose Amharic verse numbers do not line up with the English (book → chapters). */
const UNALIGNED: Record<string, number[]> = { Jonah: [1, 2] };

export { AMHARIC_BIBLE_NOTICE } from "./amharic-notice";

export interface AmharicPassage {
  /** e.g. "የሉቃስ ወንጌል 15፥17–24" */
  ref: string;
  text: string;
}

type Span = { c1: number; v1: number; c2: number; v2: number };

/** "15:18, 20" / "51:1–2, 10–12" / "31:20-32:6" / "51" → verse spans. */
export function parseSpans(rest: string): Span[] | null {
  const spans: Span[] = [];
  let chapter = 0;
  for (const raw of rest.replace(/[–—]/g, "-").split(",")) {
    const seg = raw.trim();
    let m = seg.match(/^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
    if (m) {
      chapter = Number(m[1]);
      const v1 = Number(m[2]);
      const c2 = m[3] ? Number(m[3]) : chapter;
      spans.push({ c1: chapter, v1, c2, v2: m[4] ? Number(m[4]) : v1 });
      chapter = c2;
      continue;
    }
    m = seg.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    if (chapter) {
      // A bare verse number after a chapter:verse ("15:18, 20").
      spans.push({ c1: chapter, v1: Number(m[1]), c2: chapter, v2: Number(m[2] ?? m[1]) });
    } else {
      // A whole chapter ("Psalm 51").
      spans.push({ c1: Number(m[1]), v1: 1, c2: Number(m[1]), v2: 999 });
    }
  }
  return spans.length ? spans : null;
}

/** The verses of one span; a verse joined onto the next ("" here) pulls that one in. */
function spanText(book: Book, s: Span): string[] | null {
  const out: string[] = [];
  for (let c = s.c1; c <= s.c2; c++) {
    const ch = book.chapters[c - 1];
    if (!ch) return null;
    const from = c === s.c1 ? s.v1 : 1;
    let to = Math.min(c === s.c2 ? s.v2 : ch.length, ch.length);
    if (from > ch.length) return null;
    while (to < ch.length && !ch[to - 1]) to++;
    for (let v = from; v <= to; v++) if (ch[v - 1]) out.push(ch[v - 1]);
  }
  return out;
}

function amharicRef(title: string, spans: Span[]): string {
  const part = (s: Span) =>
    s.c1 !== s.c2
      ? `${s.c1}፥${s.v1}–${s.c2}፥${s.v2}`
      : s.v2 >= 999
        ? `${s.c1}`
        : s.v1 === s.v2
          ? `${s.c1}፥${s.v1}`
          : `${s.c1}፥${s.v1}–${s.v2}`;
  return `${title} ${spans.map(part).join("፣ ")}`;
}

/** The Amharic text of an English reference, or null if it can't be shown whole and clean. */
export function amharicPassage(ref: string): AmharicPassage | null {
  const m = ref.trim().match(/^(.+?)\s+(\d[\d:,\s–—-]*)$/);
  if (!m) return null;
  const name = m[1] === "Psalms" ? "Psalm" : m[1];
  const book = BIBLE[name];
  if (!book) return null;
  const spans = parseSpans(m[2]);
  if (!spans) return null;
  // Jonah 1:17 is the Amharic 2:1; only Jonah 1:1-16 still lines up in chapter 1.
  const off = UNALIGNED[name] ?? [];
  if (spans.some((s) => off.some((c) => c >= s.c1 && c <= s.c2 && !(c === 1 && s.c2 === 1 && s.v2 <= 16)))) return null;
  const verses: string[] = [];
  for (const s of spans) {
    const t = spanText(book, s);
    if (!t) return null;
    verses.push(...t);
  }
  if (!verses.length || verses.some((v) => /[A-Za-z]/.test(v))) return null;
  return { ref: amharicRef(book.title, spans), text: verses.join(" ") };
}
