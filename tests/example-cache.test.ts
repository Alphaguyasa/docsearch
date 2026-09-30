import assert from "node:assert/strict";
import { test } from "node:test";

import { cacheExample, EXAMPLE_QUESTIONS, exampleKey, getCachedExample } from "../src/lib/example-cache";

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
