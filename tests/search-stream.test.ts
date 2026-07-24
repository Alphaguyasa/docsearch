import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSearchStream, type SearchStreamMessage } from "../src/lib/search-stream";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SearchStreamMessage[]> {
  const out: SearchStreamMessage[] = [];
  for await (const m of parseSearchStream(stream)) out.push(m);
  return out;
}

test("parses sources, deltas, and done in order", async () => {
  const lines = [
    JSON.stringify({ type: "sources", chunks: [{ n: 1 }] }) + "\n",
    JSON.stringify({ type: "delta", text: "Hello " }) + "\n",
    JSON.stringify({ type: "delta", text: "world [1]." }) + "\n",
    JSON.stringify({ type: "done" }) + "\n",
  ];
  const msgs = await collect(streamFrom(lines));
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].type, "sources");
  assert.equal(msgs[1].type, "delta");
  assert.equal(msgs[3].type, "done");
});

test("reassembles a line split across chunk boundaries", async () => {
  const msg = JSON.stringify({ type: "delta", text: "abc" });
  const half = Math.floor(msg.length / 2);
  const msgs = await collect(streamFrom([msg.slice(0, half), msg.slice(half) + "\n"]));
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0], { type: "delta", text: "abc" });
});

test("yields sources before any delta when both arrive in one chunk", async () => {
  const blob =
    JSON.stringify({ type: "sources", chunks: [] }) +
    "\n" +
    JSON.stringify({ type: "delta", text: "x" }) +
    "\n";
  const msgs = await collect(streamFrom([blob]));
  assert.equal(msgs[0].type, "sources");
  assert.equal(msgs[1].type, "delta");
});

test("handles a final line with no trailing newline", async () => {
  const msgs = await collect(streamFrom([JSON.stringify({ type: "done" })]));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].type, "done");
});
