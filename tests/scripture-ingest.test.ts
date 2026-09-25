import assert from "node:assert/strict";
import { test } from "node:test";

import { md5, orderSources, planDocument, type DbChunkState } from "../src/lib/scripture/ingest-plan";
import type { ScriptureChunk } from "../src/lib/scripture/types";

function chunk(i: number, content = `chunk ${i}`): ScriptureChunk {
  return {
    sourceId: "web", documentKey: "web:GEN", documentTitle: "Genesis", chunkIndex: i, ref: `Genesis 1:${i + 1}`,
    book: "GEN", chapterStart: 1, verseStart: i + 1, verseEnd: i + 1, content, tokenCount: 3, traditions: ["protestant"],
  };
}
const done = (c: ScriptureChunk): DbChunkState => ({ chunk_index: c.chunkIndex, content_md5: md5(c.content), embedded: true });

test("fresh document: everything is embedded", () => {
  const local = [chunk(0), chunk(1), chunk(2)];
  const p = planDocument(local, []);
  assert.equal(p.toEmbed.length, 3);
  assert.equal(p.alreadyDone, 0);
});

test("resume after a kill: only the missing tail is embedded, nothing twice", () => {
  const local = [0, 1, 2, 3, 4].map((i) => chunk(i));
  const p = planDocument(local, local.slice(0, 3).map(done));
  assert.deepEqual(p.toEmbed.map((c) => c.chunkIndex), [3, 4]);
  assert.equal(p.alreadyDone, 3);
});

test("rows without embeddings and changed content are redone", () => {
  const local = [chunk(0), chunk(1, "new text"), chunk(2)];
  const state: DbChunkState[] = [
    done(local[0]),
    { chunk_index: 1, content_md5: md5("old text"), embedded: true },
    { chunk_index: 2, content_md5: md5(local[2].content), embedded: false },
  ];
  assert.deepEqual(planDocument(local, state).toEmbed.map((c) => c.chunkIndex), [1, 2]);
});

test("rows beyond the new chunk count are stale", () => {
  const local = [chunk(0), chunk(1)];
  const state = [done(local[0]), done(local[1]), done(chunk(2)), done(chunk(3))];
  assert.deepEqual(planDocument(local, state).staleIndexes, [2, 3]);
});

test("md5 matches Postgres md5() hex for UTF-8 text", () => {
  // Verified against the live database: select md5('Ethiopian Synaxarium, Sane — “ON this day”')
  assert.equal(md5("Ethiopian Synaxarium, Sane — “ON this day”"), "7b3b84b2f9ccab64d1e6065eba1bfdd3");
});

test("sources are ingested in priority order", () => {
  assert.deepEqual(orderSources(["paradise", "web", "synaxarium", "confessions", "lausiac"]),
    ["web", "lausiac", "confessions", "synaxarium", "paradise"]);
});
