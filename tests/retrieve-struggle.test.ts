import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import type { RetrievedChunk } from "../src/lib/retrieve";
import { memoizeSuccess, topUpWithSearch } from "../src/lib/scripture/retrieve-struggle";

afterEach(() => mock.restoreAll());

const chunk = (id: string): RetrievedChunk => ({
  id,
  documentId: "d",
  content: id,
  title: "t",
  filename: "f",
  pageNumber: null,
  ref: null,
  traditions: [],
  vectorScore: null,
  keywordScore: null,
  fusedScore: 0,
});

test("a failed search keeps the figure passages and marks the result degraded", async () => {
  mock.method(console, "error", () => {});
  const out = await topUpWithSearch([chunk("peter-1"), chunk("peter-2")], 10, async () => {
    throw new Error("Retrieval failed: both vector and keyword search errored.");
  });
  assert.deepEqual(out.results.map((r) => r.id), ["peter-1", "peter-2"]);
  assert.equal(out.degraded, true);
});

test("a failed search with no figure passages still fails", async () => {
  await assert.rejects(
    topUpWithSearch([], 10, async () => {
      throw new Error("down");
    }),
    /down/,
  );
});

test("search results top up the figure passages without duplicates, up to the limit", async () => {
  const out = await topUpWithSearch([chunk("a"), chunk("b")], 4, async () => ({
    results: [chunk("b"), chunk("c"), chunk("d"), chunk("e")],
    degraded: true,
  }));
  assert.deepEqual(out.results.map((r) => r.id), ["a", "b", "c", "d"]);
  assert.equal(out.degraded, true);
});

test("no search runs when the figure passages already fill the limit", async () => {
  let searched = false;
  const out = await topUpWithSearch([chunk("a"), chunk("b"), chunk("c")], 2, async () => {
    searched = true;
    return { results: [], degraded: false };
  });
  assert.equal(searched, false);
  assert.deepEqual(out.results.map((r) => r.id), ["a", "b"]);
});

test("a document lookup is cached only when it succeeds", async () => {
  let calls = 0;
  const lookup = memoizeSuccess(async (key: string) => {
    calls++;
    if (calls === 1) throw new Error("timeout");
    return key === "missing" ? null : `id-${key}`;
  });
  await assert.rejects(lookup("lausiac"), /timeout/);
  assert.equal(await lookup("lausiac"), "id-lausiac");
  assert.equal(await lookup("lausiac"), "id-lausiac");
  assert.equal(calls, 2);
  // A source that really is absent is remembered as absent.
  assert.equal(await lookup("missing"), null);
  assert.equal(await lookup("missing"), null);
  assert.equal(calls, 3);
});
