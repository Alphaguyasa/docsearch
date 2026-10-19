import assert from "node:assert/strict";
import { test } from "node:test";

import { DICTS } from "../src/app/i18n/dict";
import { traditionsFor } from "../src/lib/scripture/canon";
import { canonSplit } from "../src/lib/scripture/canon-note";

test("a book every tradition reads needs no label", () => {
  assert.equal(canonSplit(traditionsFor("GEN")), null);
  assert.equal(canonSplit(traditionsFor("JHN")), null);
});

test("unknown tags give no label rather than a wrong one", () => {
  assert.equal(canonSplit(undefined), null);
  assert.equal(canonSplit([]), null);
});

test("the deuterocanon is labelled as outside the Protestant canon", () => {
  assert.deepEqual(canonSplit(traditionsFor("TOB")), {
    inCanon: ["catholic", "eastern_orthodox", "ethiopian_orthodox"],
    notIn: ["protestant"],
  });
  assert.deepEqual(canonSplit(traditionsFor("2ES")), {
    inCanon: ["ethiopian_orthodox"],
    notIn: ["protestant", "catholic", "eastern_orthodox"],
  });
});

test("a book left out of oriental_orthodox is never labelled 'not in the Oriental Orthodox canon'", () => {
  // Revelation is NEEDS REVIEW for the Syriac church, not absent from every Oriental canon.
  assert.equal(canonSplit(traditionsFor("REV")), null);
  assert.deepEqual(canonSplit(traditionsFor("1MA")), {
    inCanon: ["catholic", "eastern_orthodox"],
    notIn: ["protestant", "ethiopian_orthodox"],
  });
});

test("the note reads in English and Amharic, naming every tradition", () => {
  for (const lang of ["en", "am"] as const) {
    const s = DICTS[lang].story;
    for (const name of Object.values(s.canonNames)) assert.ok(name.trim(), `${lang}: empty canon name`);
  }
  const en = DICTS.en.story;
  assert.equal(
    en.canonNote(["Catholic", "Orthodox", "Ethiopian Tewahedo"], ["Protestant"]),
    "In the Catholic, Orthodox and Ethiopian Tewahedo canons; not in the Protestant canon.",
  );
  assert.equal(
    en.canonNote(["Ethiopian Tewahedo"], ["Protestant", "Catholic"]),
    "In the Ethiopian Tewahedo canon; not in the Protestant and Catholic canons.",
  );
  assert.equal(
    DICTS.am.story.canonNote(["ካቶሊክ", "ኦርቶዶክስ"], ["ፕሮቴስታንት"]),
    "በካቶሊክ እና ኦርቶዶክስ ቀኖና ውስጥ አለ፤ በፕሮቴስታንት ቀኖና ውስጥ የለም።",
  );
});
