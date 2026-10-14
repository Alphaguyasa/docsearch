import assert from "node:assert/strict";
import { test } from "node:test";

import { searchCounts } from "../src/lib/counts";

test("a story counts its channel, language, struggles and people — never the words", () => {
  const names = searchCounts({
    question: "ለወላጆቼ መዋሸት ማቆም አልቻልኩም",
    via: "telegram",
    kind: "story",
    tags: ["deceit", "deceit"],
    figures: [{ id: "peter" }],
  });
  assert.deepEqual(names, ["story", "via:telegram", "lang:am", "tag:deceit", "person:peter"]);
  assert.ok(!names.some((n) => n.includes("ወላጆቼ")));
});

test("a cached example still counts as a story; a crisis counts its kind", () => {
  assert.ok(searchCounts({ question: "I lie", via: "web", kind: "cached" }).includes("story"));
  assert.deepEqual(searchCounts({ question: "x", via: "web", kind: "crisis", crisisKind: "self_harm" }), [
    "crisis",
    "via:web",
    "lang:en",
    "crisis:self_harm",
  ]);
});
