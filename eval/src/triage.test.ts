import { describe, expect, it } from "vitest";

import {
  buildIdf,
  contentTerms,
  cosineSimilarity,
  lexicalOverlap,
  sortForReview,
  triageCandidates,
} from "./triage";

/** A small corpus where "widget" is common and "thermocouple" is rare. */
const CORPUS = [
  "The widget assembly is described here in detail.",
  "Widget maintenance requires a widget spanner.",
  "Every widget ships with a widget manual.",
  "Calibrate the thermocouple against a reference standard.",
];
const IDF = buildIdf(CORPUS);
const N = CORPUS.length;

describe("contentTerms", () => {
  it("lowercases and strips stopwords", () => {
    expect(contentTerms("The Widget IS in the box")).toEqual(["widget", "box"]);
  });

  it("keeps digits — numbers are what near-miss questions turn on", () => {
    expect(contentTerms("increased by 35 percent in 2025")).toContain("35");
    expect(contentTerms("increased by 35 percent in 2025")).toContain("2025");
  });

  it("drops single characters and punctuation", () => {
    expect(contentTerms("a b, cd — ef!")).toEqual(["cd", "ef"]);
  });

  it("stems inflections so 'calibrates' matches 'calibrate'", () => {
    expect(contentTerms("calibrates")).toEqual(contentTerms("calibrate"));
    expect(contentTerms("standards")).toEqual(contentTerms("standard"));
    expect(contentTerms("verifies")).toEqual(["verify"]);
  });

  it("does not over-stem words that merely end in s", () => {
    expect(contentTerms("process")).toEqual(["process"]);
    expect(contentTerms("status")).toEqual(["status"]);
    expect(contentTerms("analysis")).toEqual(["analysis"]);
  });

  it("never stems a number", () => {
    expect(contentTerms("2025")).toEqual(["2025"]);
  });

  it("returns nothing for text that is entirely stopwords", () => {
    expect(contentTerms("the and of it")).toEqual([]);
  });
});

describe("buildIdf", () => {
  it("scores a rare term above a common one", () => {
    expect(IDF.get("thermocouple")!).toBeGreaterThan(IDF.get("widget")!);
  });
});

describe("lexicalOverlap", () => {
  it("is high when the question lifts the passage's rare wording", () => {
    const score = lexicalOverlap(
      "What reference standard calibrates the thermocouple?",
      "Calibrate the thermocouple against a reference standard.",
      IDF,
      N,
    );
    expect(score).toBeGreaterThan(0.9);
  });

  it("is low when the question asks the same thing in other words", () => {
    const lifted = lexicalOverlap(
      "How is the thermocouple calibrated against a reference standard?",
      "Calibrate the thermocouple against a reference standard.",
      IDF,
      N,
    );
    const reworded = lexicalOverlap(
      "Which benchmark device verifies temperature probe accuracy?",
      "Calibrate the thermocouple against a reference standard.",
      IDF,
      N,
    );
    // The point of the metric: paraphrase must score materially lower.
    expect(reworded).toBeLessThan(lifted);
    expect(reworded).toBeLessThan(0.3);
  });

  it("is 0 when nothing is shared", () => {
    expect(lexicalOverlap("unrelated enquiry", "Calibrate the thermocouple.", IDF, N)).toBe(0);
  });

  it("is 0 for a question with no content terms", () => {
    expect(lexicalOverlap("the and of", "Calibrate the thermocouple.", IDF, N)).toBe(0);
  });

  it("weights rare shared terms above common ones", () => {
    const rare = lexicalOverlap("thermocouple", "the thermocouple", IDF, N);
    const common = lexicalOverlap("widget", "the widget", IDF, N);
    // Both are full containment, so both are 1 — the weighting shows up when
    // a question mixes the two.
    expect(rare).toBe(1);
    expect(common).toBe(1);

    const mixed = lexicalOverlap("widget thermocouple", "the thermocouple only", IDF, N);
    // Sharing the RARE half should carry more than half the weight.
    expect(mixed).toBeGreaterThan(0.5);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical text", () => {
    expect(cosineSimilarity("widget spanner", "widget spanner", IDF, N)).toBeCloseTo(1);
  });

  it("is 0 for disjoint text", () => {
    expect(cosineSimilarity("widget", "thermocouple", IDF, N)).toBe(0);
  });

  it("ignores stopword-only differences", () => {
    expect(
      cosineSimilarity("the widget spanner", "a widget spanner", IDF, N),
    ).toBeCloseTo(1);
  });

  it("is symmetric", () => {
    const a = cosineSimilarity("widget manual", "widget spanner", IDF, N);
    const b = cosineSimilarity("widget spanner", "widget manual", IDF, N);
    expect(a).toBeCloseTo(b);
  });

  it("is 0 when one side has no content terms", () => {
    expect(cosineSimilarity("the and of", "widget", IDF, N)).toBe(0);
  });
});

