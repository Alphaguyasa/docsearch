import assert from "node:assert/strict";
import { test } from "node:test";

import { JOURNEY, journeyDay } from "../src/app/journey";
import { FIGURES } from "../src/lib/scripture/figures";

test("the journey is 40 different, readable people", () => {
  assert.equal(JOURNEY.length, 40);
  assert.equal(new Set(JOURNEY).size, 40);
  for (const id of JOURNEY) {
    const f = FIGURES.find((x) => x.id === id);
    assert.ok(f, id);
    assert.ok(f.passages.some((p) => p.sourceId !== "pending"), id);
  }
  assert.equal(journeyDay("prodigal_son"), 1);
  assert.equal(journeyDay("penitent_thief"), 40);
  assert.equal(journeyDay("nobody"), 0);
});
