import assert from "node:assert/strict";
import { test } from "node:test";

import { CHAT_SEARCHES, CHAT_WINDOW_MS, ChatLimiter } from "../src/lib/chat-limit";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

test("a chat gets its share, then waits for the window to pass", () => {
  const c = clock();
  const limit = new ChatLimiter({ now: c.now });
  for (let i = 0; i < CHAT_SEARCHES; i++) assert.equal(limit.take(1), true, `search ${i + 1}`);
  assert.equal(limit.take(1), false);
  c.advance(CHAT_WINDOW_MS - 1);
  assert.equal(limit.take(1), false, "still inside the window");
  c.advance(1);
  assert.equal(limit.take(1), true, "the oldest search has left the window");
});

test("the share leaves room for others in the site-wide limit", () => {
  // The site allows 3 searches a minute (SEARCH_PER_MINUTE); one chat must not take them all.
  assert.ok(CHAT_SEARCHES < 3);
  assert.ok(CHAT_WINDOW_MS >= 60_000);
});

test("refused attempts do not count against the chat", () => {
  const c = clock();
  const limit = new ChatLimiter({ max: 1, windowMs: 1000, now: c.now });
  assert.equal(limit.take(7), true);
  for (let i = 0; i < 5; i++) {
    c.advance(100);
    assert.equal(limit.take(7), false);
  }
  c.advance(500);
  assert.equal(limit.take(7), true, "the window runs from the last search taken, not the last attempt");
});

test("one chat's searches do not limit another chat", () => {
  const limit = new ChatLimiter({ max: 1, now: () => 0 });
  assert.equal(limit.take(1), true);
  assert.equal(limit.take(1), false);
  assert.equal(limit.take(2), true);
});

test("memory stays bounded: expired chats go first, then the least recently used", () => {
  const c = clock();
  const limit = new ChatLimiter({ max: 1, windowMs: 1000, maxChats: 3, now: c.now });
  limit.take(1);
  limit.take(2);
  c.advance(1000);
  limit.take(3);
  limit.take(4);
  assert.equal(limit.size, 2, "chats 1 and 2 had expired");
  limit.take(5);
  limit.take(6);
  assert.equal(limit.size, 3);
  assert.equal(limit.take(3), true, "chat 3 was the least recently used, so it was forgotten");
  assert.equal(limit.take(6), false, "chat 6 is still remembered");
});
