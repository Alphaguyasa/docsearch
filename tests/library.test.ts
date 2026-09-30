import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { LIBRARY } from "../src/app/library";
import { TEXT_RULES } from "../src/lib/scripture/sources";

const sources = (JSON.parse(readFileSync("corpus/scripture/sources.json", "utf8")).sources as { id: string; status: string }[])
  .filter((s) => s.status !== "deferred")
  .map((s) => s.id);
const books = LIBRARY.flatMap((g) => g.books);

test("the library lists every fetched source exactly once", () => {
  const listed = books.flatMap((b) => b.sourceIds);
  assert.deepEqual([...listed].sort(), [...sources].sort());
});

test("'shown to' in the library marks exactly the Ethiopian-only books", () => {
  for (const b of books) {
    for (const id of b.sourceIds) {
      const rule = TEXT_RULES[id];
      if (!rule) continue; // Scripture: tradition is per book
      const ethOnly = rule.traditions.length === 1 && rule.traditions[0] === "ethiopian_orthodox";
      assert.deepEqual(b.onlyFor, ethOnly ? ["ethiopian_orthodox"] : undefined, id);
    }
  }
});
