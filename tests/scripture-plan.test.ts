import assert from "node:assert/strict";
import { test } from "node:test";

import { applyInBatches, groups, planIngest, RETAG_BATCH, type ExistingRow } from "../src/lib/scripture/plan";
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

test("a done row whose tags changed is retagged, not re-embedded", () => {
  const expected = [
    { ...chunk("a", 0), traditions: ["catholic", "orthodox"] as ScriptureChunk["traditions"] },
    { ...chunk("a", 1), traditions: ["orthodox", "catholic"] as ScriptureChunk["traditions"] },
    { ...chunk("a", 2), traditions: ["orthodox"] as ScriptureChunk["traditions"] },
  ];
  const plan = planIngest(expected, [
    { ...row("a", 0), traditions: ["orthodox"] },
    { ...row("a", 1), traditions: ["catholic", "orthodox"] }, // same set, other order
    { ...row("a", 2), traditions: ["orthodox"] },
  ]);
  assert.equal(plan.toEmbed.length, 0);
  assert.equal(plan.alreadyDone, 3);
  assert.deepEqual(plan.retag, [{ traditions: ["catholic", "orthodox"], ids: ["a-0"] }]);
});

test("rows with unknown tags, or that are re-embedded anyway, are not retagged", () => {
  const expected = [
    { ...chunk("a", 0), traditions: ["orthodox"] as ScriptureChunk["traditions"] },
    { ...chunk("a", 1, "new"), traditions: ["orthodox"] as ScriptureChunk["traditions"] },
  ];
  const plan = planIngest(expected, [row("a", 0), { ...row("a", 1), traditions: [] }]);
  assert.deepEqual(plan.retag, []);
  assert.deepEqual(plan.toEmbed.map((c) => c.chunkIndex), [1]);
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

test("retag batches are small (each update rewrites index entries)", () => {
  assert.ok(RETAG_BATCH <= 25);
});

test("applyInBatches sends every id once, in batches of the given size", async () => {
  const seen: string[][] = [];
  await applyInBatches(ids(60), 25, async (b) => (seen.push(b), { error: null }));
  assert.deepEqual(seen.map((b) => b.length), [25, 25, 10]);
  assert.deepEqual(seen.flat(), ids(60));
});

test("a statement timeout splits the batch in half and retries", async () => {
  const seen: number[] = [];
  await applyInBatches(ids(8), 8, async (b) => {
    seen.push(b.length);
    return { error: b.length > 2 ? { message: "canceling statement due to statement timeout" } : null };
  });
  // 8 times out, then 4, 4 time out, then four batches of 2 succeed.
  assert.deepEqual(seen, [8, 4, 2, 2, 4, 2, 2]);
});

test("a timeout on a single row, or any other error, is thrown", async () => {
  await assert.rejects(
    applyInBatches(ids(3), 3, async () => ({ error: { message: "statement timeout" } })),
    /statement timeout/,
  );
  const calls: number[] = [];
  await assert.rejects(
    applyInBatches(ids(4), 4, async (b) => (calls.push(b.length), { error: { message: "permission denied" } })),
    /permission denied/,
  );
  assert.deepEqual(calls, [4]); // not retried
});
