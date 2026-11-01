import assert from "node:assert/strict";
import { test } from "node:test";

import { parseUpdate } from "../src/lib/telegram-update";

test("a normal private message is kept with the fields the bot reads", () => {
  const u = parseUpdate({
    update_id: 1,
    message: { message_id: 5, chat: { id: 42, type: "private" }, from: { first_name: "A", language_code: "am" }, text: "hi" },
  });
  assert.deepEqual(u.message, { chat: { id: 42, type: "private" }, from: { first_name: "A", language_code: "am" }, text: "hi" });
});

test("a message without chat is dropped instead of throwing", () => {
  assert.equal(parseUpdate({ message: { text: "hi" } }).message, undefined);
  assert.equal(parseUpdate({ message: { chat: { id: "42", type: "private" } } }).message, undefined);
});

test("a bad part never drops a good one in the same update", () => {
  const u = parseUpdate({ message: { text: "no chat" }, callback_query: { id: "c1", data: "fb:up" } });
  assert.equal(u.message, undefined);
  assert.deepEqual(u.callback_query, { id: "c1", data: "fb:up" });
});

test("non-objects and unknown update kinds give an empty update", () => {
  for (const json of [null, undefined, 3, "x", [], { edited_message: { text: "x" } }]) {
    assert.deepEqual(parseUpdate(json), {}, JSON.stringify(json));
  }
});

test("inline queries need an id and a query", () => {
  assert.deepEqual(parseUpdate({ inline_query: { id: "q", query: "lying" } }).inline_query, { id: "q", query: "lying" });
  assert.equal(parseUpdate({ inline_query: { id: "q" } }).inline_query, undefined);
});
