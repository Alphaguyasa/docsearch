/**
 * The two public POST routes, called directly. The database and the network
 * are mocked: a test that reaches Voyage, Gemini or Telegram fails loudly.
 *
 * `after()` needs a Next request scope, so each call runs inside a minimal one
 * that collects the deferred tasks instead of running them; a test can count
 * them to see what the route scheduled.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import "./helpers/next-als";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

import { POST as search } from "../src/app/api/search/route";
import { POST as telegram } from "../src/app/api/telegram/route";
import { db } from "../src/lib/db";
import { cacheExample, exampleKey, EXAMPLE_QUESTIONS } from "../src/lib/example-cache";
import { webhookSecret } from "../src/lib/telegram";

async function inRequest(
  call: () => Promise<Response>,
): Promise<{ res: Response; deferred: number; tasks: (() => unknown)[] }> {
  const tasks: (() => unknown)[] = [];
  const workStore = { afterContext: { after: (task: () => unknown) => void tasks.push(task) } };
  const res = await workAsyncStorage.run(workStore as never, () =>
    workUnitAsyncStorage.run({} as never, call),
  );
  return { res, deferred: tasks.length, tasks };
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let slots: ReturnType<typeof mock.fn>;

beforeEach(() => {
  mock.method(globalThis, "fetch", async (input: unknown) => {
    throw new Error(`unexpected network call in a test: ${String(input)}`);
  });
  slots = mock.method(db, "rpc", async () => ({ data: false, error: null }));
});

afterEach(() => mock.restoreAll());

const searchReq = (body: unknown) => post("http://localhost/api/search", body);

test("search: bad, empty or over-long input is a 400 before anything else", async () => {
  for (const body of ["not json", {}, { question: "   " }, { question: "x".repeat(1001) }, { question: "hi", tradition: "nope" }]) {
    const { res } = await inRequest(() => search(searchReq(body)));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(typeof (await res.json()).error, "string");
  }
  assert.equal(slots.mock.callCount(), 0, "no rate-limit slot taken for bad input");
});

test("search: a crisis is answered before the rate limit, even when the site is busy", async () => {
  const { res } = await inRequest(() => search(searchReq({ question: "I want to kill myself" })));
  assert.equal(res.status, 200);
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.type), ["crisis", "done"]);
  assert.equal(lines[0].crisis.kind, "self_harm");
  assert.equal(slots.mock.callCount(), 0);
});

test("search: a cached example is served without taking a slot", async () => {
  const question = EXAMPLE_QUESTIONS[0];
  const body = '{"type":"sources","chunks":[],"figures":[],"tags":[]}\n{"type":"done"}\n';
  cacheExample(exampleKey(question, "oriental_orthodox")!, body);
  const { res } = await inRequest(() => search(searchReq({ question, tradition: "oriental_orthodox" })));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), body);
  assert.equal(slots.mock.callCount(), 0);
});

test("search: with no slot left the answer is a 429 with code busy", async () => {
  const { res } = await inRequest(() => search(searchReq({ question: "I keep stealing from work" })));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).code, "busy");
  assert.equal(slots.mock.callCount(), 1);
  assert.equal(slots.mock.calls[0].arguments[0], "take_search_slot");
});

const TOKEN = "123456:test-token";
const hookReq = (body: unknown, secret = webhookSecret(TOKEN)) =>
  post("http://localhost/api/telegram", body, { "x-telegram-bot-api-secret-token": secret });
const message = (type: string) => ({ message: { chat: { id: 42, type }, text: "I keep lying" } });

test("telegram: 503 while the bot has no token", async (t) => {
  t.after(() => delete process.env.TELEGRAM_BOT_TOKEN);
  delete process.env.TELEGRAM_BOT_TOKEN;
  const { res } = await inRequest(() => telegram(hookReq(message("private"))));
  assert.equal(res.status, 503);
});

test("telegram: a wrong or missing webhook secret is a 403 and does nothing", async (t) => {
  t.after(() => delete process.env.TELEGRAM_BOT_TOKEN);
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  for (const secret of ["", "wrong", webhookSecret("999:other-token")]) {
    const { res, deferred } = await inRequest(() => telegram(hookReq(message("private"), secret)));
    assert.equal(res.status, 403, secret);
    assert.equal(deferred, 0);
  }
});

test("telegram: only private chats are answered", async (t) => {
  t.after(() => delete process.env.TELEGRAM_BOT_TOKEN);
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  // Every update also schedules the channel-post backup; a private message adds the reply.
  const counts: Record<string, number> = {};
  for (const type of ["private", "group", "supergroup", "channel"]) {
    const { res, deferred } = await inRequest(() => telegram(hookReq(message(type))));
    assert.equal(res.status, 200);
    counts[type] = deferred;
  }
  assert.deepEqual(counts, { private: 2, group: 1, supergroup: 1, channel: 1 });
});

test("telegram: a chat over its share gets a gentle wait, without calling the search", async (t) => {
  t.after(() => delete process.env.TELEGRAM_BOT_TOKEN);
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  const searches: string[] = [];
  const sent: string[] = [];
  mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/search")) {
      searches.push(JSON.parse(String(init?.body)).question);
      return new Response("{}", { status: 429 });
    }
    if (url.startsWith("https://api.telegram.org/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.text) sent.push(body.text);
      return Response.json({ ok: true, result: {} });
    }
    throw new Error(`unexpected network call in a test: ${url}`);
  });
  const say = async (text: string) => {
    const { tasks } = await inRequest(() =>
      telegram(hookReq({ message: { chat: { id: 7001, type: "private" }, text } })),
    );
    await tasks[0](); // the reply; the rest is the channel-post backup
  };

  await say("I keep lying");
  await say("I keep lying again");
  assert.equal(searches.length, 2);
  await say("I keep lying, still");
  assert.equal(searches.length, 2, "the third message in the window never reaches the search");
  assert.match(sent.at(-1)!, /You have asked a few times/);

  // A crisis is still answered at once, even over the share.
  await say("I want to kill myself");
  assert.equal(searches.length, 2);
  assert.doesNotMatch(sent.at(-1)!, /You have asked a few times/);
  assert.match(sent.at(-1)!, /\/help|call|988|danger/i);

  // The fixed examples are served from the cache and cost no share.
  await say(EXAMPLE_QUESTIONS[0]);
  assert.equal(searches.length, 3);
});
