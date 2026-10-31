import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";

import {
  cacheExample,
  EXAMPLE_QUESTIONS,
  exampleKey,
  getCachedExample,
  loadSharedExample,
  saveSharedExample,
  TTL_MS,
  type Rpc,
} from "../src/lib/example-cache";

test("only the fixed example questions get a key — nothing a reader writes is kept", () => {
  assert.ok(exampleKey(EXAMPLE_QUESTIONS[0]));
  assert.ok(exampleKey(`  ${EXAMPLE_QUESTIONS[3]} `), "Amharic example, trimmed");
  assert.equal(exampleKey("I keep lying to my parents"), null);
  assert.equal(exampleKey("my own private confession"), null);
});

test("keys differ by tradition", () => {
  assert.notEqual(exampleKey(EXAMPLE_QUESTIONS[0], "catholic"), exampleKey(EXAMPLE_QUESTIONS[0]));
});

test("a cached answer is served until it expires", () => {
  const key = exampleKey(EXAMPLE_QUESTIONS[1], "protestant")!;
  cacheExample(key, "BODY", 1000);
  assert.equal(getCachedExample(key, 1000 + 60_000), "BODY");
  assert.equal(getCachedExample(key, 1000 + 7 * 60 * 60 * 1000), null);
});

test("every example card, in both languages, is cacheable", async () => {
  const { DICTS } = await import("../src/app/i18n/dict");
  for (const lang of ["en", "am"] as const)
    for (const q of DICTS[lang].examples.list) assert.ok(exampleKey(q), `${lang}: ${q}`);
});

function fakeRpc(reply: { data?: unknown; error?: { message: string } | null } | Error) {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push([fn, args]);
    if (reply instanceof Error) throw reply;
    return { data: reply.data ?? null, error: reply.error ?? null };
  };
  return { rpc, calls };
}

test("a cold instance reads the shared answer and keeps it in memory", async () => {
  const key = exampleKey(EXAMPLE_QUESTIONS[2], "catholic")!;
  const { rpc, calls } = fakeRpc({ data: "SHARED" });
  assert.equal(await loadSharedExample(key, rpc), "SHARED");
  assert.deepEqual(calls, [["get_example", { p_key: key, p_max_age: TTL_MS / 1000 }]]);
  assert.equal(getCachedExample(key), "SHARED");
});

test("a missing table or a db error falls back to memory alone", async () => {
  const key = exampleKey(EXAMPLE_QUESTIONS[4], "protestant")!;
  for (const reply of [{ error: { message: "function get_example does not exist" } }, new Error("offline"), { data: null }]) {
    assert.equal(await loadSharedExample(key, fakeRpc(reply).rpc), null);
    assert.equal(await saveSharedExample(key, "B", fakeRpc(reply instanceof Error ? reply : { error: { message: "x" } }).rpc), false);
  }
});

test("only keys made from the fixed examples reach the shared table", async () => {
  const { rpc, calls } = fakeRpc({ data: "X" });
  for (const key of ["my own private confession", "all\u0000I lied to my wife", "", `all\u0000${EXAMPLE_QUESTIONS[0]} and more`]) {
    assert.equal(await saveSharedExample(key, "B", rpc), false, key);
    assert.equal(await loadSharedExample(key, rpc), null, key);
  }
  assert.equal(calls.length, 0);
  const key = exampleKey(EXAMPLE_QUESTIONS[0])!;
  assert.equal(await saveSharedExample(key, "BODY", rpc), true);
  assert.deepEqual(calls, [["put_example", { p_key: key, p_body: "BODY" }]]);
});

test("the example_answers migration is additive and closed to the public", () => {
  const sql = readFileSync("supabase/migrations/20261031090000_example_answers.sql", "utf8").toLowerCase();
  assert.match(sql, /create table if not exists example_answers/);
  assert.match(sql, /alter table example_answers enable row level security/);
  assert.doesNotMatch(sql, /\b(drop|truncate|delete from|alter column|rename)\b/);
  for (const fn of ["get_example(text, int)", "put_example(text, text)"]) {
    assert.ok(sql.includes(`revoke all on function ${fn} from public, anon, authenticated`), fn);
    assert.ok(sql.includes(`grant execute on function ${fn} to service_role`), fn);
  }
});
