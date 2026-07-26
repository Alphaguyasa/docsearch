import { describe, expect, it } from "vitest";

import { assertCleanSplit, paraphraseFamilies } from "./goldenset";
import type { Question } from "./types";

function q(id: string, type: Question["type"], paraphraseOf: string | null = null): Question {
  return {
    id,
    question: `question ${id}`,
    type,
    expectedAnswer: type === "unanswerable" ? null : "answer",
    relevantChunkIds: type === "unanswerable" ? [] : ["chunk-1"],
    relevantDocIds: type === "unanswerable" ? [] : ["doc-1"],
    sourcePages: [1],
    difficulty: "medium",
    paraphraseOf,
  };
}

describe("paraphraseFamilies", () => {
  it("groups a paraphrase with its parent", () => {
    const families = paraphraseFamilies([
      q("f1", "factoid"),
      q("p1", "paraphrase", "f1"),
      q("f2", "factoid"),
    ]);
    expect(families.get("f1")?.map((x) => x.id)).toEqual(["f1", "p1"]);
    expect(families.get("f2")?.map((x) => x.id)).toEqual(["f2"]);
  });
});

describe("assertCleanSplit", () => {
  it("accepts a split where families stay together", () => {
    const dev = [q("f1", "factoid"), q("p1", "paraphrase", "f1")];
    const holdout = [q("f2", "factoid"), q("p2", "paraphrase", "f2")];
    expect(() => assertCleanSplit(dev, holdout)).not.toThrow();
  });

  it("rejects a paraphrase in holdout whose parent is in dev", () => {
    // The leak this guard exists for: tuning on the dev parent transfers
    // directly to its holdout twin, because they ask the same question.
    const dev = [q("f1", "factoid")];
    const holdout = [q("p1", "paraphrase", "f1")];
    expect(() => assertCleanSplit(dev, holdout)).toThrow(/LEAKAGE/);
  });

  it("rejects a paraphrase in dev whose parent is in holdout", () => {
    const dev = [q("p1", "paraphrase", "f1")];
    const holdout = [q("f1", "factoid")];
    expect(() => assertCleanSplit(dev, holdout)).toThrow(/LEAKAGE/);
  });

  it("rejects a parent missing from both halves", () => {
    const dev = [q("p1", "paraphrase", "gone")];
    expect(() => assertCleanSplit(dev, [])).toThrow(/neither split/);
  });

  it("rejects overlapping halves", () => {
    const shared = q("f1", "factoid");
    expect(() => assertCleanSplit([shared], [shared])).toThrow(/not disjoint/);
  });

  it("accepts an empty holdout", () => {
    expect(() => assertCleanSplit([q("f1", "factoid")], [])).not.toThrow();
  });
});
