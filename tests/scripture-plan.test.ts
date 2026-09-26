import assert from "node:assert/strict";
import { test } from "node:test";

import { groups, planIngest, type ExistingRow } from "../src/lib/scripture/plan";
import type { ScriptureChunk } from "../src/lib/scripture/types";

function chunk(doc: string, i: number, content = `c${i}`): ScriptureChunk {
  return {
    sourceId: "web", documentKey: doc, documentTitle: doc, chunkIndex: i, ref: `r${i}`, book: null,
    chapterStart: null, verseStart: null, verseEnd: null, content, tokenCount: 1, traditions: [],
  };
}
function row(doc: string, i: number, content = `c${i}`, embedded = true): ExistingRow {
  return { id: `${doc}-${i}`, documentKey: doc, chunkIndex: i, content, embedded };
}

test("fresh database: everything is embedded", () => {
  const plan = planIngest([chunk("a", 0), chunk("a", 1)], []);
  assert.equal(plan.toEmbed.length, 2);
  assert.equal(plan.alreadyDone, 0);
});

test("resume after a killed run: only the missing chunks are embedded", () => {
  const expected = Array.from({ length: 10 }, (_, i) => chunk("a", i));
  const existing = Array.from({ length: 6 }, (_, i) => row("a", i)); // run died after 6
  const plan = planIngest(expected, existing);
  assert.deepEqual(plan.toEmbed.map((c) => c.chunkIndex), [6, 7, 8, 9]);
  assert.equal(plan.alreadyDone, 6);
  assert.deepEqual(plan.staleRowIds, []);
});

test("second resume is a no-op: nothing re-embedded, nothing duplicated", () => {
  const expected = Array.from({ length: 4 }, (_, i) => chunk("a", i));
  const plan = planIngest(expected, expected.map((c) => row("a", c.chunkIndex)));
  assert.equal(plan.toEmbed.length, 0);
  assert.equal(plan.alreadyDone, 4);
});

test("changed content or missing embedding is redone", () => {
  const plan = planIngest([chunk("a", 0, "new text"), chunk("a", 1)], [row("a", 0, "old text"), row("a", 1, "c1", false)]);
  assert.deepEqual(plan.toEmbed.map((c) => c.chunkIndex), [0, 1]);
});

test("rows past the end of a rebuilt document are stale", () => {
  const plan = planIngest([chunk("a", 0)], [row("a", 0), row("a", 1), row("b", 0)]);
  assert.deepEqual(plan.staleRowIds.sort(), ["a-1", "b-0"]);
});

test("groups splits evenly with a remainder", () => {
  assert.deepEqual(groups([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
