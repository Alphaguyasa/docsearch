import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { emphasisRuns } from "../src/lib/emphasis";
import { markdownToHtml } from "../src/lib/telegram";

const plain = (s: string) =>
  emphasisRuns(s)
    .map((r) => r.text)
    .join("");

test("bold and italics become runs, without their asterisks", () => {
  assert.deepEqual(emphasisRuns("**David** fell, and he *wept* [1]."), [
    { text: "David", bold: true },
    { text: " fell, and he " },
    { text: "wept", italic: true },
    { text: " [1]." },
  ]);
});

test("a citation inside bold stays inside the run, for AnswerView to split", () => {
  assert.deepEqual(emphasisRuns("**Peter wept [2]**"), [{ text: "Peter wept [2]", bold: true }]);
});

test("italics nest inside bold; a heading line is bold without its marks", () => {
  assert.deepEqual(emphasisRuns("**a *b* c**"), [
    { text: "a ", bold: true },
    { text: "b", bold: true, italic: true },
    { text: " c", bold: true },
  ]);
  assert.deepEqual(emphasisRuns("## The **fall**\nHe sinned."), [
    { text: "The fall", bold: true },
    { text: "\nHe sinned." },
  ]);
});

test("text without markdown, and Amharic, comes back unchanged", () => {
  for (const s of ["He confessed [1]. Then\n\nhe was forgiven [2].", "ዳዊት ንስሐ ገባ [1]።", "2 * 3 = 6", ""]) {
    assert.equal(plain(s), s);
    assert.ok(emphasisRuns(s).every((r) => !r.bold && !r.italic));
  }
});

test("an unclosed ** while streaming is left as written", () => {
  assert.equal(plain("**Dav"), "**Dav");
  assert.ok(emphasisRuns("**Dav").every((r) => !r.bold));
  // Emphasis does not reach across lines, like the bot's.
  assert.equal(plain("*one\ntwo*"), "*one\ntwo*");
});

test("the site and the bot agree on what is bold and italic", () => {
  for (const s of ["**David** fell", "he *wept* bitterly", "# Restored", "**a *b* c**", "plain [1]"]) {
    const html = markdownToHtml(s);
    const runs = emphasisRuns(s);
    assert.equal(runs.some((r) => r.bold), html.includes("<b>"), s);
    assert.equal(runs.some((r) => r.italic), html.includes("<i>"), s);
    assert.equal(plain(s), html.replace(/<\/?[bi]>/g, ""), s);
  }
});

test("AnswerView renders emphasis runs, not raw markdown", () => {
  const view = readFileSync("src/app/components/AnswerView.tsx", "utf8");
  assert.match(view, /emphasisRuns\(answer\)/);
  assert.match(view, /<strong/);
  assert.match(view, /<em>/);
  assert.doesNotMatch(view, /dangerouslySetInnerHTML/);
});
