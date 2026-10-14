import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_JOURNAL,
  addEntry,
  begin,
  beginAgain,
  daysSince,
  markPrayed,
  parseJournal,
  recentDays,
  removeEntry,
} from "../src/app/journal-store";

test("journal: counting days, beginning again and marking prayers", () => {
  let j = begin(EMPTY_JOURNAL, 100);
  assert.equal(daysSince(j, 100), 1);
  assert.equal(daysSince(j, 106), 7);
  j = markPrayed(markPrayed(j, 106), 106);
  assert.deepEqual(j.prayed, [106]);
  j = beginAgain(j, 110);
  assert.equal(daysSince(j, 110), 1);
  assert.equal(j.restarts, 1);
  assert.deepEqual(j.prayed, [106]); // prayers stay
  const recent = recentDays(j, 110, 7);
  assert.equal(recent.length, 7);
  assert.deepEqual(recent.at(-1), { day: 110, prayed: false });
  assert.deepEqual(recent.find((d) => d.day === 106), { day: 106, prayed: true });
});

test("journal: notes are kept newest first, trimmed, and can be deleted", () => {
  let j = addEntry(EMPTY_JOURNAL, 1, "  first  ");
  j = addEntry(j, 2, "second");
  j = addEntry(j, 3, "   ");
  assert.deepEqual(j.entries, [{ day: 2, text: "second" }, { day: 1, text: "first" }]);
  assert.deepEqual(removeEntry(j, 0).entries, [{ day: 1, text: "first" }]);
});

test("journal: whatever is in storage, it reads back safely", () => {
  assert.deepEqual(parseJournal(null), EMPTY_JOURNAL);
  assert.deepEqual(parseJournal("not json"), EMPTY_JOURNAL);
  assert.deepEqual(parseJournal("[1,2]").entries, []);
  const j = parseJournal(JSON.stringify({ start: 5.5, prayed: [1, "x", 3], restarts: -2, entries: [{ day: 1, text: "ok" }, { day: "x" }] }));
  assert.deepEqual(j, { start: null, prayed: [1, 3], restarts: 0, entries: [{ day: 1, text: "ok" }] });
});
