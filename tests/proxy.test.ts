/**
 * Next 16 renamed the middleware file convention to proxy. If the file or its
 * export kept the old name, Next would quietly stop running it: the Basic auth
 * gate and the hidden DocSearch upload routes would be open.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { config, proxy } from "../src/proxy";

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://not-alone.test"), { headers });

async function withEnv(env: Record<string, string | undefined>, fn: () => unknown) {
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

test("the gate lives in src/proxy.ts, with no leftover middleware file", () => {
  assert.ok(existsSync("src/proxy.ts"));
  assert.equal(existsSync("src/middleware.ts"), false);
});

// They could list and delete corpus books through the service-role client
// (ROADMAP 23), so they are gone rather than hidden behind a flag.
test("the legacy DocSearch upload and document routes stay removed", async () => {
  for (const dir of ["src/app/documents", "src/app/api/upload", "src/app/api/process", "src/app/api/documents"]) {
    assert.equal(existsSync(dir), false, dir);
  }
  await withEnv({ APP_PASSWORD: undefined }, async () => {
    assert.equal((await proxy(req("/people"))).status, 200);
  });
});

test("APP_PASSWORD asks for Basic auth and accepts the right password", async () => {
  await withEnv({ APP_PASSWORD: "s3cret" }, async () => {
    assert.equal((await proxy(req("/"))).status, 401);
    const wrong = `Basic ${btoa("any:nope")}`;
    assert.equal((await proxy(req("/", { authorization: wrong }))).status, 401);
    const right = `Basic ${btoa("any:s3cret")}`;
    assert.equal((await proxy(req("/", { authorization: right }))).status, 200);
  });
});

test("?lang= is passed to the pages as a request header", async () => {
  await withEnv({ APP_PASSWORD: undefined }, async () => {
    const res = await proxy(req("/people?lang=am"));
    assert.equal(res.headers.get("x-middleware-request-x-not-alone-lang"), "am");
  });
});

// Next turns the matcher into a path regex; this mirrors it closely enough to
// check which paths the gate sees.
const gated = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

test("the Telegram webhook, setup and daily cron skip the Basic auth gate", () => {
  // Telegram and Vercel cron cannot send Basic credentials; each route checks its own secret.
  for (const p of ["/api/telegram", "/api/telegram/daily", "/api/telegram/setup"]) {
    assert.equal(gated(p), false, p);
  }
  for (const p of ["/", "/people", "/api/search", "/api/feedback", "/about"]) {
    assert.equal(gated(p), true, p);
  }
});

test("the auth challenge names Not Alone, not DocSearch", async () => {
  await withEnv({ APP_PASSWORD: "s3cret" }, async () => {
    assert.match((await proxy(req("/"))).headers.get("www-authenticate") ?? "", /realm="Not Alone"/);
  });
});
