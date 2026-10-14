import assert from "node:assert/strict";
import { test } from "node:test";

import { feedbackSchema } from "../src/lib/feedback";
import { feedbackKeyboard, parseFeedbackData } from "../src/lib/telegram";

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
