import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TRADITION_OPTIONS } from "../src/app/traditions";
import { DICTS } from "../src/app/i18n/dict";
import { canonByCode } from "../src/lib/scripture/canon";
import { FIGURES, rankFigures, type Figure } from "../src/lib/scripture/figures";
import { TEXT_RULES } from "../src/lib/scripture/sources";
import {
  DEFAULT_TRADITION,
  TRADITION_CHOICES,
  filterFor,
  readIn,
  savedChoice,
} from "../src/lib/scripture/tradition-choice";

const offered = TRADITION_OPTIONS.map((o) => o.value);

test("Oriental Orthodox is the default and first in the picker", () => {
  assert.equal(DEFAULT_TRADITION, "oriental_orthodox");
  assert.equal(offered[0], "oriental_orthodox");
  assert.ok(!(offered as string[]).includes("all"), "no unfiltered 'all' choice");
});

test("default excludes Protestant-only and Catholic-only sources", () => {
  assert.equal(readIn(["protestant"], DEFAULT_TRADITION), false);
  assert.equal(readIn(["catholic"], DEFAULT_TRADITION), false);
  assert.equal(readIn(["protestant", "catholic"], DEFAULT_TRADITION), false);
  // A Catholic-only figure (e.g. from The Imitation of Christ) stays out of the default.
  const western = { ...FIGURES[0], id: "western_only", traditions: ["catholic"] } as Figure;
  const tags = western.sins.slice(0, 1);
  assert.ok(!rankFigures(tags, filterFor(DEFAULT_TRADITION), 99, [western]).length);
  assert.ok(rankFigures(tags, filterFor("catholic"), 99, [western]).length, "opt-in still finds it");
});

test("default reads only what all six Oriental churches share", () => {
  for (const b of canonByCode().values()) {
    if (b.skip || b.traditions.length === 0) continue;
    assert.equal(readIn(b.traditions, DEFAULT_TRADITION), b.traditions.includes("oriental_orthodox"), b.code);
  }
  // Decided 2026-10-18: Ethiopian-only books stay under "Ethiopian Orthodox Tewahedo".
  for (const code of ["REV", "1MA", "2ES", "MAN"]) {
    assert.equal(readIn(canonByCode().get(code)!.traditions, DEFAULT_TRADITION), false, code);
  }
  for (const [id, rule] of Object.entries(TEXT_RULES)) {
    const ethOnly = rule.traditions.length === 1 && rule.traditions[0] === "ethiopian_orthodox";
    const western = rule.traditions.every((t) => t === "catholic" || t === "protestant");
    assert.equal(readIn(rule.traditions, DEFAULT_TRADITION), !western && !ethOnly, id);
    if (ethOnly) assert.ok(readIn(rule.traditions, "ethiopian_orthodox"), id);
  }
  for (const f of FIGURES) {
    const ethOnly = f.traditions.length === 1 && f.traditions[0] === "ethiopian_orthodox";
    assert.equal(readIn(f.traditions, DEFAULT_TRADITION), !ethOnly, f.id);
    assert.ok(readIn(f.traditions, "ethiopian_orthodox"), f.id);
  }
});

test("Eastern Orthodox keeps its saved value but reads the split tag", () => {
  assert.deepEqual(filterFor("orthodox"), ["eastern_orthodox"]);
  for (const b of canonByCode().values()) {
    if (b.skip) continue;
    assert.equal(readIn(b.traditions, "orthodox"), b.traditions.includes("eastern_orthodox"), b.code);
  }
  assert.ok(readIn(canonByCode().get("3MA")!.traditions, "orthodox"));
  assert.ok(!readIn(canonByCode().get("2ES")!.traditions, "orthodox"));
});

test("picker offers Oriental, Ethiopian, then the opt-in traditions", () => {
  assert.deepEqual(offered, ["oriental_orthodox", "ethiopian_orthodox", "orthodox", "catholic", "protestant"]);
});

test("every picker option maps to its own tradition's books", () => {
  for (const choice of offered) {
    assert.ok(filterFor(choice).length, choice);
    // Every protocanonical book is read under every choice, except the NEEDS REVIEW
    // ones the default leaves out until every Oriental church is confirmed.
    for (const b of canonByCode().values()) {
      const review = choice === "oriental_orthodox" && /NEEDS REVIEW/.test(b.basis ?? "");
      if (b.section === "protocanon" && !review) assert.ok(readIn(b.traditions, choice), `${choice} ${b.code}`);
    }
  }
});

test("the Protestant picker option excludes the deuterocanon", () => {
  const protestant = offered.find((c) => c === "protestant")!;
  for (const b of canonByCode().values()) {
    if (b.section === "deuterocanon") assert.equal(readIn(b.traditions, protestant), false, b.code);
  }
  // And Ethiopian-only and deuterocanonical figures stay out of Protestant results.
  for (const f of FIGURES) {
    if (!f.traditions.includes("protestant")) assert.equal(readIn(f.traditions, protestant), false, f.id);
  }
});

test("the Catholic option reads the deuterocanon but not Ethiopian-only books", () => {
  const canon = canonByCode();
  assert.ok(readIn(canon.get("TOB")!.traditions, "catholic"));
  assert.ok(readIn(canon.get("1MA")!.traditions, "catholic"));
  assert.equal(readIn(canon.get("2ES")!.traditions, "catholic"), false);
  assert.equal(readIn(canon.get("3MA")!.traditions, "catholic"), false);
});

test("a saved old 'all' or unknown value falls back to the default", () => {
  assert.equal(savedChoice("all", offered), "oriental_orthodox");
  assert.equal(savedChoice(null, offered), "oriental_orthodox");
  assert.equal(savedChoice("nonsense", offered), "oriental_orthodox");
  assert.equal(savedChoice("catholic", offered), "catholic");
  assert.equal(savedChoice("protestant", ["oriental_orthodox"]), "oriental_orthodox", "not offered");
  assert.equal(savedChoice("ethiopian_orthodox", offered), "ethiopian_orthodox");
});

test("every choice has a label and hint in English and Amharic", () => {
  for (const lang of Object.keys(DICTS) as (keyof typeof DICTS)[]) {
    for (const c of TRADITION_CHOICES) {
      assert.ok(DICTS[lang].church.options[c], `${lang} label ${c}`);
      assert.ok(DICTS[lang].church.hints[c], `${lang} hint ${c}`);
    }
  }
});

test("the Telegram bot asks for the default church, not 'no filter'", () => {
  // The bot has no picker; an omitted tradition would let opt-in sources through.
  const src = readFileSync("src/app/api/telegram/route.ts", "utf8");
  assert.match(src, /const tradition = DEFAULT_TRADITION;/);
  assert.match(src, /JSON\.stringify\(\{ question: text, tradition \}\)/);
  assert.doesNotMatch(src, /peopleFor\(text\)/, "fallback people use the same filter");
});
