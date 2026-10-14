import assert from "node:assert/strict";
import { test } from "node:test";

import { amharicPassage, parseSpans } from "../src/lib/scripture/amharic";
import { FIGURES } from "../src/lib/scripture/figures";

test("references parse into verse spans", () => {
  assert.deepEqual(parseSpans("15:18, 20"), [
    { c1: 15, v1: 18, c2: 15, v2: 18 },
    { c1: 15, v1: 20, c2: 15, v2: 20 },
  ]);
  assert.deepEqual(parseSpans("51:1–2, 10–12"), [
    { c1: 51, v1: 1, c2: 51, v2: 2 },
    { c1: 51, v1: 10, c2: 51, v2: 12 },
  ]);
  assert.deepEqual(parseSpans("31:20-32:6"), [{ c1: 31, v1: 20, c2: 32, v2: 6 }]);
  assert.deepEqual(parseSpans("51"), [{ c1: 51, v1: 1, c2: 51, v2: 999 }]);
  assert.equal(parseSpans("x"), null);
});

test("the tax collector's prayer and the prodigal's father read as the 1962 Amharic Bible", () => {
  const tax = amharicPassage("Luke 18:13");
  assert.ok(tax?.text.includes("አምላክ ሆይ፥ እኔን ኃጢአተኛውን ማረኝ"));
  assert.equal(tax?.ref, "የሉቃስ ወንጌል 18፥13");
  assert.ok(amharicPassage("Luke 15:20")?.text.includes("ሮጦም አንገቱን አቀፈውና ሳመው"));
  assert.ok(amharicPassage("Psalm 51:1")?.text.startsWith("አቤቱ፥ እንደ ቸርነትህ መጠን ማረኝ"));
  assert.ok(amharicPassage("Luke 1:63-64")?.text.includes("አፉ ተከፈተ"));
});

test("books whose numbering differs, unknown books and broken text stay English", () => {
  assert.equal(amharicPassage("Jonah 2:1-10"), null);
  assert.equal(amharicPassage("Jonah 1:17"), null);
  assert.ok(amharicPassage("Jonah 1:1-3"));
  assert.equal(amharicPassage("Prayer of Manasseh"), null);
  assert.equal(amharicPassage("Jeremiah 2:35"), null); // still carries a transliteration leftover
});

test("almost every Scripture passage the people pages use has an Amharic text", () => {
  const refs = [...new Set(FIGURES.flatMap((f) => f.passages.filter((p) => p.sourceId === "web").map((p) => p.ref)))];
  const missing = refs.filter((r) => !amharicPassage(r));
  assert.deepEqual(missing.sort(), ["Jonah 2:1-10", "Prayer of Manasseh"].sort());
});

test("every Amharic prayer and 'Coming back' quote is word for word in the 1962 Amharic Bible", async () => {
  const { PRAYERS } = await import("../src/lib/scripture/prayers");
  const { RETURN_STEPS } = await import("../src/app/return");
  for (const p of PRAYERS.filter((x) => x.linesAm)) {
    const text = amharicPassage(p.ref)?.text ?? "";
    for (const line of p.linesAm!) assert.ok(text.includes(line), `${p.id}: ${line}`);
  }
  for (const s of RETURN_STEPS.filter((x) => x.quoteAm)) {
    const text = amharicPassage(s.ref)?.text ?? "";
    for (const part of s.quoteAm!.split(" … ")) assert.ok(text.includes(part), `${s.ref}: ${part}`);
  }
});
