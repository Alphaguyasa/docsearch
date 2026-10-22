/**
 * The project rules in CLAUDE.md, pinned as tests. Each of these protects
 * against a failure a reader could not detect for themselves: an invented
 * quote, a copyrighted translation, an answer that speaks for God, or an eval
 * number that was tuned on the questions meant to check it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { RetrievedChunk } from "../src/lib/retrieve";
import { crisisResponse, phraseCheck } from "../src/lib/scripture/safety";

/** answer.ts validates env on import; same dummies as tests/scripture-safety.test.ts. */
async function answerModule() {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";
  process.env.VOYAGE_API_KEY ??= "test";
  process.env.GENERATION_PROVIDER ??= "gemini";
  process.env.GEMINI_API_KEY ??= "test";
  return import("../src/lib/answer");
}

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface Source {
  id: string;
  title: string;
  license?: string;
  status?: string;
}
const SOURCES: Source[] = JSON.parse(read("corpus/scripture/sources.json")).sources;

/** Licenses a source may carry. Anything else needs an entry in NEEDS_APPROVAL.md first. */
const OPEN_LICENSE = /^(Public domain|CC0|CC BY(-SA)? \d)/i;

test("every corpus source records a public-domain or open license", () => {
  assert.ok(SOURCES.length > 0);
  for (const s of SOURCES) {
    assert.ok(s.license?.trim(), `${s.id} has no license`);
    assert.match(s.license ?? "", OPEN_LICENSE, `${s.id}: "${s.license}" is not public domain or an open license`);
  }
});

test("every corpus source is listed in SOURCES.md with its license", () => {
  const doc = read("SOURCES.md");
  for (const s of SOURCES) {
    assert.ok(doc.includes(`\`${s.id}\``), `SOURCES.md does not list \`${s.id}\``);
  }
});

/*
 * The holdout splits are frozen. Retrieval and prompts are never tuned on them,
 * so their questions must not change either. If you are certain a holdout edit
 * is legitimate (e.g. a factual error in an expected reference), record why in
 * DAILY_LOG.md and update the hash in the same PR.
 */
const HOLDOUT_SCRIPTURE = "572288a2fd3e9bffdb10a0f9262119db09d0d1a425a5087b2f1067fb9daf45ab";
const HOLDOUT_PAPERS = "75ae36db57dca19daa23ba50a87cb817baa625f6b80744bde32733f7d73094e5";

test("the scripture holdout split is untouched", () => {
  const golden = JSON.parse(read("eval/scripture-golden.json")) as { questions: { split?: string }[] };
  const holdout = golden.questions.filter((q) => q.split === "holdout");
  assert.ok(holdout.length >= 10, "holdout shrank");
  assert.equal(sha256(JSON.stringify(holdout)), HOLDOUT_SCRIPTURE);
});

test("the paper-search holdout file is untouched", () => {
  assert.equal(sha256(read("eval/golden/questions.holdout.jsonl")), HOLDOUT_PAPERS);
});

const chunk = (ref: string): RetrievedChunk => ({
  id: "c1",
  documentId: "d1",
  content: "And David said unto Nathan, I have sinned against the LORD.",
  title: "World English Bible",
  filename: "web",
  pageNumber: null,
  ref,
  traditions: ["protestant", "catholic", "orthodox", "ethiopian_orthodox"],
  vectorScore: 1,
  keywordScore: null,
  fusedScore: 1,
});

test("the answer prompt requires citations and passage-only answers", async () => {
  const { buildMessages, NOT_COVERED_PHRASE } = await answerModule();
  const [system] = buildMessages("I lied", [chunk("2 Samuel 12:13")]);
  assert.match(system.content, /ONLY information found in the context passages/);
  assert.match(system.content, /inline citation/);
  assert.ok(system.content.includes(NOT_COVERED_PHRASE), "refusal phrase missing");
});

test("the answer prompt never lets the model speak for God", async () => {
  const { buildMessages } = await answerModule();
  const [system] = buildMessages("I lied", [chunk("2 Samuel 12:13")]);
  assert.match(system.content, /Never say or imply "you are forgiven"/);
  assert.match(system.content, /priest, pastor/);
});

test("passages carry a Scripture / Church tradition label", async () => {
  const { buildMessages } = await answerModule();
  const [, user] = buildMessages("I lied", [chunk("2 Samuel 12:13"), chunk("The Paradise of the Holy Fathers §4")]);
  assert.match(user.content, /\[1\] \(2 Samuel 12:13 — Scripture\)/);
  assert.match(user.content, /\[2\] \(The Paradise of the Holy Fathers §4 — Church tradition\)/);
});

test("a tradition only Western churches read is labelled with those churches", async () => {
  const { buildMessages } = await answerModule();
  const bunyan = { ...chunk("Grace Abounding §45–47"), traditions: ["protestant"] };
  const kempis = { ...chunk("The Imitation of Christ, Book I, Chapter I §1–2"), traditions: ["catholic", "protestant"] };
  const [system, user] = buildMessages("I doubt", [bunyan, kempis]);
  assert.match(user.content, /\[1\] \(Grace Abounding §45–47 — Church tradition \(Protestant\)\)/);
  assert.match(user.content, /\[2\] \(The Imitation of Christ, Book I, Chapter I §1–2 — Church tradition \(Catholic and Protestant\)\)/);
  assert.match(system.content, /say whose tradition it is/);
});

test("someone in distress is pointed to real help, not a story", () => {
  assert.equal(phraseCheck("I don't want to live anymore"), "self_harm");
  for (const kind of ["self_harm", "abuse_victim", "harm_to_others"] as const) {
    const card = crisisResponse(kind);
    assert.ok(card.resources.some((r) => r.phone || r.url), `${kind}: no phone or link to call`);
    assert.ok(card.steps.some((s) => /priest|pastor|trust/i.test(s)), `${kind}: no trusted person`);
    const am = crisisResponse(kind, "am");
    assert.ok(am.resources.some((r) => r.phone || r.url), `${kind} (am): no phone or link to call`);
    assert.ok(am.steps.some((s) => /ካህን|መጋቢ/.test(s)), `${kind} (am): no trusted person`);
  }
});
