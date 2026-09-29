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

test("Adam and Eve: chapters numbered within each book, OCR numerals and note calls repaired", () => {
  const rule = TEXT_RULES.adam_and_eve;
  const raw = [
    "BOOK I.", "", "CHAPTER I.", "", "On the third day,f God planted1 the garden in the east.", "",
    "* The Ethiopic translator adds here a doxology.", "", "2 THE BOOK OF ADAM AND EVE. [BOOK", "",
    "CHAPTER IT.", "", "\"  0  God, look upon this Thy servant thus fallen,  f  and raise him.", "",
    "BOOK II.", "", "CHAPTER I.", "", "After the death of Adam, Seth wept.", "", "INDEX.",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), ["Book I, Chapter I", "Book I, Chapter II", "Book II, Chapter I"]);
  const all = s.flatMap((x) => x.paragraphs).join(" ");
  assert.match(all, /On the third day, God planted the garden/);
  assert.match(all, /" O God, look upon this Thy servant thus fallen, and raise him/);
  assert.doesNotMatch(all, /doxology|THE BOOK OF ADAM/);
});

test("Miracles of Mary: chapter titles stop at the full stop; plates, captions and Ethiopic lines go", () => {
  const rule = TEXT_RULES.miracles_of_mary;
  const raw = [
    "THE COVENANT OF CHRIST WITH THE BLESSED VIRGIN MARY.", "", "One day our Lord Jesus Christ said unto MARY, speak.", "",
    "CHAPTER II.", "", "THE VIRGIN AND THE CANNIBAL OF THE CITY OF KEMER.", "", "[A fol. 634. 1; B fol. 30a. 1] A MIRACLE OF OUR HOLY LADY.", "",
    "Now there was a certain man in the city of Kemer, and his sin was very great,", "and he lived upon human flesh.", "",
    "PLATE LXXXIX.", "", "ተ፡ልብ፡ሰለጥአኝን", "", "The cannibal gives a drink of water from an earthenware bott", "",
    "and the souls are outw", "", "THE CANNIBAL GIVES A LEPROUS BEGGAR A DRINK IN MARY'S NAME. 84.", "",
    "And the little drop of water outweighed the eight and seventy souls.", "",
    "SALUTATIONS TO THE MEMBERS OF THE BODY OF THE BLESSED",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), [
    "Chapter I: The Covenant Of Christ With The Blessed Virgin Mary",
    "Chapter II: The Virgin And The Cannibal Of The City Of Kemer",
  ]);
  const text = s[1].paragraphs.join(" ");
  assert.match(text, /^A MIRACLE OF OUR HOLY LADY\./);
  assert.match(text, /little drop of water outweighed/);
  assert.doesNotMatch(text, /earthenware|outw$|PLATE|fol\.|84\.|[\u1200-\u137F]/);
});

test("Takla Haymanot: plates, running headers and page-foot notes go; split titles stay", () => {
  const rule = TEXT_RULES.takla_haymanot;
  const prose = "And it came to pass that the holy man went forth unto the city";
  const raw = [
    "CONTENTS", "", "[THE  SCRIBE’S  PREFACE.]", "", "[Page I.] In the Name of God, Who is Three (Fol. 9 a. 2) in His inseparability.", "",
    "CHAPTER  I.", "", "THE  GENEALOGY  OF  TAKLA  HAYMANOT.", "", "Adam1 begat Set (Seth). And Seth begat Henos (Enos).", "",
    "1 Ethiopic tradition asserts that Christ was born in this reign.", "", "HISTORY  OF  ABBA", "",
    "CHAPTER  II.", "", "HOW  gabra  wahad  persuaded  matalome  to  put  the  healing  power", "",
    "OF  TAKLA  HAYMANOT  TO  THE  TEST.", "", "(Fol. 84 b. 1) Then the holy man Gabra Wahad came unto the king.", "",
    "THE LIFE OF TAKLA HAYMAN6T (Folio 23a).", "", "PLATE X.", "", "A'l /D'I'-flA-A*", "", "WiUltl", "",
    "’Egzi’e Haraya being carried off into captivity by the troops of Matalome.", "{See chapter XIII).", "",
    `${prose} of Zorare, and he`, `${prose} of Damot, and he prayed.`,
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), [
    "The Scribe’s Preface",
    "Chapter I: The Genealogy Of Takla Haymanot",
    "Chapter II: How Gabra Wahad Persuaded Matalome To Put The Healing Power Of Takla Haymanot…",
  ]);
  assert.match(cleanText("CHAPTER  VIIA. \nCHAPTER  LIU. ", rule.clean).join("|"), /CHAPTER VII\.\|CHAPTER LIII\./);
  const all = s.flatMap((x) => x.paragraphs).join(" ");
  assert.match(all, /Adam begat Set/);
  assert.match(all, /Then the holy man Gabra Wahad came unto the king\. And it came to pass/);
  assert.doesNotMatch(all, /CONTENTS|Fol\.|Page I|Ethiopic tradition|HISTORY OF ABBA|PLATE|WiUltl|captivity|See chapter/);
});

test("Philoxenus: discourse headings by page mark; footnotes, running headers and broken lines are mended", () => {
  const rule = TEXT_RULES.philoxenus;
  const raw = [
    "INTRODUCTION", "", "NOW    THE    FIRST    DISCOURSE    IS     BY    THE", "GRACE    OF    OUR    LORD    THE    PROLOGUE", "TO   ALL  THIS  VOLUME.", "",
    "Our  Lord  and  our  Redeemer  Jesus  Christ  invited  us.", "", "*  Compare  2  Corinthians  iii.  18.", "",
    "Here  endeth  the  First  Discourse  which  is  the", "Prologue  of  the  volume.", "", "Galatians  ii.  20.", "",
    "[P.  26]  THE  SECOND  DISCOURSE: ", "", "WHICH    TEACHETH  WHICH  IS   THE  FIRST  COMMANDMENT   THAT", "", "OF  CHRIST   SHOUI-D  LAY   HOLD   UPON. ", "",
    "This  is  the  vineyard  for  which  the  master", "", "of  the  house  hired  labourers,  and  every  one  whom  he", "",
    "\"saw  standing  outside  he  accounted  idle.\"", "", "44", "", "THE  SECOND  DISCOURSE.", "", "a the second discourse.", "",
    "r^     r^^  T I  n.iQ     r^ixaJ^.i     rf^ix^.T*.!    KllLr^", "", "Faith  [p.  36]  is  the  foundation.",
  ].join("\n");
  const s = sectionize(cleanText(raw, rule.clean), rule.sections!, rule.defaultHeading);
  assert.deepEqual(s.map((x) => x.heading), ["Discourse I: The Prologue", "Discourse II: On Faith"]);
  assert.deepEqual(s[0].paragraphs, ["Our Lord and our Redeemer Jesus Christ invited us."]);
  assert.deepEqual(s[1].paragraphs, [
    "This is the vineyard for which the master of the house hired labourers, and every one whom he \"saw standing outside he accounted idle.\"",
    "Faith is the foundation.",
  ]);
});
