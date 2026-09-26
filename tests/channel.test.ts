import assert from "node:assert/strict";
import { test } from "node:test";

import { addisHour } from "../src/lib/scripture/today";

test("addisHour is UTC+3, wrapping at midnight", () => {
  assert.equal(addisHour(new Date("2026-09-26T03:00:00Z")), 6);
  assert.equal(addisHour(new Date("2026-09-26T04:00:00Z")), 7);
  assert.equal(addisHour(new Date("2026-09-26T22:30:00Z")), 1);
});
