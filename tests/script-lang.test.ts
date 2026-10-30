import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasEthiopic, textLang } from "../src/lib/script-lang";
import { detectLang } from "../src/lib/telegram";

test("hasEthiopic covers the whole Ethiopic block and nothing else", () => {
  assert.equal(hasEthiopic("ሀ"), true); // U+1200
  assert.equal(hasEthiopic("፿"), true); // U+137F
  assert.equal(hasEthiopic("እዋሻለሁ"), true);
  assert.equal(hasEthiopic("I keep lying"), false);
  assert.equal(hasEthiopic("ᎀ"), false); // Ethiopic Supplement, not used here
});

test("textLang follows the majority script", () => {
  assert.equal(textLang(""), null);
  assert.equal(textLang("**[1]** 3:16 —"), null);
  assert.equal(textLang("ዳዊት ንስሐ ገባ [1]"), "am");
  assert.equal(textLang("David repented [1]"), "en");
  // One Amharic word in an English story keeps it English.
  assert.equal(textLang("David said ንስሐ and wept bitterly before the Lord"), "en");
});

test("the bot's language detection uses the shared helper", () => {
  assert.equal(detectLang("ዋሸሁ"), "am");
  assert.equal(detectLang("I lied", "am"), "en");
  assert.equal(detectLang("123", "am-ET"), "am");
  assert.match(readFileSync("src/lib/telegram.ts", "utf8"), /hasEthiopic\(text\)/);
});

test("the streamed story is marked busy, announced when ready, and carries its language", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  assert.match(page, /aria-busy=\{status === "streaming"\}/);
  assert.match(page, /lang=\{textLang\(answer\) \?\? lang\}/);
  assert.match(page, /role="status"[^>]*>\s*\{status === "done" && answer\.trim\(\) \? t\.story\.ready : ""\}/);
});
