import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MIN_TEXT_QUALITY,
  segmentCcel,
  segmentEbible,
  segmentOcr,
  textQuality,
  trimToTextStart,
} from "../src/lib/corpus/segment";

describe("segmentEbible", () => {
  const sample = [
    "GEN 1:1 In the beginning God made the heaven and the earth.",
    "GEN 1:2 But the earth was unsightly and unfurnished.",
    "GEN 1:3 And God said, Let there be light.",
  ].join("\n");

  test("recovers a real chapter:verse reference", () => {
    const [section] = segmentEbible(sample);
    assert.equal(section.reference, "Genesis 1:1-3");
    assert.equal(section.book, "Genesis");
  });

  test("keeps verse numbers inline so a quotation stays checkable", () => {
    const [section] = segmentEbible(sample);
    assert.match(section.text, /^1\. In the beginning/);
    assert.match(section.text, /3\. And God said/);
  });

  test("never runs a section across a chapter boundary", () => {
    const across = [
      "GEN 1:30 And it was so.",
      "GEN 1:31 And God saw all the things.",
      "GEN 2:1 And the heavens and the earth were finished.",
    ].join("\n");

    const sections = segmentEbible(across, 12);
    assert.equal(sections.length, 2, "a chapter change must start a new section");
    assert.equal(sections[0].reference, "Genesis 1:30-31");
    assert.equal(sections[1].reference, "Genesis 2:1");
  });

  test("never runs a section across a book boundary", () => {
    const across = ["MAL 4:6 Lest I come and smite the earth.", "MAT 1:1 The book of the generation."].join("\n");
    const sections = segmentEbible(across, 12);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].book, "Malachi");
    assert.equal(sections[1].book, "Matthew");
  });

  test("splits a long chapter at the verse budget", () => {
    const long = Array.from({ length: 25 }, (_, i) => `PSA 50:${i + 1} verse text here`).join("\n");
    const sections = segmentEbible(long, 10);
    assert.deepEqual(
      sections.map((s) => s.reference),
      ["Psalms 50:1-10", "Psalms 50:11-20", "Psalms 50:21-25"],
    );
  });

  test("names the deuterocanonical books rather than leaving raw codes", () => {
    // The whole reason the book table is written out: an Orthodox canon
    // includes these, and a generic 66-book table renders them as "SIR".
    const deutero = ["SIR 2:1 My son, if you come to serve the Lord.", "WIS 3:1 The souls of the righteous."].join("\n");
    const sections = segmentEbible(deutero);
    assert.equal(sections[0].book, "Sirach");
    assert.equal(sections[1].book, "Wisdom of Solomon");
  });

  test("ignores front matter and blank lines", () => {
    const noisy = ["The Holy Bible", "", "GEN 1:1 In the beginning.", "  ", "not a verse line"].join("\n");
    const sections = segmentEbible(noisy);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].reference, "Genesis 1:1");
  });

  test("skips verses that are present in the versification but empty here", () => {
    const gapped = ["GEN 1:1 In the beginning.", "GEN 1:2 ", "GEN 1:3 And God said."].join("\n");
    const [section] = segmentEbible(gapped);
    assert.equal(section.reference, "Genesis 1:1-3");
    assert.doesNotMatch(section.text, /2\.\s+3\./);
  });
});

describe("segmentCcel", () => {
  const rule = "_".repeat(40);
  const body = (word: string): string =>
    Array.from({ length: 12 }, (_, i) => `${word} sentence number ${i} of the body text.`).join(" ");

  test("splits on the section rules and titles each section", () => {
    const raw = [
      rule,
      "",
      "  Homily I. On Patience.",
      "",
      `   ${body("first")}`,
      rule,
      "",
      "  Homily II. On Anger.",
      "",
      `   ${body("second")}`,
    ].join("\n");

    const sections = segmentCcel(raw, "NPNF1-09");
    assert.equal(sections.length, 2);
    assert.equal(sections[0].reference, "NPNF1-09 — Homily I. On Patience.");
    assert.equal(sections[1].reference, "NPNF1-09 — Homily II. On Anger.");
  });

  test("a heading is not swallowed into the body it titles", () => {
    const raw = [rule, "", "  Homily I. On Patience.", "", `   ${body("first")}`].join("\n");
    const [section] = segmentCcel(raw, "NPNF1-09");
    assert.doesNotMatch(section.text, /Homily I\. On Patience/);
    assert.match(section.text, /first sentence number 0/);
  });

  test("a long opening line is body text, not a heading, and is never dropped", () => {
    // The failure this guards against is silent: mistake a first sentence for a
    // title and that sentence vanishes from the corpus entirely.
    const opening =
      "This opening line is far too long to be a section heading and is plainly the first sentence of a paragraph of real body text.";
    const raw = [rule, "", `   ${opening}`, "", `   ${body("more")}`].join("\n");

    const [section] = segmentCcel(raw, "ANF-01");
    assert.equal(section.reference, "ANF-01");
    assert.match(section.text, /This opening line is far too long/);
  });

  test("drops navigation stubs too short to hold a thought", () => {
    const raw = [rule, "", "  Contents", "", "   Chapter I.", rule, "", "  Real Section", "", `   ${body("real")}`].join("\n");
    const sections = segmentCcel(raw, "ANF-01");
    assert.equal(sections.length, 1);
    assert.equal(sections[0].reference, "ANF-01 — Real Section");
  });
});

