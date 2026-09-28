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

import { ocrNumeral, sectionize } from "../src/lib/scripture/chunk-scripture";
import { TEXT_RULES } from "../src/lib/scripture/sources";

test("sectionize: Lausiac running titles become chapter sections", () => {
  const rule = TEXT_RULES.lausiac.sections!;
  const lines = ["MACARIUS OF ALEXANDRIA 85", "He tramped about the desert with sand.", "MOSES THE ROBBER . 86", "Moses was an Ethiopian, black of skin."];
  const s = sectionize(lines, rule, "Prologue");
  assert.deepEqual(s.map((x) => x.heading), ["Macarius Of Alexandria", "Moses The Robber"]);
});

test("sectionize: Synaxarium days counted within the month from the running header", () => {
  const rule = TEXT_RULES.synaxarium.sections!;
  const lines = [
    "FIFTH MONTH — TfeR (JAN. 9-FEB. 7) 101",
    "IN THE NAME OF THE FATHER AND THE SON",
    "ON this day died Abba Moses the Black.",
    "",
    "[fol. 23a i] IN THE NAME OF THE FATHER AND THE SON",
    "ON this day also a martyr was crowned.",
  ];
  const s = sectionize(lines, rule, "Preface");
  assert.deepEqual(s.map((x) => x.heading), ["Ter — “ON this day died Abba Moses the Black…”", "Ter — “ON this day also a martyr was crowned…”"]);
});

test("sectionize: Paradise chapters are named by their opening words", () => {
  const rule = TEXT_RULES.paradise.sections!;
  const lines = ["Chapter jj£. ©f Sbba Hpollo", "THEY say concerning Abba Apollo, who lived in Scete, that he was rude."];
  const s = sectionize(lines, rule, "Introduction");
  assert.equal(s[0].heading, "“THEY say concerning Abba Apollo, who lived in…”");
});

test("Imitation of Christ: book + chapter sections, refs by the text's own paragraph numbers", () => {
  const rule = TEXT_RULES.imitation;
  const raw = [
    "THE FIRST BOOK", "", "ADMONITIONS PROFITABLE FOR THE SPIRITUAL LIFE", "", "CHAPTER I", "",
    "Of the imitation of Christ", "", "He that followeth me shall not walk in darkness,(1) saith the Lord.", "",
    "2. His teaching surpasseth all teaching of holy men.", "", "(1) John viii. 12.", "",
    "THE SECOND BOOK", "", "CHAPTER III", "", "Of the good, peaceable man", "", "First keep thyself in peace.",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), ["Book I, Chapter I", "Book II, Chapter III"]);
  const chunks = chunkSections(s, { sourceId: "imitation", title: "I", refPrefix: rule.refPrefix, traditions: [], paragraphNumbers: true });
  assert.deepEqual(chunks.map((c) => c.ref), ["The Imitation of Christ, Book I, Chapter I §1–2", "The Imitation of Christ, Book II, Chapter III"]);
  assert.doesNotMatch(chunks[0].content, /\(1\)|John viii|ADMONITIONS/);
});

test("Grace Abounding: numbered paragraphs give §refs, unnumbered sections keep parts, italics lose their underscores", () => {
  const rule = TEXT_RULES.grace_abounding;
  const raw = [
    "A PREFACE", "", "CHILDREN, Grace be with you. _Amen_. I write from the _lions’ dens_, to you.", "",
    "GRACE ABOUNDING TO THE CHIEF OF SINNERS", "", "SERVANT, JOHN BUNYAN", "",
    "IN this my relation of the merciful working of God upon my soul.", "", "2.  For my descent then, it was of a low generation.",
  ].join("\n");
  const sections = toSections(cleanText(raw, rule.clean), rule.defaultHeading).map((s) =>
    s.heading in rule.renameHeadings! ? { ...s, heading: rule.renameHeadings![s.heading] } : s,
  );
  const chunks = chunkSections(sections, { sourceId: "ga", title: "G", refPrefix: rule.refPrefix, traditions: [], paragraphNumbers: true });
  assert.deepEqual(chunks.map((c) => c.ref), ["Grace Abounding, A Preface", "Grace Abounding §1–2"]);
  assert.match(chunks[0].content, /Amen\. I write from the lions’ dens, to you/);
});

test("OCR chapter numerals: repaired by the sequence, reordered chapters kept", () => {
  assert.equal(ocrNumeral("XxiIll.", 22), 23);
  assert.equal(ocrNumeral("LXxXiIll.", 72), 73);
  assert.equal(ocrNumeral("XXX VIII", 37), 38);
  assert.equal(ocrNumeral("XCll.", 90), 92); // Charles prints 92 before 91
  assert.equal(ocrNumeral("XCl.", 92), 91);
});

