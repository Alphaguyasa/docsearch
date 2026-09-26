import assert from "node:assert/strict";
import { test } from "node:test";

import { FIGURES, cleanPassage, orderedPassages, rankFigures, refsOverlap } from "../src/lib/scripture/figures";
import {
  foldEthiopic,
  mapStruggle,
  matchTags,
  parseLlmTags,
  SYNONYM_TAGS,
  VOCABULARY,
} from "../src/lib/scripture/struggle";

test("every synonym tag is in the vocabulary, and every vocabulary tag has synonyms", () => {
  for (const t of SYNONYM_TAGS) assert.ok(VOCABULARY.includes(t), t);
  for (const t of VOCABULARY) assert.ok(SYNONYM_TAGS.includes(t), t);
});

const PHRASINGS: [string, string][] = [
  ["I keep lying to my parents", "deceit"],
  ["I lied on my CV to get the job", "deceit"],
  ["I cheated on my wife", "adultery"],
  ["I had an affair last year", "adultery"],
  ["I can't stop watching porn", "lust"],
  ["I slept with my girlfriend before marriage", "sexual_sin"],
  // From the first full scripture eval: each of these missed its person.
  ["I slept with a married woman", "adultery"],
  ["I pretended I didn't know Jesus when my friends laughed at me", "denial"],
  ["I lived for years chasing pleasure and ambition before God found me", "lust"],
  ["I lived for years chasing pleasure and ambition before God found me", "pride"],
  ["I was a violent robber", "theft"],
  ["I robbed people and led a gang", "violence"],
  ["I stole money from my boss", "theft"],
  ["I shoplifted again", "theft"],
  ["I get so angry I yell at my kids", "anger"],
  ["I have a terrible temper", "anger"],
  ["I can't forgive my father", "resentment"],
  ["I'm jealous of my friend's success", "envy"],
  ["I think I'm better than others", "pride"],
  ["I'm so arrogant", "pride"],
  ["I doubt God is even real", "doubt"],
  ["I'm losing my faith", "doubt"],
  ["I feel hopeless and too far gone", "despair"],
  ["I was too scared to stand up for my friend", "fear"],
  ["I denied being a Christian at work", "denial"],
  ["I betrayed my best friend", "betrayal"],
  ["I'm a hypocrite at church", "hypocrisy"],
  ["I ran from God for years", "disobedience"],
  ["I quit the ministry when it got hard", "quitting"],
  ["I walked out on my family", "abandonment"],
  ["I feel so ashamed and dirty", "shame"],
  ["I took bribes at my government job", "exploitation"],
  ["I went to a witchcraft doctor", "idolatry"],
  ["ሁልጊዜ እዋሻለሁ", "deceit"],
  ["በጣም ቁጣ አለብኝ", "anger"],
  ["ዝሙት ፈጽሜአለሁ", "sexual_sin"],
];

for (const [message, tag] of PHRASINGS) {
  test(`matchTags: "${message}" -> ${tag}`, () => {
    assert.ok(matchTags(message).includes(tag), `${message} -> ${matchTags(message).join(",")}`);
  });
}

test("a person describing abuse done TO them is never tagged with a sin", () => {
  for (const m of ["I was abused as a child", "My husband beats me", "I was assaulted", "Someone hurt me badly"]) {
    assert.deepEqual(matchTags(m), [], m);
  }
});

test("foldEthiopic unifies homophone letters", () => {
  assert.equal(foldEthiopic("ሠላም"), foldEthiopic("ሰላም"));
  assert.equal(foldEthiopic("ኀፍረት"), foldEthiopic("ሀፍረት"));
  assert.equal(foldEthiopic("ሐዘን"), foldEthiopic("ሀዘን"));
  assert.equal(foldEthiopic("ዐይን"), foldEthiopic("አይን"));
  assert.equal(foldEthiopic("ፀሐይ"), foldEthiopic("ጸሀይ"));
  assert.equal(foldEthiopic("plain text"), "plain text");
});

test("Amharic spelling variants still match (ሠ/ሰ, ኀ/ሀ)", () => {
  assert.ok(matchTags("ሠረቅሁ").includes("theft"));
  assert.ok(matchTags("ሀፍረት ይሰማኛል").includes("shame"));
});

test("parseLlmTags keeps only vocabulary tags, max 3", () => {
  assert.deepEqual(parseLlmTags('Sure: ["deceit", "made_up", "pride"]'), ["deceit", "pride"]);
  assert.deepEqual(parseLlmTags("no json here"), []);
  assert.deepEqual(parseLlmTags('["a","anger","envy","pride","lust"]'), ["anger", "envy", "pride"]);
});

test("mapStruggle uses the LLM only when synonyms find nothing", async () => {
  let called = 0;
  const llm = async () => { called++; return '["pride"]'; };
  assert.deepEqual(await mapStruggle("I lied", llm), { tags: ["deceit"], via: "synonyms" });
  assert.equal(called, 0);
  assert.deepEqual(await mapStruggle("something vague", llm), { tags: ["pride"], via: "llm" });
  assert.deepEqual(await mapStruggle("something vague", async () => { throw new Error("down"); }), { tags: [], via: "none" });
});

