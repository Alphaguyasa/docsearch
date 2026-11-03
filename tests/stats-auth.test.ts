/**
 * The /stats key no longer travels in the URL (ROADMAP 46). It is posted once
 * to /stats/session, which leaves an HMAC of it in an httpOnly, SameSite=Strict
 * cookie scoped to /stats; an old `/stats?key=…` link is redirected without
 * the key by the proxy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { POST } from "../src/app/stats/session/route";
import { proxy } from "../src/proxy";
import { STATS_COOKIE, STATS_KEY_MAX, statsCookieOk, statsKeyOk, statsToken } from "../src/lib/stats-auth";

const KEY = "a-long-random-stats-key-0123456789";
const BASE = "https://not-alone.test";

async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const post = (body: string) =>
  POST(
    new NextRequest(new URL("/stats/session", BASE), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );

const location = (res: Response) => new URL(res.headers.get("location") ?? "", BASE);

test("the cookie holds an HMAC of the key, never the key itself", async () => {
  const token = await statsToken(KEY);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(token.includes(KEY), false);
  assert.equal(await statsToken(KEY), token, "the same key gives the same cookie");
  assert.notEqual(await statsToken(`${KEY}x`), token, "a new key signs every browser out");
});

test("key and cookie checks refuse everything while STATS_KEY is unset", async () => {
  assert.equal(statsKeyOk(KEY, KEY), true);
  assert.equal(statsKeyOk("nope", KEY), false);
  assert.equal(statsKeyOk("", ""), false);
  assert.equal(statsKeyOk(KEY, undefined), false);
  assert.equal(await statsCookieOk(await statsToken(KEY), KEY), true);
  assert.equal(await statsCookieOk(KEY, KEY), false, "the raw key is not a valid cookie");
  assert.equal(await statsCookieOk(await statsToken(KEY), undefined), false);
  assert.equal(await statsCookieOk(undefined, KEY), false);
});

test("the right key sets a strict, httpOnly cookie scoped to /stats and goes to /stats", async () => {
  await withEnv({ STATS_KEY: KEY }, async () => {
    const res = await post(new URLSearchParams({ key: KEY }).toString());
    assert.equal(res.status, 303);
    assert.equal(location(res).pathname, "/stats");
    assert.equal(location(res).search, "", "the key is not in the next URL");
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.ok(cookie.startsWith(`${STATS_COOKIE}=${await statsToken(KEY)};`), cookie);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\/stats(;|$)/);
    assert.match(cookie, /Max-Age=2592000/);
    assert.equal(cookie.includes(KEY), false);
  });
});

test("a wrong, missing or oversized key goes back to the form with no cookie", async () => {
  await withEnv({ STATS_KEY: KEY }, async () => {
    for (const body of ["key=nope", "", "other=1", `key=${"x".repeat(STATS_KEY_MAX * 2)}`]) {
      const res = await post(body);
      assert.equal(res.status, 303);
      assert.equal(location(res).pathname, "/stats");
      assert.equal(location(res).searchParams.get("wrong"), "1");
      assert.equal(res.headers.get("set-cookie"), null, body.slice(0, 20));
    }
  });
});

test("no cookie is ever set while STATS_KEY is unset", async () => {
  await withEnv({ STATS_KEY: undefined }, async () => {
    const res = await post("key=anything");
    assert.equal(res.headers.get("set-cookie"), null);
  });
});

test("forget=1 clears the cookie", async () => {
  await withEnv({ STATS_KEY: KEY }, async () => {
    const res = await post("forget=1");
    assert.equal(res.status, 303);
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`^${STATS_COOKIE}=;`));
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /Path=\/stats(;|$)/);
  });
});

test("an old /stats?key= link is redirected without the key, with the cookie if it was right", async () => {
  await withEnv({ STATS_KEY: KEY, APP_PASSWORD: undefined }, async () => {
    const right = await proxy(new NextRequest(new URL(`/stats?key=${KEY}&lang=am`, BASE)));
    assert.equal(right.status, 303);
    assert.equal(location(right).pathname, "/stats");
    assert.equal(location(right).searchParams.has("key"), false);
    assert.equal(location(right).searchParams.get("lang"), "am", "other parameters are kept");
    assert.ok((right.headers.get("set-cookie") ?? "").startsWith(`${STATS_COOKIE}=${await statsToken(KEY)};`));

    const wrong = await proxy(new NextRequest(new URL("/stats?key=nope", BASE)));
    assert.equal(wrong.status, 303);
    assert.equal(location(wrong).searchParams.has("key"), false);
    assert.equal(wrong.headers.get("set-cookie"), null);

    // Only /stats itself: elsewhere ?key= means nothing and passes through.
    assert.equal((await proxy(new NextRequest(new URL("/people?key=x", BASE)))).status, 200);
  });
});

test("the Basic auth gate still runs before the legacy stats link", async () => {
  await withEnv({ STATS_KEY: KEY, APP_PASSWORD: "s3cret" }, async () => {
    const res = await proxy(new NextRequest(new URL(`/stats?key=${KEY}`, BASE)));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("set-cookie"), null);
  });
});

test("the page reads the cookie, not ?key=, and uses the shared constant-time compare", () => {
  const page = readFileSync("src/app/stats/page.tsx", "utf8");
  assert.match(page, /statsCookieOk\(/);
  assert.equal(page.includes("timingSafeEqual"), false);
  assert.equal(/searchParams[^\n]*key\?:/.test(page), false);
  assert.match(page, /action="\/stats\/session"/);
  assert.match(page, /type="password"/);
});
