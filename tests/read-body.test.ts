/**
 * src/lib/read-body.ts: request bodies are capped before anything parses them.
 * The routes' own 413s are in tests/api-routes.test.ts and
 * tests/feedback-today-routes.test.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { BODY_LIMITS, readCapped, readJsonCapped } from "../src/lib/read-body";

const req = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", headers, body, duplex: "half" } as RequestInit);

/** A body sent in pieces with no Content-Length, counting how many pieces were pulled. */
function chunked(pieces: number, size: number): { stream: ReadableStream<Uint8Array>; pulled: () => number } {
  let n = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (n >= pieces) return controller.close();
      n++;
      controller.enqueue(new Uint8Array(size).fill(0x20));
    },
  });
  return { stream, pulled: () => n };
}

test("a body within the cap is read whole, including multi-byte text", async () => {
  const text = JSON.stringify({ question: "ውሸት እናገራለሁ" });
  const out = await readCapped(req(text), 1024);
  assert.deepEqual(out, { ok: true, text });
  assert.deepEqual(await readJsonCapped(req(text), 1024), { ok: true, value: { question: "ውሸት እናገራለሁ" } });
});

test("the cap counts bytes, not characters", async () => {
  // 10 Ethiopic characters are 30 bytes in UTF-8.
  const text = "ው".repeat(10);
  assert.equal((await readCapped(req(text), 29)).ok, false);
  assert.equal((await readCapped(req(text), 30)).ok, true);
});

test("a declared Content-Length over the cap is refused without reading", async () => {
  const { stream, pulled } = chunked(4, 10);
  const out = await readCapped(req(stream, { "content-length": "4096" }), 100);
  assert.deepEqual(out, { ok: false, reason: "too_large" });
  assert.equal(pulled() <= 1, true, "the body was not read");
});

test("a body with no Content-Length stops being read once it passes the cap", async () => {
  const { stream, pulled } = chunked(1000, 1024);
  const out = await readCapped(req(stream), 4 * 1024);
  assert.deepEqual(out, { ok: false, reason: "too_large" });
  assert.ok(pulled() < 10, `read ${pulled()} of 1000 pieces`);
});

test("an empty body is empty text, and not JSON", async () => {
  assert.deepEqual(await readCapped(req(null), 10), { ok: true, text: "" });
  assert.deepEqual(await readJsonCapped(req(""), 10), { ok: false, reason: "not_json" });
  assert.deepEqual(await readJsonCapped(req("{nope"), 10), { ok: false, reason: "not_json" });
});

test("each cap holds the largest valid body several times over", () => {
  // 1000 Ethiopic characters (3 bytes each) plus the JSON around them.
  assert.ok(BODY_LIMITS.search >= 3 * 3000 + 200);
  // 4096 characters of message text, maybe Ethiopic, plus a quoted reply and entities.
  assert.ok(BODY_LIMITS.telegram >= 4 * 4096 * 3);
  // Two lists of five ids (each well under 64 characters) and two small fields.
  assert.ok(BODY_LIMITS.feedback >= 2 * 5 * 64 + 100);
  // And none lets through the 4.5 MB Vercel would.
  for (const cap of Object.values(BODY_LIMITS)) assert.ok(cap < 1024 * 1024);
});