test("rankFigures: more matching tags first, scripture before tradition", () => {
  const names = rankFigures(["adultery", "murder"]).map((f) => f.id);
  assert.equal(names[0], "david"); // adultery + murder
  const lust = rankFigures(["lust"], undefined, 10).map((f) => f.id);
  assert.ok(lust.indexOf("samson") < lust.indexOf("augustine"));
});

test("rankFigures: tradition filter and pending sources", () => {
  assert.ok(!rankFigures(["violence"], ["protestant"], 10).some((f) => f.id === "moses_the_ethiopian"));
  assert.ok(rankFigures(["violence"], ["ethiopian_orthodox"], 10).some((f) => f.id === "moses_the_ethiopian"));
  const pending = { ...FIGURES[0], id: "unsourced", passages: [{ role: "restoration" as const, ref: "Life", sourceId: "pending" }] };
  assert.ok(!rankFigures(pending.sins, undefined, 10, [...FIGURES, pending]).some((f) => f.id === "unsourced"), "pending source hidden");
  // Mary of Egypt is read from the Ethiopian Synaxarium, so she appears only where that text is tagged.
  assert.ok(rankFigures(["sexual_sin"], ["ethiopian_orthodox"], 10).some((f) => f.id === "mary_of_egypt"));
  assert.ok(!rankFigures(["sexual_sin"], ["protestant"], 10).some((f) => f.id === "mary_of_egypt"));
});

test("refsOverlap", () => {
  assert.ok(refsOverlap("2 Samuel 10:15-11:3", "2 Samuel 11:1-27"));
  assert.ok(refsOverlap("2 Samuel 11:26-12:10", "2 Samuel 12:1-13"));
  assert.ok(!refsOverlap("2 Samuel 12:14-25", "2 Samuel 11:1-27"));
  assert.ok(refsOverlap("Psalm 51:14-52:6", "Psalm 51"));
  assert.ok(!refsOverlap("1 Samuel 11:1-5", "2 Samuel 11:1-27"));
});

test("orderedPassages reads fall -> restoration -> context", () => {
  const david = FIGURES.find((f) => f.id === "david")!;
  assert.deepEqual(orderedPassages(david).map((p) => p.role), ["fall", "restoration", "restoration"]);
});

// The eval's misses, end to end through ranking: the right person must now be in the top three.
const RESCUED: [string, string, string[]?][] = [
  ["I slept with a married woman", "david"],
  ["I pretended I didn't know Jesus when my friends laughed at me", "peter"],
  ["I lived for years chasing pleasure and ambition before God found me", "augustine"],
  ["I was a violent robber", "moses_the_ethiopian", ["ethiopian_orthodox"]],
  ["I cheated on my wife and I can't forgive myself", "david"],
  ["I used to be a violent robber", "moses_the_ethiopian"],
];
for (const [message, figure, filter] of RESCUED) {
  test(`"${message}" finds ${figure}`, () => {
    const ids = rankFigures(matchTags(message), filter as never).map((f) => f.id);
    assert.ok(ids.includes(figure), `${figure} not in ${ids.join(", ")}`);
  });
}

test("the more specific match comes first: denial names Peter before lying names David", () => {
  const ids = rankFigures(matchTags("I pretended I didn't know Jesus when my friends laughed at me")).map((f) => f.id);
  assert.equal(ids[0], "peter");
});

test("can't forgive MYSELF is shame, not resentment; can't forgive my father stays resentment", () => {
  const self = matchTags("I cheated on my wife and I can't forgive myself");
  assert.ok(self.includes("shame") && !self.includes("resentment"), self.join(","));
  assert.ok(matchTags("I can't forgive my father").includes("resentment"));
});

test("addiction and gossip are recognised in English and Amharic", () => {
  assert.deepEqual(matchTags("I can't stop drinking"), ["addiction"]);
  assert.deepEqual(matchTags("ጫት መቃም ማቆም አልቻልኩም"), ["addiction"]);
  assert.deepEqual(matchTags("የመጠጥ ሱሰኛ ነኝ"), ["addiction"]);
  assert.deepEqual(matchTags("I gossip about my friends"), ["gossip"]);
  assert.deepEqual(matchTags("ሐሜት ማቆም አልቻልኩም"), ["gossip"]);
});

test("the name of Jesus never reads as addiction", () => {
  assert.ok(!matchTags("ኢየሱስን እወዳለሁ ግን ሁልጊዜ እዋሻለሁ").includes("addiction"));
});

test("going to a witch doctor reads as idolatry, and Cyprian answers it", () => {
  assert.deepEqual(matchTags("ወደ ጠንቋይ ሄጃለሁ"), ["idolatry"]);
  assert.deepEqual(matchTags("I went to a witch doctor"), ["idolatry"]);
  assert.ok(rankFigures(["idolatry"], ["ethiopian_orthodox"], 3).some((f) => f.id === "cyprian"));
});

test("cleanPassage drops the leading reference and joins scanned line wraps", () => {
  assert.equal(cleanPassage("Luke 22:9-22\n\nThey said to him.\n\nHe said.", "Luke 22:9-22"), "They said to him.\n\nHe said.");
  assert.equal(cleanPassage("Ethiopian Synaxarium, Miyazya On this day\ndied   Saint MARY", "Ethiopian Synaxarium, Miyazya"), "On this day died Saint MARY");
  assert.equal(cleanPassage("no ref here", null), "no ref here");
});
