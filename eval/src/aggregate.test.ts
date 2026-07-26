import { describe, expect, it } from "vitest";

import { aggregate, flattenAggregate, percentile } from "./aggregate";
import type { Question, QuestionResult } from "./types";

function question(id: string, type: Question["type"]): Question {
  return {
    id,
    question: `q ${id}`,
    type,
    expectedAnswer: type === "unanswerable" ? null : "a",
    relevantChunkIds: type === "unanswerable" ? [] : ["c1"],
    relevantDocIds: type === "unanswerable" ? [] : ["d1"],
    sourcePages: [1],
    difficulty: "medium",
    paraphraseOf: null,
  };
}

function result(
  questionId: string,
  metrics: Record<string, number | null>,
  overrides: Partial<QuestionResult> = {},
): QuestionResult {
  return {
    questionId,
    retrieved: [],
    answer: "",
    citations: [],
    metrics,
    costUsd: 0,
    latency: { embedMs: 1, searchMs: 2, rerankMs: 0, generateMs: 3, totalMs: 6 },
    error: null,
    ...overrides,
  };
}

describe("percentile", () => {
  it("uses nearest-rank", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });

  it("returns 0 for no data rather than NaN", () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("aggregate", () => {
  const questions = [
    question("q1", "factoid"),
    question("q2", "factoid"),
    question("q3", "unanswerable"),
  ];

  it("averages retrieval over ANSWERABLE questions only", () => {
    // q3 is unanswerable — Phase 2 returns null for it. Averaging a 0 in would
    // make a correct refusal look like a retrieval failure.
    const agg = aggregate(
      [
        result("q1", { "recall@10": 1 }),
        result("q2", { "recall@10": 0 }),
        result("q3", { "recall@10": null }),
      ],
      questions,
    );
    expect(agg.retrieval["recall@10"]).toBe(0.5);
  });

  it("averages refusal over UNANSWERABLE questions only", () => {
    const agg = aggregate(
      [
        result("q1", { refusalAccuracy: null }),
        result("q2", { refusalAccuracy: null }),
        result("q3", { refusalAccuracy: 1 }),
      ],
      questions,
    );
    expect(agg.refusalAccuracy).toBe(1);
  });

  it("excludes errored questions from means and counts them", () => {
    // An errored question is missing data, not a zero score.
    const agg = aggregate(
      [
        result("q1", { "recall@10": 1 }),
        result("q2", {}, { error: "boom" }),
        result("q3", { refusalAccuracy: 1 }),
      ],
      questions,
    );
    expect(agg.errors).toBe(1);
    expect(agg.questions).toBe(3);
    expect(agg.retrieval["recall@10"]).toBe(1);
  });

  it("returns null, not 0, when a metric has no data at all", () => {
    const agg = aggregate([result("q3", { refusalAccuracy: 1 })], questions);
    expect(agg.faithfulness).toBeNull();
    expect(agg.correctness).toBeNull();
  });

  it("sums cost per stage and per question", () => {
    const agg = aggregate(
      [
        result("q1", {}, {
          costUsd: 0.03,
          cost: { embed: 0.01, rerank: 0, generate: 0.02, judge: 0, total: 0.03 },
        }),
        result("q2", {}, {
          costUsd: 0.01,
          cost: { embed: 0, rerank: 0.005, generate: 0, judge: 0.005, total: 0.01 },
        }),
      ],
      questions,
    );
    expect(agg.costUsd).toBeCloseTo(0.04);
    expect(agg.costPerQuestion).toBeCloseTo(0.02);
    expect(agg.cost.embed).toBeCloseTo(0.01);
    expect(agg.cost.rerank).toBeCloseTo(0.005);
  });

  it("does not treat judge keys as retrieval metrics", () => {
    const agg = aggregate(
      [result("q1", { "recall@10": 1, faithfulness: 0.5 })],
      questions,
    );
    expect(Object.keys(agg.retrieval)).toEqual(["recall@10"]);
    expect(agg.faithfulness).toBe(0.5);
  });
});

describe("flattenAggregate", () => {
  it("emits gate-readable keys", () => {
    const agg = aggregate(
      [result("q1", { "recall@10": 1, faithfulness: 0.9 })],
      [question("q1", "factoid")],
    );
    const flat = flattenAggregate(agg);
    expect(flat["recall@10"]).toBe(1);
    expect(flat.faithfulness).toBe(0.9);
    expect(flat["totalMs.p95"]).toBe(6);
    expect(flat).toHaveProperty("costPerQuery");
  });
});
