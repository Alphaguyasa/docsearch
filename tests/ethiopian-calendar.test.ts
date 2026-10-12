import assert from "node:assert/strict";
import { test } from "node:test";

import { churchDay, easterDay } from "../src/lib/ethiopian-calendar";

const at = (iso: string) => churchDay(new Date(`${iso}T09:00:00Z`));
const iso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

test("Ethiopian Easter (Fasika) follows the Julian computus", () => {
  assert.equal(iso(easterDay(2024)), "2024-05-05");
  assert.equal(iso(easterDay(2025)), "2025-04-20");
  assert.equal(iso(easterDay(2026)), "2026-04-12");
  assert.equal(iso(easterDay(2027)), "2027-05-02");
});

test("Ethiopian dates and fixed feasts", () => {
  assert.deepEqual(at("2025-09-11").date, { year: 2018, month: 1, day: 1 });
  assert.equal(at("2025-09-11").feast, "enkutatash");
  assert.equal(at("2025-09-27").feast, "meskel");
  assert.deepEqual(at("2026-01-07").date, { year: 2018, month: 4, day: 29 });
  assert.equal(at("2026-01-07").feast, "genna");
  assert.equal(at("2024-01-07").feast, "genna"); // Tahsas 28 after a leap year
  assert.equal(at("2024-01-20").feast, "timket");
  assert.equal(at("2026-01-19").feast, "timket");
  assert.equal(at("2026-08-22").feast, "filseta");
});

test("The day turns at midnight in Addis Ababa", () => {
  // 22:30 UTC on 10 September is 01:30 on 11 September in Addis Ababa: New Year.
  assert.equal(churchDay(new Date("2025-09-10T22:30:00Z")).feast, "enkutatash");
});

test("Fasts: Nineveh, Hudade, the Apostles, the Prophets, Filseta, Wednesdays and Fridays", () => {
  assert.equal(at("2026-02-02").fast, "nineveh");
  assert.equal(at("2026-02-16").fast, "hudade");
  assert.equal(at("2026-04-10").feast, "siklet");
  assert.equal(at("2026-04-10").fast, "hudade");
  assert.equal(at("2026-04-12").fast, undefined); // Fasika
  assert.equal(at("2026-04-15").fast, undefined); // a Wednesday in the fifty days
  assert.equal(at("2026-06-15").fast, "hawaryat");
  assert.equal(at("2026-07-12").fast, undefined); // after Hamle 4
  assert.equal(at("2026-12-01").fast, "nebiyat");
  assert.equal(at("2026-08-07").fast, "filseta");
  assert.equal(at("2026-10-14").fast, "wednesday");
  assert.equal(at("2026-10-16").fast, "friday");
  assert.equal(at("2026-10-12").fast, undefined); // a Monday
});

test("Monthly commemorations", () => {
  assert.equal(at("2026-10-22").monthly, "michael"); // Tikimt 12
  assert.equal(at("2026-11-02").monthly, "giyorgis"); // Tikimt 23
  assert.equal(at("2026-10-21").monthly, undefined);
});
