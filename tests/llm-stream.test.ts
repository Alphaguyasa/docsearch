/**
 * The Gemini stream parser in src/lib/llm.ts, against a stubbed fetch (no
 * network). A story that Gemini cut off or blocked must end in an error, never
 * in a normal end of stream: /api/search would send "done" and cache the
 * half-story for every later reader of that example question.
 */
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

// env.ts validates on import; this file runs in its own process.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";
process.env.VOYAGE_API_KEY ??= "test";
process.env.GENERATION_PROVIDER = "gemini";
process.env.GEMINI_API_KEY ??= "test";

const getLlm = async () => (await import("../src/lib/llm")).getLlm();

afterEach(() => mock.restoreAll());

/** An SSE body made of `data:` events, split into the given network chunks. */
function sse(events: unknown[], split = 0): Response {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");
  const pieces = split > 0 ? text.match(new RegExp(`[\\s\\S]{1,${split}}`, "g"))! : [text];
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const textChunk = (text: string, finishReason?: string) => ({
  candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
});

async function run(res: Response): Promise<{ text: string; error?: Error }> {
  mock.method(globalThis, "fetch", async () => res);
  let text = "";
  try {
    for await (const d of (await getLlm()).stream([{ role: "user", content: "I keep lying" }])) text += d;
    return { text };
  } catch (err) {
    return { text, error: err as Error };
  }
}

test("a finished answer (STOP) streams every delta and ends normally", async () => {
  const r = await run(sse([textChunk("Peter denied "), textChunk("Christ [1].", "STOP")]));
  assert.equal(r.error, undefined);
  assert.equal(r.text, "Peter denied Christ [1].");
});

test("events split across network chunks are reassembled", async () => {
  const r = await run(sse([textChunk("Peter wept "), textChunk("bitterly [2].", "STOP")], 7));
  assert.equal(r.error, undefined);
  assert.equal(r.text, "Peter wept bitterly [2].");
});

test("a last event with no trailing newline still counts", async () => {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify(textChunk("Amen.", "STOP"))}`));
      c.close();
    },
  });
  const r = await run(new Response(body, { status: 200 }));
  assert.equal(r.error, undefined);
  assert.equal(r.text, "Amen.");
});

test("an answer cut off at MAX_TOKENS ends in an error, after the text it did send", async () => {
  const r = await run(sse([textChunk("Peter denied "), textChunk("Chr", "MAX_TOKENS")]));
  assert.equal(r.text, "Peter denied Chr");
  assert.match(r.error?.message ?? "", /MAX_TOKENS/);
});

for (const reason of ["SAFETY", "RECITATION", "OTHER"]) {
  test(`an answer stopped for ${reason} ends in an error`, async () => {
    const r = await run(sse([textChunk("David", reason)]));
    assert.match(r.error?.message ?? "", new RegExp(reason));
  });
}

test("a blocked prompt ends in an error, with no text", async () => {
  const r = await run(sse([{ promptFeedback: { blockReason: "SAFETY" } }]));
  assert.equal(r.text, "");
  assert.match(r.error?.message ?? "", /blocked.*SAFETY/);
});

test("a stream that closes with no finish reason ends in an error", async () => {
  const r = await run(sse([textChunk("Peter denied ")]));
  assert.equal(r.text, "Peter denied ");
  assert.ok(r.error, "a cut-off stream must not end normally");
});

test("the key is sent and the stream endpoint is used", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => sse([textChunk("ok", "STOP")]));
  for await (const d of (await getLlm()).stream([{ role: "user", content: "x" }])) void d;
  const [input, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
  const url = String(input);
  assert.match(url, /:streamGenerateContent\?alt=sse$/);
  // The key travels in a header, never the URL, where proxies and logs keep it.
  assert.doesNotMatch(url, /key=/);
  assert.equal(new Headers(init.headers).get("x-goog-api-key"), process.env.GEMINI_API_KEY);
});

test("non-streaming calls send the key in a header too", async () => {
  const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: "NONE" }] }, finishReason: "STOP" }] });
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(body, { status: 200 }));
  await (await getLlm()).complete([{ role: "user", content: "x" }]);
  const [input, init] = fetchMock.mock.calls[0].arguments as [unknown, RequestInit];
  assert.match(String(input), /:generateContent$/);
  assert.equal(new Headers(init.headers).get("x-goog-api-key"), process.env.GEMINI_API_KEY);
});
