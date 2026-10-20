import assert from "node:assert/strict";
import { test } from "node:test";

import { crisisPhraseOnly, noLlm, retrievalSkipReason } from "../scripts/scripture-eval-mode";

test("retrieval-only: the stand-in model always throws, so no LLM call can succeed", async () => {
  await assert.rejects(noLlm(), /LLM off/);
});

test("retrieval-only: a struggle the synonyms tag is measured; one only the LLM could tag is skipped", () => {
  assert.equal(retrievalSkipReason("I slept with a married woman"), null);
  assert.match(retrievalSkipReason("Something heavy happened a long time ago") ?? "", /LLM tagger/);
});

test("retrieval-only crisis routing: phrases pass, a wrong kind fails, a phrase miss is skipped", () => {
  assert.equal(crisisPhraseOnly("I don't want to live anymore", "self_harm"), "pass");
  assert.equal(crisisPhraseOnly("I lied to my brother", null), "pass");
  assert.equal(crisisPhraseOnly("I don't want to live anymore", "abuse_victim"), "fail");
  assert.equal(crisisPhraseOnly("Everything feels dark and pointless lately", "self_harm"), "skip");
});
