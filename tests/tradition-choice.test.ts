import assert from "node:assert/strict";
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

test("default keeps everything an Orthodox church reads today", () => {
  for (const b of canonByCode().values()) {
    if (b.skip || b.traditions.length === 0) continue;
    const orthodox = b.traditions.some((t) => t === "orthodox" || t === "ethiopian_orthodox");
    assert.equal(readIn(b.traditions, DEFAULT_TRADITION), orthodox, b.code);
  }
  for (const [id, rule] of Object.entries(TEXT_RULES)) {
    const western = rule.traditions.every((t) => t === "catholic" || t === "protestant");
    assert.equal(readIn(rule.traditions, DEFAULT_TRADITION), !western, id);
  }
  for (const f of FIGURES) assert.ok(readIn(f.traditions, DEFAULT_TRADITION), f.id);
});

test("Protestant choice excludes the deuterocanon", () => {
  for (const b of canonByCode().values()) {
    if (b.section === "deuterocanon") assert.equal(readIn(b.traditions, "protestant"), false, b.code);
  }
});

test("a saved old 'all' or unknown value falls back to the default", () => {
  assert.equal(savedChoice("all", offered), "oriental_orthodox");
  assert.equal(savedChoice(null, offered), "oriental_orthodox");
  assert.equal(savedChoice("nonsense", offered), "oriental_orthodox");
  // Valid choice the picker does not offer yet (ROADMAP item 2).
  assert.equal(savedChoice("catholic", offered), "oriental_orthodox");
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
