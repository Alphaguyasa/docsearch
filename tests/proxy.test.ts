/**
 * Next 16 renamed the middleware file convention to proxy. If the file or its
 * export kept the old name, Next would quietly stop running it: the Basic auth
 * gate and the hidden DocSearch upload routes would be open.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://not-alone.test"), { headers });

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
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

test("document routes are hidden unless SHOW_DOCUMENTS is on", () => {
  withEnv({ SHOW_DOCUMENTS: undefined, APP_PASSWORD: undefined }, () => {
    assert.equal(proxy(req("/api/upload")).status, 404);
    assert.equal(proxy(req("/documents/1")).status, 404);
    assert.equal(proxy(req("/people")).status, 200);
  });
});

test("APP_PASSWORD asks for Basic auth and accepts the right password", () => {
  withEnv({ APP_PASSWORD: "s3cret" }, () => {
    assert.equal(proxy(req("/")).status, 401);
    const wrong = `Basic ${btoa("any:nope")}`;
    assert.equal(proxy(req("/", { authorization: wrong })).status, 401);
    const right = `Basic ${btoa("any:s3cret")}`;
    assert.equal(proxy(req("/", { authorization: right })).status, 200);
  });
});

test("?lang= is passed to the pages as a request header", () => {
  withEnv({ APP_PASSWORD: undefined }, () => {
    const res = proxy(req("/people?lang=am"));
    assert.equal(res.headers.get("x-middleware-request-x-not-alone-lang"), "am");
  });
});
