/**
 * POST /api/feedback and GET /api/today, called directly with the database
 * mocked. The other public routes are in tests/api-routes.test.ts.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { POST as feedback } from "../src/app/api/feedback/route";
import { GET as today } from "../src/app/api/today/route";
import { db } from "../src/lib/db";
import { FIGURES } from "../src/lib/scripture/figures";
import { personOfTheDay } from "../src/lib/scripture/today";

function post(body: unknown): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Stands in for db.from("channel_posts").select().eq().maybeSingle(). */
function channelPosts(result: () => Promise<{ data: unknown; error: unknown }>) {
  return mock.method(db, "from", () => ({
    select: () => ({ eq: () => ({ maybeSingle: result }) }),
  }));
}

beforeEach(() => {
  mock.method(globalThis, "fetch", async (input: unknown) => {
    throw new Error(`unexpected network call in a test: ${String(input)}`);
  });
  // Feedback warns when it is not stored; keep the test output clean.
  mock.method(console, "warn", () => {});
});

afterEach(() => mock.restoreAll());

const good = { helpful: true, figures: [FIGURES[0].id], tags: [], lang: "en" };

test("feedback: a known person and a yes/no is stored as numbers only, 204", async () => {
  const rpc = mock.method(db, "rpc", async () => ({ data: true, error: null }));
  const res = await feedback(post(good));
  assert.equal(res.status, 204);
  assert.equal(rpc.mock.callCount(), 1);
  const [fn, args] = rpc.mock.calls[0].arguments as unknown as [string, Record<string, unknown>];
  assert.equal(fn, "add_feedback");
  assert.deepEqual(args, {
    p_helpful: true,
    p_figures: [FIGURES[0].id],
    p_tags: [],
    p_lang: "en",
    p_channel: "web",
  });
});

test("feedback: a bad body is a 400 and never reaches the database", async () => {
  const rpc = mock.method(db, "rpc", async () => ({ data: true, error: null }));
  const bad = [
    "not json",
    "",
    {},
    { ...good, helpful: "yes" },
    { ...good, lang: "fr" },
    // Free text where a person id belongs: the reason the schema exists.
    { ...good, figures: ["I lied to my wife"] },
    { ...good, tags: ["not-a-tag"] },
    { ...good, figures: Array(6).fill(FIGURES[0].id) },
  ];
  for (const body of bad) {
    const res = await feedback(post(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(typeof (await res.json()).error, "string");
  }
  assert.equal(rpc.mock.callCount(), 0);
});

test("feedback: the hourly cap or a database error is a 429, not a 500", async () => {
  for (const reply of [{ data: false, error: null }, { data: null, error: { message: "down" } }]) {
    mock.method(db, "rpc", async () => reply);
    const res = await feedback(post(good));
    assert.equal(res.status, 429, JSON.stringify(reply));
    assert.equal(typeof (await res.json()).error, "string");
    mock.restoreAll();
  }
});

test("today: the person the channel posted, cached briefly at the edge", async () => {
  const posted = FIGURES[FIGURES.length - 1].id;
  channelPosts(async () => ({ data: { figure: posted }, error: null }));
  const res = await today();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: posted });
  assert.match(res.headers.get("cache-control") ?? "", /s-maxage=\d+/);
});

test("today: before the channel posts, the person of the day", async () => {
  channelPosts(async () => ({ data: null, error: null }));
  const res = await today();
  // The route reads the clock itself; compare against the same day's pick.
  assert.deepEqual(await res.json(), { id: personOfTheDay(new Date()).id });
});

test("today: a database that throws gives id null, still a 200", async () => {
  channelPosts(async () => {
    throw new Error("connection reset");
  });
  const res = await today();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: null });
});
