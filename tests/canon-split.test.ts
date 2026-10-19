import assert from "node:assert/strict";
import { test } from "node:test";

import canonJson from "../data/canon.json";
import { FIGURES } from "../src/lib/scripture/figures";
import { canonByCode, traditionsFor, validateCanon } from "../src/lib/scripture/canon";
import { TEXT_RULES } from "../src/lib/scripture/sources";

// ROADMAP item 3: `orthodox` split into eastern_orthodox / oriental_orthodox.
// oriental_orthodox = books all six Oriental churches read (Alpha, 2026-10-18).

const books = [...canonByCode().values()];
const genesis = { code: "GEN", name: "Genesis", section: "protocanon", basis: "x" };
const withBook = (b: object) => ({ ...canonJson, books: [b] });

test("every Hebrew Bible book is read by every Oriental church", () => {
  for (const code of ["GEN", "PSA", "ISA", "MAL"]) assert.ok(traditionsFor(code).includes("oriental_orthodox"), code);
});

test("the five books the Syriac Peshitta lacks are NEEDS REVIEW and left out", () => {
  for (const code of ["2PE", "2JN", "3JN", "JUD", "REV"]) {
    const b = canonByCode().get(code)!;
    assert.match(b.basis ?? "", /NEEDS REVIEW/, code);
    assert.ok(!b.traditions.includes("oriental_orthodox"), code);
    assert.ok(b.traditions.includes("eastern_orthodox"), code);
  }
  assert.ok(traditionsFor("MAT").includes("oriental_orthodox"));
});

test("deuterocanon: shared books in, books one church lacks out", () => {
  for (const code of ["TOB", "JDT", "WIS", "SIR", "BAR", "SUS", "BEL", "PS2"]) {
    assert.ok(traditionsFor(code).includes("oriental_orthodox"), code);
  }
  // 1-2 Maccabees: not the Ethiopian Meqabyan. 3MA, 1ES, MAN: not in the Coptic list.
  for (const code of ["1MA", "2MA", "3MA", "1ES", "2ES", "MAN", "LJE", "S3Y"]) {
    assert.ok(!traditionsFor(code).includes("oriental_orthodox"), code);
  }
});

test("eastern_orthodox is the same set as the legacy orthodox tag", () => {
  for (const b of books) assert.equal(b.traditions.includes("eastern_orthodox"), b.traditions.includes("orthodox"), b.code);
});

test("every book that is ingested cites a known reference for its tags", () => {
  const refs = (canonJson as { references: Record<string, string> }).references;
  for (const b of books) {
    if (b.skip) continue;
    const keys = [...(b.basis ?? "").matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1]);
    assert.ok(keys.length, `${b.code} cites nothing`);
    for (const k of keys) assert.ok(refs[k]?.includes("https://"), `${b.code} [${k}]`);
  }
});

test("validateCanon rejects broken splits", () => {
  const all = ["protestant", "catholic", "orthodox", "eastern_orthodox", "oriental_orthodox", "ethiopian_orthodox"];
  assert.doesNotThrow(() => validateCanon(withBook({ ...genesis, basis: "[chart]", traditions: all })));
  const noOriental = all.filter((t) => t !== "oriental_orthodox");
  assert.throws(() => validateCanon(withBook({ ...genesis, basis: "[chart]", traditions: noOriental })), /must carry all/);
  assert.doesNotThrow(() => validateCanon(withBook({ ...genesis, basis: "NEEDS REVIEW [chart]", traditions: noOriental })));
  assert.throws(() => validateCanon(withBook({ ...genesis, basis: "NEEDS REVIEW [chart]", traditions: all })), /NEEDS REVIEW/);
  assert.throws(() => validateCanon(withBook({ ...genesis, basis: "[nowhere]", traditions: all })), /unknown reference/);
  assert.throws(() => validateCanon(withBook({ ...genesis, basis: undefined, traditions: all })), /missing basis/);
  const deutero = { code: "TOB", name: "Tobit", section: "deuterocanon", basis: "[chart]" };
  assert.throws(() => validateCanon(withBook({ ...deutero, traditions: ["orthodox"] })), /go together/);
  assert.throws(() => validateCanon(withBook({ ...deutero, traditions: ["oriental_orthodox"] })), /without ethiopian/);
});

test("sources and figures that read as Orthodox carry both new tags", () => {
  for (const [id, rule] of Object.entries(TEXT_RULES)) {
    if (!rule.traditions.includes("orthodox")) continue;
    assert.ok(rule.traditions.includes("eastern_orthodox") && rule.traditions.includes("oriental_orthodox"), id);
  }
  for (const f of FIGURES) {
    if (!f.traditions.includes("orthodox")) continue;
    assert.ok(f.traditions.includes("eastern_orthodox") && f.traditions.includes("oriental_orthodox"), f.id);
  }
});
