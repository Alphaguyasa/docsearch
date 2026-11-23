import assert from "node:assert/strict";
import { test } from "node:test";

import { feedbackSchema } from "../src/lib/feedback";
import { figureText } from "../src/app/i18n/dict";
import { FIGURES } from "../src/lib/scripture/figures";
import { TEXT, feedbackKeyboard, inlinePeople, parseFeedbackData } from "../src/lib/telegram";

test("feedback accepts only known people and tags — never free text", () => {
  assert.ok(feedbackSchema.safeParse({ helpful: true, figures: ["peter"], tags: ["denial"], lang: "en" }).success);
  assert.ok(!feedbackSchema.safeParse({ helpful: true, figures: ["I lied to my wife"], tags: [], lang: "en" }).success);
  assert.ok(!feedbackSchema.safeParse({ helpful: true, figures: [], tags: ["my secret"], lang: "en" }).success);
  assert.ok(!feedbackSchema.safeParse({ helpful: "yes", figures: [], tags: [], lang: "en" }).success);
  assert.ok(!feedbackSchema.safeParse({ helpful: true, figures: [], tags: [], lang: "fr" }).success);
});

test("Telegram feedback buttons fit in 64 bytes and decode to what the story used", () => {
  const figures = [{ id: "woman_caught_in_adultery" }, { id: "david" }, { id: "samaritan_woman" }].map((f) => ({
    ...f,
    name: "",
    summary: "",
    kind: "scripture" as const,
  }));
  const kb = feedbackKeyboard({ figures }, ["adultery", "sexual_sin", "shame"], "am");
  const [yes, no] = kb.inline_keyboard[0];
  for (const b of [yes, no]) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  const got = parseFeedbackData(yes.callback_data)!;
  assert.equal(got.helpful, true);
  assert.equal(got.lang, "am");
  assert.deepEqual(got.figures, ["woman_caught_in_adultery", "david", "samaritan_woman"]);
  assert.equal(parseFeedbackData(no.callback_data)!.helpful, false);
  assert.equal(parseFeedbackData("something else"), null);
});

test("the share button opens the chat picker on the first readable person, in the reader's language", () => {
  const card = (id: string) => ({ id, name: "", summary: "", kind: "scripture" as const });
  for (const lang of ["en", "am"] as const) {
    const kb = feedbackKeyboard({ figures: [card("not_a_person"), card("peter"), card("david")] }, ["denial"], lang);
    assert.equal(kb.inline_keyboard.length, 2);
    const [share] = kb.inline_keyboard[1];
    assert.equal(share.text, TEXT[lang].share);
    const peter = FIGURES.find((f) => f.id === "peter")!;
    const name = figureText(lang, peter).name;
    assert.equal(share.switch_inline_query, name);
    // The name typed into inline search must bring that person up first.
    assert.equal(inlinePeople(name)[0].id, "peter");
  }
});

test("every readable person's name finds them first in inline search, in both languages", () => {
  for (const f of FIGURES.filter((x) => x.passages.some((p) => p.sourceId !== "pending"))) {
    for (const lang of ["en", "am"] as const) {
      assert.equal(inlinePeople(figureText(lang, f).name)[0]?.id, f.id, `${lang} ${f.id}`);
    }
  }
});

test("no share button when the answer has no readable person", () => {
  const kb = feedbackKeyboard({ figures: [] }, [], "en");
  assert.equal(kb.inline_keyboard.length, 1);
});
