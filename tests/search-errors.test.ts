/**
 * /api/search used to send upstream text ("Gemini request failed (…): 429")
 * to readers, in English even in the Amharic UI. It now sends a code that the
 * page turns into words in the reader's language; the detail goes to the log.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DICTS, LANGS } from "../src/app/i18n/dict";
import { isSearchErrorCode, SEARCH_ERROR_CODES, SEARCH_ERROR_MESSAGES } from "../src/lib/search-stream";

const route = readFileSync("src/app/api/search/route.ts", "utf8");

test("every error code has words in every language", () => {
  for (const lang of LANGS) {
    for (const code of SEARCH_ERROR_CODES) {
      const text = DICTS[lang].story.errors[code];
      assert.equal(typeof text, "string", `${lang}.${code}`);
      assert.ok(text.length > 0, `${lang}.${code}`);
    }
  }
  for (const code of SEARCH_ERROR_CODES) {
    assert.match(DICTS.am.story.errors[code], /[ሀ-፿]/, `am.${code} is Ethiopic`);
    assert.ok(SEARCH_ERROR_MESSAGES[code].length > 0);
  }
});

test("only known codes are accepted from the wire", () => {
  for (const code of SEARCH_ERROR_CODES) assert.ok(isSearchErrorCode(code));
  for (const bad of ["", "offline", "constructor", "toString", undefined, null, 429])
    assert.equal(isSearchErrorCode(bad), false, String(bad));
});

test("the route never puts an upstream error message on the wire", () => {
  assert.doesNotMatch(route, /errorResponse\(`[^`]*\$\{errorMessage\(/);
  assert.doesNotMatch(route, /type: "error", message: errorMessage\(/);
  assert.match(route, /errorResponse\(SEARCH_ERROR_MESSAGES\.retrieval, 502, "retrieval"\)/);
  assert.match(route, /message: SEARCH_ERROR_MESSAGES\.generation, code: "generation"/);
  assert.match(route, /errorResponse\(BUSY_MESSAGE, 429, "busy"\)/);
});

test("the page shows errors by code, not the server's text", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  assert.doesNotMatch(page, /setError\(msg\.message\)/);
  assert.doesNotMatch(page, /body\?\.error/);
});
