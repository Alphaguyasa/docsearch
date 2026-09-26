import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { backoffMs, isRetryableStatus, isTransient } from "../src/lib/transient";

/**
 * The predicate that decides whether a failed search is retried.
 *
 * Both halves matter and the second is the one that bites. Retrying too little
 * loses a question to a hiccup that would have cleared; retrying too much turns
 * a wrong key or a missing function into three slow failures instead of one
 * fast, legible one. The permanent cases below are therefore not filler.
 */
describe("isTransient", () => {
  describe("retries", () => {
    it("clock skew on the token Supabase mints — the case this exists for", () => {
      assert.equal(isTransient("JWT issued at future"), true);
    });

    it("clock skew the other direction", () => {
      assert.equal(isTransient("JWT expired"), true);
    });

    it("matches regardless of case or surrounding text", () => {
      assert.equal(isTransient('{"message":"jwt Issued At Future","code":"PGRST301"}'), true);
    });

    it("dropped and refused connections", () => {
      for (const m of [
        "TypeError: fetch failed",
        "read ECONNRESET",
        "connect ECONNREFUSED 10.0.0.1:5432",
        "connect ETIMEDOUT",
        "socket hang up",
      ]) {
        assert.equal(isTransient(m), true, m);
      }
    });

    it("Postgres connection-exception class 08 and too-many-connections", () => {
      assert.equal(isTransient("08006: connection failure"), true);
      assert.equal(isTransient("08001: sqlclient unable to establish connection"), true);
      assert.equal(isTransient("53300: too many connections for role"), true);
    });

    it("a statement the server gave up on", () => {
      assert.equal(isTransient("canceling statement due to statement timeout"), true);
    });
  });

  describe("does not retry", () => {
    it("a bad or revoked key, which fails identically every time", () => {
      assert.equal(isTransient("Invalid API key"), false);
      assert.equal(isTransient("JWSError JWSInvalidSignature"), false);
    });

    it("a missing function — a deploy problem, not a blip", () => {
      assert.equal(
        isTransient('Could not find the function public.keyword_chunks(query_text)'),
        false,
      );
    });

    it("a SQL error in the query itself", () => {
      assert.equal(isTransient('syntax error in tsquery: "OR"'), false);
      assert.equal(isTransient("column c.tsv does not exist"), false);
    });

    it("row-level security refusing the request", () => {
      assert.equal(isTransient("new row violates row-level security policy"), false);
    });

    it("an empty or unrecognised message", () => {
      assert.equal(isTransient(""), false);
      assert.equal(isTransient("something went wrong"), false);
    });

    /**
     * The 08-class pattern is bounded by word breaks on purpose: a bare 5-digit
     * number that merely contains "08" is not a connection exception.
     */
    it("a number that merely contains a connection-class code", () => {
      assert.equal(isTransient("returned 208001 rows"), false);
      assert.equal(isTransient("cost estimate 0800123"), false);
    });
  });
});

/** Which model-API responses are retried: overload and rate limits, never a bad request or key. */
describe("isRetryableStatus", () => {
  it("retries the 503 'high demand' that killed the first scripture eval", () => {
    assert.equal(isRetryableStatus(503), true);
  });

  it("retries rate limits and other transient server errors", () => {
    for (const s of [429, 500, 502, 504]) assert.equal(isRetryableStatus(s), true, String(s));
  });

  it("does not retry errors that fail identically every time", () => {
    for (const s of [200, 400, 401, 403, 404]) assert.equal(isRetryableStatus(s), false, String(s));
  });
});

describe("backoffMs", () => {
  const mid = () => 0.5;

  it("doubles per attempt, with jitter around the base", () => {
    assert.equal(backoffMs(0, null, mid), 1000);
    assert.equal(backoffMs(1, null, mid), 2000);
    assert.equal(backoffMs(2, null, mid), 4000);
    assert.equal(backoffMs(0, null, () => 0), 750);
    assert.equal(backoffMs(0, null, () => 1), 1250);
  });

  it("caps the wait", () => {
    assert.equal(backoffMs(10, null, mid), 8000);
  });

  it("honours a sane Retry-After, ignores a silly one", () => {
    assert.equal(backoffMs(0, "3", mid), 3000);
    assert.equal(backoffMs(0, "600", mid), 1000);
    assert.equal(backoffMs(0, "soon", mid), 1000);
  });
});
