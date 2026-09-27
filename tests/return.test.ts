import assert from "node:assert/strict";
import { test } from "node:test";

import { RETURN_STEPS } from "../src/app/return";

test("every step has a verse, its source chunk and both languages", () => {
  assert.ok(RETURN_STEPS.length >= 4);
  for (const s of RETURN_STEPS) {
    assert.match(s.chunkId, /^[0-9a-f-]{36}$/);
    assert.ok(s.quote.length > 10 && s.ref && s.refAm);
    for (const l of [s.en, s.am]) assert.ok(l.title && l.body);
  }
  assert.equal(new Set(RETURN_STEPS.map((s) => s.ref)).size, RETURN_STEPS.length);
});
