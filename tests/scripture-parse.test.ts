import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chunkBook,
  chunkSections,
  cleanText,
  isHeading,
  toSections,
} from "../src/lib/scripture/chunk-scripture";
import { cleanInline, formatRef, parseRef, parseUsfm } from "../src/lib/scripture/usfm";
import type { Verse } from "../src/lib/scripture/types";

const USFM = String.raw`\id 2SA World English Bible
\h 2 Samuel
\mt1 The Second Book of Samuel
\c 11
\s1 David and Bathsheba
\p
\v 1 \w At|strong="H1961"\w* the return,\f + \fr 11:1 \ft note\f* David sent Joab.\x - \xo 11:1 \xt 1 Chr 20:1\x*
\v 2 At evening David arose
\q1 from his bed,
\q2 and walked.
\p
\v 3 David sent and inquired.
\c 12
\d A Psalm.
\v 1 Yahweh sent Nathan.`;

test("parseUsfm: verses, headings, notes and word markers", () => {
  const b = parseUsfm(USFM);
  assert.equal(b.code, "2SA");
  assert.deepEqual(b.verses.map((v) => `${v.chapter}:${v.verse}`), ["11:1", "11:2", "11:3", "12:1"]);
  assert.equal(b.verses[0].text, "At the return, David sent Joab.");
  assert.equal(b.verses[0].heading, "David and Bathsheba");
  assert.equal(b.verses[1].text, "At evening David arose from his bed, and walked.");
  assert.equal(b.verses[3].text, "A Psalm. Yahweh sent Nathan.");
  assert.ok(!b.verses.some((v) => /\\|strong|note|Chr/.test(v.text)), "no markup leaks");
});

test("cleanInline handles nested +w and character styles", () => {
  assert.equal(cleanInline(String.raw`\nd Yahweh\nd* is \+w good|x="1"\+w*`), "Yahweh is good");
});

test("formatRef / parseRef round trip", () => {
  assert.equal(formatRef("2 Samuel", { chapter: 11, verse: 1 }, { chapter: 11, verse: 27 }), "2 Samuel 11:1-27");
  assert.equal(formatRef("Genesis", { chapter: 1, verse: 31 }, { chapter: 2, verse: 3 }), "Genesis 1:31-2:3");
  assert.equal(formatRef("Jude", { chapter: 1, verse: 5 }, { chapter: 1, verse: 5 }), "Jude 1:5");
  assert.deepEqual(parseRef("2 Samuel 11:1-27"), { book: "2 Samuel", c1: 11, v1: 1, c2: 11, v2: 27 });
  assert.deepEqual(parseRef("Genesis 1:31-2:3"), { book: "Genesis", c1: 1, v1: 31, c2: 2, v2: 3 });
  assert.deepEqual(parseRef("Psalm 51"), { book: "Psalm", c1: 51, v1: 1, c2: 51, v2: 999 });
  assert.deepEqual(parseRef("Acts 13:13"), { book: "Acts", c1: 13, v1: 13, c2: 13, v2: 13 });
});

function verses(n: number, words: number, opts: { headingAt?: number[]; paraEvery?: number } = {}): Verse[] {
  return Array.from({ length: n }, (_, i) => ({
    book: "GEN",
    chapter: 1,
    verse: i + 1,
    text: Array.from({ length: words }, (_, w) => `w${i}_${w}`).join(" "),
    paragraphStart: opts.paraEvery ? i % opts.paraEvery === 0 : i === 0,
    ...(opts.headingAt?.includes(i) ? { heading: `H${i}` } : {}),
  }));
}
const META = { sourceId: "web", code: "GEN", bookName: "Genesis", traditions: ["protestant" as const] };

test("chunkBook never splits or repeats a verse", () => {
  const vs = verses(80, 30);
  const chunks = chunkBook(vs, META, { targetTokens: 300 });
  const covered: number[] = [];
  for (const c of chunks) {
    const r = parseRef(c.ref)!;
    for (let v = r.v1; v <= r.v2; v++) covered.push(v);
  }
  assert.deepEqual(covered, vs.map((v) => v.verse));
});

test("chunkBook: a heading always starts a new chunk", () => {
  const chunks = chunkBook(verses(10, 5, { headingAt: [0, 4] }), META, { targetTokens: 10_000 });
  assert.deepEqual(chunks.map((c) => c.ref), ["Genesis 1:1-4", "Genesis 1:5-10"]);
  assert.ok(chunks[1].content.startsWith("Genesis 1:5-10 — H4"));
});

test("chunkBook prefers paragraph breaks once half full", () => {
  const chunks = chunkBook(verses(12, 20, { paraEvery: 4 }), META, { targetTokens: 400 });
  for (const c of chunks.slice(1)) assert.equal((parseRef(c.ref)!.v1 - 1) % 4, 0, c.ref);
});

test("cleanText drops OCR debris and page numbers, rejoins hyphenation", () => {
  const raw = "¥ Uy 1\n+.\n42\nFIRST MONTH—MASKARAM (SEPT. 8-OCT. 7) 99\nthe pro-\ncess of time\n\nNext para.";
  const lines = cleanText(raw, { dropLines: [/^FIRST MONTH/] });
  assert.deepEqual(lines.filter(Boolean), ["the process", "of time", "Next para."]);
});

test("cleanText trims Gutenberg front and back matter", () => {
  const raw = "Title: x\n*** START\nBOOK I\nGreat art Thou.\n*** END OF THE PROJECT GUTENBERG EBOOK\nlicense";
  const lines = cleanText(raw, { startAt: /^BOOK I$/, endAt: /^\*\*\* END OF THE PROJECT GUTENBERG/ });
  assert.deepEqual(lines, ["BOOK I", "Great art Thou."]);
});

test("isHeading", () => {
  for (const h of ["BOOK VIII", "CHAPTER XIX", "MOSES THE ETHIOPIAN", "Chapter 4"]) assert.ok(isHeading(h), h);
  for (const h of ["And he said unto him,", "Great art Thou, O Lord", "I.", "A"]) assert.ok(!isHeading(h), h);
});

test("toSections + chunkSections: refs name the work and section, never cross sections", () => {
  const lines = ["BOOK I", "Great art Thou, O Lord, and greatly to be praised.", "", "Para two is here and long enough.", "BOOK II", "Pears were stolen for the thrill of it."];
  const sections = toSections(lines, "Preface");
  assert.deepEqual(sections.map((s) => s.heading), ["BOOK I", "BOOK II"]);
  const chunks = chunkSections(sections, { sourceId: "confessions", title: "C", refPrefix: "Confessions", traditions: [] });
  assert.deepEqual(chunks.map((c) => c.ref), ["Confessions, Book I", "Confessions, Book II"]);
  assert.match(chunks[1].content, /Pears were stolen/);
});
