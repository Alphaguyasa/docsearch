import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pickVoice, speakableText, speechChunks } from "../src/lib/speech";
import { DICTS } from "../src/app/i18n/dict";

const v = (lang: string, name: string, extra: { default?: boolean; localService?: boolean } = {}) => ({
  lang,
  name,
  ...extra,
});

test("pickVoice matches the language subtag, in any case or separator", () => {
  assert.equal(pickVoice([v("en-US", "a"), v("am-ET", "b")], "am")?.name, "b");
  assert.equal(pickVoice([v("AM_et", "c")], "am")?.name, "c");
  assert.equal(pickVoice([v("en-GB", "d")], "en")?.name, "d");
});

test("pickVoice never falls back to another language", () => {
  // Most phones have no Amharic voice: the button must hide, not read Ethiopic in English.
  assert.equal(pickVoice([v("en-US", "a", { default: true }), v("ar-SA", "b")], "am"), null);
  assert.equal(pickVoice([], "en"), null);
  // "amh" style or a lookalike prefix is not "am".
  assert.equal(pickVoice([v("amx", "x")], "am"), null);
});

test("pickVoice prefers the default voice, then an on-device one", () => {
  const voices = [v("en-US", "remote"), v("en-GB", "local", { localService: true }), v("en-AU", "def", { default: true })];
  assert.equal(pickVoice(voices, "en")?.name, "def");
  assert.equal(pickVoice(voices.slice(0, 2), "en")?.name, "local");
  assert.equal(pickVoice(voices.slice(0, 1), "en")?.name, "remote");
});

test("speakableText drops citation markers and markdown marks", () => {
  assert.equal(
    speakableText("**David** fell [1]. He *wept* [2][3].\n\n\n\n# Restored\nAnd was forgiven [4]."),
    "David fell. He wept.\n\nRestored\nAnd was forgiven.",
  );
  assert.equal(speakableText("ዳዊት ወደቀ [1]።"), "ዳዊት ወደቀ።");
  assert.equal(speakableText("  [1]  "), "");
});

test("speechChunks keeps sentences whole and under the cap", () => {
  const text = "David sinned. He was told so by Nathan! Did he hide it? No.";
  assert.deepEqual(speechChunks(text, 30), ["David sinned.", "He was told so by Nathan!", "Did he hide it? No."]);
  assert.deepEqual(speechChunks(text), [text]);
  assert.deepEqual(speechChunks(""), []);
});

test("speechChunks splits on Amharic sentence ends", () => {
  const am = "ጴጥሮስ ሦስት ጊዜ ካደ። መራራ ልቅሶ አለቀሰ። ኢየሱስ ይቅር አለው።";
  const chunks = speechChunks(am, 20);
  assert.deepEqual(chunks, ["ጴጥሮስ ሦስት ጊዜ ካደ።", "መራራ ልቅሶ አለቀሰ።", "ኢየሱስ ይቅር አለው።"]);
});

test("speechChunks cuts an over-long sentence on spaces, losing no words", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") + ".";
  const chunks = speechChunks(long, 50);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 50, c);
  assert.equal(chunks.join(" "), long);
  // One unbroken run longer than the cap is hard-cut rather than looping forever.
  const run = "x".repeat(120);
  assert.deepEqual(speechChunks(run, 50).join(""), run);
});

test("the listen labels exist in English and Amharic", () => {
  for (const lang of ["en", "am"] as const) {
    const l = DICTS[lang].story.listen;
    for (const key of ["label", "play", "pause", "resume", "stop"] as const) assert.ok(l[key].trim(), `${lang}.${key}`);
  }
  assert.match(DICTS.am.story.listen.play, /[ሀ-፿]/);
});

test("the listen button is on the finished story and hides without a voice", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  assert.match(page, /<ListenButton text=\{answer\} lang=\{textLang\(answer\) \?\? lang\} \/>/);
  const btn = readFileSync("src/app/components/ListenButton.tsx", "utf8");
  assert.match(btn, /if \(!voice\) return null;/);
  assert.match(btn, /speechSynthesis\.cancel\(\)/);
});
