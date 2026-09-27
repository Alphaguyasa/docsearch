import assert from "node:assert/strict";
import { test } from "node:test";

import { PRAYERS, prayerFor } from "../src/lib/scripture/prayers";

test("prayerFor picks by person, then struggle", () => {
  assert.equal(prayerFor(["lust"], "david").id, "psalm51");
  assert.equal(prayerFor(["idolatry"], "manasseh").id, "manasseh");
  assert.equal(prayerFor(["despair"]).id, "manasseh");
  assert.equal(prayerFor(["pride"]).id, "tax_collector");
  assert.equal(prayerFor(["anger"]).id, "psalm51");
  assert.equal(prayerFor([]).id, "psalm51");
});

test("every prayer points at a corpus chunk and has text", () => {
  for (const p of PRAYERS) {
    assert.match(p.chunkId, /^[0-9a-f-]{36}$/);
    assert.ok(p.lines.length > 0 && p.lines.every((l) => l.length > 10));
  }
});