describe("trimToTextStart", () => {
  test("returns the text untouched when no marker is configured", () => {
    const raw = "introduction\n\nThe words of the blessing";
    assert.deepEqual(trimToTextStart(raw), { text: raw, found: false });
  });

  test("drops everything before the marker", () => {
    const raw = "Editor's introduction, at length.\n\nThe words of the blessing of Enoch";
    const { text, found } = trimToTextStart(raw, "The words of the blessing of Enoch");
    assert.equal(found, true);
    assert.equal(text, "The words of the blessing of Enoch");
  });

  test("matches across the doubled spaces OCR produces", () => {
    // The literal-match version of this function failed on exactly this, and
    // failed silently — the front matter was ingested as though it were the
    // work.
    const raw = "front matter\n\nThis  is  the  history  of  the  division  of  the  days";
    const { text, found } = trimToTextStart(raw, "This is the history of the division of the days");
    assert.equal(found, true);
    assert.match(text, /^This {2}is {2}the {2}history/);
  });

  test("anchors on the last occurrence, not a quotation in the introduction", () => {
    // An introduction quotes the work's opening line; the text proper follows.
    const raw = [
      "Prologue of our Book: This is the history of the division, as the editor notes.",
      "More introduction.",
      "This is the history of the division of the days",
    ].join("\n\n");

    const { text } = trimToTextStart(raw, "This is the history of the division");
    assert.doesNotMatch(text, /Prologue of our Book/);
    assert.doesNotMatch(text, /More introduction/);
  });

  test("a marker that no longer matches keeps the whole work rather than losing it", () => {
    const raw = "the entire book, whose marker has drifted after a re-scan";
    const { text, found } = trimToTextStart(raw, "a line that is not present");
    assert.equal(found, false);
    assert.equal(text, raw, "a stale marker must not silently discard the text");
  });
});

describe("textQuality", () => {
  const clean =
    "There was an innate original communion between men and heaven, obscured through ignorance, but which now at length has leapt forth instantaneously from the darkness, and shines resplendent.";

  // From the OCR of the 1912 Charles edition of Enoch — the critical apparatus
  // that motivated the whole quality filter. Note it is genuinely PART English:
  // a scorer that only asks "does this look like letters" rates it 0.97.
  const apparatus =
    "G* 'and the tr- ee', vv. 16 kuel- antaha corr. G& om. E cf. 2 Bar. 295 &c. " +
    "KaTdpay karaBnocrar em avTd, pexpis Huepas Kploews THs peyddns. ey TO Kaipm " +
    "exelvm Kataxavdnoerat Kal ramewwOn 4 dxatackevdorov. 2. Kdket eea- capnv Epyov " +
    "oBepev' eepaxa my otre otpavoyv emdyw, ovTe yhv dyadAtdoovra puTevOnoera.";

  test("clean patristic prose scores near the top", () => {
    assert.ok(textQuality(clean) > 0.9, `expected > 0.9, got ${textQuality(clean)}`);
  });

  test("OCR apparatus scores below the ingestion floor", () => {
    const score = textQuality(apparatus);
    assert.ok(score < MIN_TEXT_QUALITY, `expected < ${MIN_TEXT_QUALITY}, got ${score}`);
  });

  test("the two are separated by the threshold, not merely ordered", () => {
    // The point of the constant is that a single cut-off works for both. If
    // this ever fails, MIN_TEXT_QUALITY needs recalibrating, not the caller.
    assert.ok(textQuality(clean) >= MIN_TEXT_QUALITY);
    assert.ok(textQuality(apparatus) < MIN_TEXT_QUALITY);
  });

  test("shattered single characters score low even though each is letter-like", () => {
    assert.ok(textQuality("a b c d e f g h i j k l m n o p") < MIN_TEXT_QUALITY);
  });

  test("empty and too-short input scores zero rather than dividing by zero", () => {
    assert.equal(textQuality(""), 0);
    assert.equal(textQuality("   "), 0);
    assert.equal(textQuality("only four words here"), 0);
  });
});

