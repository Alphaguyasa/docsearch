import assert from "node:assert/strict";
import { test } from "node:test";

import type { RetrievedChunk } from "../src/lib/retrieve";
import { checkSafety, crisisResponse, phraseCheck } from "../src/lib/scripture/safety";

const CRISIS: [string, string][] = [
  ["I want to kill myself because of what I did", "self_harm"],
  ["I don't want to live anymore after cheating", "self_harm"],
  ["Everyone would be better off without me", "self_harm"],
  ["I've been cutting myself", "self_harm"],
  ["is suicide a sin", "self_harm"],
  ["መኖር አልፈልግም", "self_harm"],
  ["ራሴን ላጠፋ ነው", "self_harm"],
  ["My uncle abused me when I was young, is it my sin?", "abuse_victim"],
  ["I was raped and feel dirty", "abuse_victim"],
  ["My husband beats me every week", "abuse_victim"],
  ["ተደፈርኩ", "abuse_victim"],
  ["I'm going to kill him tonight", "harm_to_others"],
];
for (const [m, kind] of CRISIS) {
  test(`phraseCheck: "${m}" -> ${kind}`, () => assert.equal(phraseCheck(m), kind));
}

const NOT_CRISIS = [
  "I keep lying to my parents",
  "I cheated on my wife",
  "This story really touched me",
  "I stole from my employer",
  "How was David restored after killing Uriah?",
];
for (const m of NOT_CRISIS) {
  test(`phraseCheck: "${m}" -> none`, () => assert.equal(phraseCheck(m), undefined));
}

test("distress without a phrase hit asks the classifier; classifier failure fails SAFE", async () => {
  assert.deepEqual(await checkSafety("I feel hopeless", async () => "SELF_HARM"), { crisis: true, kind: "self_harm", via: "llm" });
  assert.deepEqual(await checkSafety("I feel hopeless", async () => "NONE"), { crisis: false, via: "llm" });
  assert.deepEqual(await checkSafety("I feel hopeless", async () => { throw new Error("down"); }), { crisis: true, kind: "self_harm", via: "llm" });
});

test("no distress signal: classifier is not called", async () => {
  let called = false;
  await checkSafety("I lied to my boss", async () => { called = true; return "NONE"; });
  assert.equal(called, false);
});

test("phrase hits cannot be downgraded by the classifier", async () => {
  const r = await checkSafety("I want to kill myself", async () => "NONE");
  assert.equal(r.crisis, true);
});

test("abuse response says plainly it is not their sin", () => {
  assert.match(crisisResponse("abuse_victim").message, /not your sin/);
  assert.ok(crisisResponse("self_harm").resources.length > 0);
});

// answer.ts pulls in the validated env; give it harmless dummies and import lazily.
async function answerModule() {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";
  process.env.VOYAGE_API_KEY ??= "test";
  process.env.GENERATION_PROVIDER ??= "gemini";
  process.env.GEMINI_API_KEY ??= "test";
  return import("../src/lib/answer");
}

function chunk(ref: string | null, title = "T"): RetrievedChunk {
  return { id: ref ?? title, documentId: "d", content: "text", title, filename: "f", pageNumber: null,
    ref, traditions: [], vectorScore: null, keywordScore: null, fusedScore: 1 };
}

test("prompt labels Scripture vs Church tradition and keeps the refusal phrase", async () => {
  const { buildMessages, NOT_COVERED_PHRASE } = await answerModule();
  const [sys, user] = buildMessages("I lied", [chunk("Genesis 12:10-20"), chunk("Lausiac History, Moses The Robber")],
    [{ name: "Abraham", summary: "s" }]);
  assert.match(user.content, /\[1\] \(Genesis 12:10-20 — Scripture\)/);
  assert.match(user.content, /\[2\] \(Lausiac History, Moses The Robber — Church tradition\)/);
  assert.match(user.content, /People whose stories the passages focus on: Abraham/);
  assert.ok(sys.content.includes(NOT_COVERED_PHRASE));
  assert.match(sys.content, /Never say or imply "you are forgiven"/);
  assert.match(sys.content, /earliest manuscripts/);
});

test("pre-pivot chunks (no ref) still render with title and page", async () => {
  const { buildMessages } = await answerModule();
  const c = { ...chunk(null, "Paper"), pageNumber: 3 };
  assert.match(buildMessages("q", [c])[1].content, /\[1\] \(Paper, p\.3\)/);
});
