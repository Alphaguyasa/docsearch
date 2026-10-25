/**
 * /api/telegram/daily was open: anyone could call it over and over and make
 * it hit Telegram (claims, setWebhook, setCommands). It now needs Vercel
 * cron's `Bearer $CRON_SECRET` once that secret exists, and the bot's secret
 * checks compare in constant time.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cronAuthorized, safeEqual } from "../src/lib/safe-equal";

test("safeEqual matches only the exact string", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(safeEqual("", ""));
  assert.ok(safeEqual("ሰላም", "ሰላም"));
  for (const [a, b] of [
    ["abc", "abd"],
    ["ab", "abc"],
    ["abcd", "abc"],
    ["", "abc"],
    ["abc", ""],
  ])
    assert.equal(safeEqual(a, b), false, `${a} vs ${b}`);
});

test("cron routes stay open while CRON_SECRET is unset", () => {
  assert.ok(cronAuthorized(null, undefined));
  assert.ok(cronAuthorized(null, ""));
  assert.ok(cronAuthorized("Bearer anything", undefined));
});

test("with CRON_SECRET set, only the exact bearer header passes", () => {
  const secret = "s3cret-value";
  assert.ok(cronAuthorized(`Bearer ${secret}`, secret));
  for (const header of [null, "", secret, `bearer ${secret}`, `Bearer ${secret}x`, "Bearer s3cret", `Basic ${secret}`])
    assert.equal(cronAuthorized(header, secret), false, String(header));
});

test("the daily route checks the cron secret before any Telegram call", () => {
  const route = readFileSync("src/app/api/telegram/daily/route.ts", "utf8");
  const check = route.indexOf('cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)');
  assert.ok(check > 0, "daily route calls cronAuthorized");
  assert.ok(check < route.indexOf("postDailyStory()"), "check runs before posting");
  assert.match(route, /status: 401/);
});

test("the bot's webhook and setup secrets compare in constant time", () => {
  const webhook = readFileSync("src/app/api/telegram/route.ts", "utf8");
  const setup = readFileSync("src/app/api/telegram/setup/route.ts", "utf8");
  assert.match(webhook, /safeEqual\(request\.headers\.get\("x-telegram-bot-api-secret-token"\)/);
  assert.doesNotMatch(webhook, /!== webhookSecret\(token\)/);
  assert.match(setup, /safeEqual\(new URL\(request\.url\)\.searchParams\.get\("key"\)/);
  assert.doesNotMatch(setup, /!== setupKey\(token\)/);
});