describe("segmentOcr", () => {
  // Both fixtures clear MIN_OCR_PARAGRAPH_CHARS. Below that a block is skipped
  // before it is ever scored, which would make these tests pass for the wrong
  // reason — they would be exercising the length floor, not the quality filter.
  const good = (n: number): string =>
    `This is paragraph ${n} of perfectly readable English prose. It runs on for long enough that the quality test can judge it fairly, and it is written in the ordinary English of a book, with the function words and sentence shapes that real prose has.`;
  const bad =
    "G* 'and the tr- ee', vv. 16 kuel- antaha corr. G& om. E cf. 2 Bar. 295 &c. " +
    "KaTdpay karaBnocrar em avTd, pexpis Huepas Kploews THs peyddns. ey TO Kaipm " +
    "exelvm Kataxavdnoerat Kal ramewwOn 4 dxatackevdorov. 2. Kdket eea- capnv Epyov " +
    "oBepev' eepaxa my otre otpavoyv emdyw, ovTe yhv dyadAtdoovra puTevOnoera.";

  test("keeps good paragraphs and reports the dropped ones", () => {
    const raw = [good(1), bad, good(2)].join("\n\n");
    const { sections, rejected } = segmentOcr(raw, "The Book of Enoch");
    assert.equal(rejected, 1);
    const kept = sections.map((s) => s.text).join(" ");
    assert.match(kept, /paragraph 1/);
    assert.match(kept, /paragraph 2/);
    assert.doesNotMatch(kept, /kuel/);
  });

  test("does not glue text across the hole a dropped paragraph leaves", () => {
    // Joining these would assert an adjacency the page does not have.
    const raw = [good(1), bad, good(2)].join("\n\n");
    const { sections } = segmentOcr(raw, "The Book of Enoch");
    assert.equal(sections.length, 2);
  });

  test("merges consecutive good paragraphs into one section", () => {
    const raw = [good(1), good(2), good(3)].join("\n\n");
    const { sections, rejected } = segmentOcr(raw, "The Paradise of the Fathers");
    assert.equal(rejected, 0);
    assert.equal(sections.length, 1);
  });

  test("references are ordered and name the work", () => {
    const raw = [good(1), bad, good(2)].join("\n\n");
    const { sections } = segmentOcr(raw, "The Book of Enoch");
    assert.deepEqual(
      sections.map((s) => s.reference),
      ["The Book of Enoch (part 1)", "The Book of Enoch (part 2)"],
    );
    assert.deepEqual(
      sections.map((s) => s.ordinal),
      [0, 1],
    );
  });

  test("skips short blocks before scoring them, and counts them separately", () => {
    // The index lines, tables of contents and running heads that dominate a
    // scanned book. Every one of these is legible English and scores WELL —
    // which is exactly why the length floor exists and the quality score alone
    // was not enough.
    const indexLines = [
      "65. The Sin of Solomon 104",
      "345, 347, 838-40 Victor the Alexandrian, 1255",
      "SIXTH MONTH — YAKATIT (FEB. 6-MARCH 6) 573",
    ].join("\n\n");

    const { sections, tooShort, rejected } = segmentOcr(indexLines, "Some Scan");
    assert.equal(sections.length, 0);
    assert.equal(tooShort, 3);
    assert.equal(rejected, 0, "short blocks are skipped, not scored and rejected");
  });

  test("a wholly unreadable scan yields nothing rather than garbage", () => {
    const raw = [bad, bad, bad].join("\n\n");
    const { sections, rejected } = segmentOcr(raw, "Bad Scan");
    assert.equal(sections.length, 0);
    assert.equal(rejected, 3);
  });
});
