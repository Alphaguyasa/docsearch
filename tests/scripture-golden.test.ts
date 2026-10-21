/**
 * The scripture golden set must name things that exist. A typo in a figure id,
 * a source key or a book code would make a tradition check pass vacuously
 * (nothing can match a name that does not exist), so the eval would report
 * "clean" without checking anything. These tests read the set, not retrieval:
 * no network, no model.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import canon from "../data/canon.json";
import golden from "../eval/scripture-golden.json";
import { TRADITIONS, type Tradition } from "../src/lib/scripture/canon";
import { FIGURES } from "../src/lib/scripture/figures";
import { TEXT_RULES } from "../src/lib/scripture/sources";

interface Q {
  id: string;
  type: string;
  split?: string;
  tradition?: Tradition;
  expectFigures?: string[];
  forbidBooks?: string[];
  forbidSources?: string[];
  forbidFigures?: string[];
}

const questions = golden.questions as Q[];
const figure = (id: string) => FIGURES.find((f) => f.id === id);
const book = (code: string) => canon.books.find((b) => b.code === code);

test("golden set: ids are unique", () => {
  const ids = questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("golden set: every tradition, figure, source and book it names exists", () => {
  for (const q of questions) {
    if (q.tradition) assert.ok(TRADITIONS.includes(q.tradition), `${q.id}: unknown tradition ${q.tradition}`);
    for (const f of [...(q.expectFigures ?? []), ...(q.forbidFigures ?? [])]) assert.ok(figure(f), `${q.id}: unknown figure ${f}`);
    for (const s of q.forbidSources ?? []) assert.ok(TEXT_RULES[s], `${q.id}: unknown source ${s}`);
    for (const b of q.forbidBooks ?? []) assert.ok(book(b), `${q.id}: unknown book ${b}`);
  }
});

test("golden set: a tradition check never forbids what that church reads, or expects what it does not", () => {
  for (const q of questions.filter((q) => q.tradition)) {
    const t = q.tradition!;
    for (const b of q.forbidBooks ?? []) assert.ok(!book(b)!.traditions.includes(t), `${q.id}: ${t} reads ${b}`);
    for (const s of q.forbidSources ?? []) assert.ok(!TEXT_RULES[s].traditions.includes(t), `${q.id}: ${t} reads ${s}`);
    for (const f of q.forbidFigures ?? []) assert.ok(!figure(f)!.traditions.includes(t), `${q.id}: ${t} reads ${f}`);
    if (q.expectFigures?.length) {
      assert.ok(q.expectFigures.some((f) => figure(f)!.traditions.includes(t)), `${q.id}: no expected figure is read by ${t}`);
    }
  }
});

test("golden set: Catholic, Protestant and Eastern Orthodox each have dev struggles and a filter check", () => {
  for (const t of ["catholic", "protestant", "eastern_orthodox"] as const) {
    assert.ok(questions.some((q) => q.type === "struggle" && q.split === "dev" && q.tradition === t), `no dev struggle for ${t}`);
    assert.ok(questions.some((q) => q.type === "tradition" && q.tradition === t), `no tradition check for ${t}`);
  }
});