describe("triageCandidates", () => {
  const options = { lexicalThreshold: 0.5, duplicateThreshold: 0.9 };

  it("flags a question that lifts its source wording", () => {
    const [result] = triageCandidates(
      [
        {
          id: "q-1",
          question: "What reference standard calibrates the thermocouple?",
          sourceText: "Calibrate the thermocouple against a reference standard.",
        },
      ],
      IDF,
      N,
      options,
    );
    expect(result.flag).toBe("lexical");
    expect(result.detail).toContain("distinctive terms");
  });

  it("leaves a genuinely reworded question clean", () => {
    const [result] = triageCandidates(
      [
        {
          id: "q-1",
          question: "Which benchmark device verifies temperature probe accuracy?",
          sourceText: "Calibrate the thermocouple against a reference standard.",
        },
      ],
      IDF,
      N,
      options,
    );
    expect(result.flag).toBeNull();
  });

  it("flags the SECOND of two near-identical drafts, not the first", () => {
    const results = triageCandidates(
      [
        { id: "q-1", question: "How often is the widget spanner replaced?", sourceText: "" },
        { id: "q-2", question: "How often is the widget spanner replaced?", sourceText: "" },
      ],
      IDF,
      N,
      options,
    );
    expect(results[0].flag).toBeNull();
    expect(results[1].flag).toBe("duplicate");
    expect(results[1].detail).toContain("q-1");
  });

  it("flags a candidate duplicating an already-accepted question", () => {
    const results = triageCandidates(
      [{ id: "q-9", question: "How often is the widget spanner replaced?", sourceText: "" }],
      IDF,
      N,
      { ...options, accepted: [{ id: "q-old", question: "How often is the widget spanner replaced?" }] },
    );
    expect(results[0].flag).toBe("duplicate");
    expect(results[0].detail).toContain("q-old");
  });

  it("prefers the duplicate flag over the lexical one", () => {
    const results = triageCandidates(
      [
        {
          id: "q-1",
          question: "What reference standard calibrates the thermocouple?",
          sourceText: "Calibrate the thermocouple against a reference standard.",
        },
        {
          id: "q-2",
          question: "What reference standard calibrates the thermocouple?",
          sourceText: "Calibrate the thermocouple against a reference standard.",
        },
      ],
      IDF,
      N,
      options,
    );
    expect(results[0].flag).toBe("lexical");
    expect(results[1].flag).toBe("duplicate");
  });

  it("never flags an unanswerable question as lexical — it has no source", () => {
    const [result] = triageCandidates(
      [{ id: "q-1", question: "thermocouple reference standard calibrate", sourceText: "" }],
      IDF,
      N,
      options,
    );
    expect(result.flag).toBeNull();
    expect(result.lexicalOverlap).toBe(0);
  });

  it("respects a configurable threshold", () => {
    const question = "What reference standard calibrates the thermocouple?";
    const sourceText = "Calibrate the thermocouple against a reference standard.";
    const input = [{ id: "q-1", question, sourceText }];

    // Assert around the ACTUAL score rather than hard-coding one, so the test
    // checks the threshold contract instead of the tokeniser's current output.
    const score = lexicalOverlap(question, sourceText, IDF, N);
    expect(
      triageCandidates(input, IDF, N, { ...options, lexicalThreshold: score - 0.01 })[0].flag,
    ).toBe("lexical");
    expect(
      triageCandidates(input, IDF, N, { ...options, lexicalThreshold: score + 0.01 })[0].flag,
    ).toBeNull();
  });

  it("reports the nearest neighbour even when below threshold", () => {
    const results = triageCandidates(
      [
        { id: "q-1", question: "widget spanner replacement", sourceText: "" },
        { id: "q-2", question: "widget manual replacement", sourceText: "" },
      ],
      IDF,
      N,
      options,
    );
    expect(results[1].nearestId).toBe("q-1");
    expect(results[1].nearestSimilarity).toBeGreaterThan(0);
    expect(results[1].flag).toBeNull();
  });
});

describe("sortForReview", () => {
  it("puts clean candidates first and keeps order within each group", () => {
    const sorted = sortForReview([
      { id: "a", suspect: "lexical" as const },
      { id: "b", suspect: null },
      { id: "c", suspect: "duplicate" as const },
      { id: "d", suspect: null },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("does not mutate its input", () => {
    const input = [{ id: "a", suspect: "lexical" as const }, { id: "b", suspect: null }];
    sortForReview(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