test("CCEL: footnote paragraphs dropped, calls removed without stray spaces, homilies by title", () => {
  const rule = TEXT_RULES.ephrem;
  const raw = [
    "   Three Homilies.", "", "   ------------------------", "", "   On Admonition and Repentance.", "",
    "   1.  Not of compulsion is the doctrine [612] ; of free-will is the word", "   of life. [613]  Whoso is willing.", "",
    "   [612] Luke ii. 29.", "", "   [613] A long footnote that", "   runs over two lines.", "",
    "   2.  Thou canst not hear His words.", "     __________________________________________________________________", "",
    "   Aphrahat.",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), ["On Admonition and Repentance"]);
  const chunks = chunkSections(s, { sourceId: "ephrem", title: "E", refPrefix: rule.refPrefix, traditions: [], paragraphNumbers: true });
  assert.equal(chunks[0].ref, "Ephrem the Syrian, On Admonition and Repentance §1–2");
  assert.match(chunks[0].content, /doctrine; of free-will is the word of life\. Whoso is willing\./);
  assert.doesNotMatch(chunks[0].content, /Luke ii|footnote|\[\d+\]/);
});

test("Kebra Nagast: numbered caps headings checked against the sequence, lost ones become ranges", () => {
  const rule = TEXT_RULES.kebra_nagast;
  const raw = [
    "THE  GLORY  OF   KINGS", "", "i.  CONCERNING  THE  GLORY  OF  KINGS", "", "Come  then,  let  us  consider  the  glory.", "",
    "2  Kings  xviii,  4.", "", "3.  How  KlNG  SOLOMON  SENT  TO  HIS  SON  THE  COM-", "MANDER  OF  HIS  ARMY", "",
    "And  the  king  sent  his  captain  to  him.", "", "5.  CONCERNING  THE  SIN  OF  SOLOMON", "", "Now  Solomon  sinned  an  exceedingly  great  sin.",
    "", "1. The angels appearing to Mary", "", "INDEX",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), [
    "Chapters 1–2: Concerning The Glory Of Kings",
    "Chapters 3–4: How King Solomon Sent To His Son The Commander Of His Army",
    "Chapter 5: Concerning The Sin Of Solomon",
  ]);
  assert.doesNotMatch(s.map((x) => x.paragraphs.join(" ")).join(" "), /Kings xviii/);
});

test("Jubilees: a roman numeral opens a chapter and its first verse; notes and note calls go", () => {
  const rule = TEXT_RULES.jubilees;
  const raw = [
    "Prologue", "", "This is the history of the division of the days l of the law,3 as the Lord spake.", "",
    "I. And it came to pass in the first year of the exodus, in the third month,6 on the sixteenth day.", "",
    "1 The effect of a solar year reckoned at 364 days.", "", "36 THE BOOK OF JUBILEES [chap. I", "",
    "III. And on the six days of the second week we brought.", "", "II. And for Tubal there came forth the fifth portion.", "", "INDEX",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), ["Prologue", "Chapters I–II", "Chapter III"]);
  const all = s.flatMap((x) => x.paragraphs).join(" ");
  assert.match(all, /days of the law, as the Lord/);
  assert.match(all, /^.*And it came to pass in the first year of the exodus, in the third month, on the sixteenth/);
  assert.doesNotMatch(all, /solar year|BOOK OF JUBILEES/);
  assert.match(all, /II\. And for Tubal/); // out of sequence: a verse, not a chapter
});

test("Pilgrim's Progress: cited by the edition's page marks, which leave the text", () => {
  const rule = TEXT_RULES.pilgrims_progress;
  const raw = ["In the Similitude of a Dream", "", "{10} As I walked through the wilderness of this world, I lighted on a den.", "",
    "Then I saw in my dream that he wept and trembled greatly.", "", "{11} In this plight, therefore, he went home and refrained himself.", "",
    "THAT SITTETH UPON THE THRONE, AND UNTO THE LAMB, FOR EVER AND EVER.\"", "", "*** END OF THE PROJECT GUTENBERG EBOOK X ***"].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  const c = chunkSections(s, { sourceId: "pp", title: "P", refPrefix: rule.refPrefix, traditions: [], pageMarks: true });
  assert.deepEqual(c.map((x) => x.ref), ["The Pilgrim's Progress, p. 10–11"]);
  assert.doesNotMatch(c[0].content, /\{\d+\}/);
  assert.match(c[0].content, /UNTO THE LAMB/);
});

test("Isaac of Nineveh: a lone OCR numeral opens a treatise, its capital title is joined and cut short", () => {
  const rule = TEXT_RULES.isaac;
  const raw = ["SIX TREATISES ON THE BEHAVIOUR OF", "EXCELLENCE", "", "The fear of God is the foundation of excellence.", "",
    "EX", "", "ON SINS [COMMITTED] INTENTIONALLY AND WITH", "EVIL WILL", "", "There are sins in which a man is entangled through weakness.", "",
    "ON SINS [COMMITTED] INTENTIONALLY AND WITT ETC. 73", "", "XII", "", "ON THE POWER OF SIN", "", "A man is not freed from the allurements of sin.", "", "REGISTER"].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), [
    "Treatise I: Six Treatises on the Behaviour of Excellence",
    "Treatises IX–XI: On Sins [Committed] Intentionally And With Evil Will",
    "Treatise XII: On The Power Of Sin",
  ]);
  assert.doesNotMatch(s.map((x) => x.paragraphs.join(" ")).join(" "), /ETC/);
});
