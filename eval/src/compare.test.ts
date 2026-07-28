import { describe, expect, it } from "vitest";

import {
  buildSeries,
  classifyMetric,
  compareMetricNames,
  isResource,
  join,
  mean,
  metricExtractor,
  regressions,
  type RunLike,
  type Series,
} from "./compare";
import type { QuestionResult } from "./types";

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
    latency: { embedMs: 0, searchMs: 0, rerankMs: 0, generateMs: 0, totalMs: 100 },
    error: null,
    ...overrides,
  };
}

function run(...results: QuestionResult[]): RunLike {
  return { results };
}

function rateSeries(ids: string[], a: number[], b: number[]): Series {
  return { name: "m", kind: "rate", higherIsBetter: true, ids, a, b };
}

describe("classifyMetric", () => {
  it("treats dangling citations as a count where fewer is better", () => {
    expect(classifyMetric("danglingCitations")).toEqual({
      kind: "count",
      higherIsBetter: false,
    });
  });

  it("defaults to a rate where higher is better", () => {
    expect(classifyMetric("recall@10")).toEqual({ kind: "rate", higherIsBetter: true });
    expect(classifyMetric("somethingNew")).toEqual({
      kind: "rate",
      higherIsBetter: true,
    });
  });
});

describe("isResource", () => {
  it("separates spend from quality", () => {
    expect(isResource("usd")).toBe(true);
    expect(isResource("ms")).toBe(true);
    expect(isResource("rate")).toBe(false);
    expect(isResource("count")).toBe(false);
  });
});

describe("join", () => {
  const extract = metricExtractor("recall@10");

  it("pairs by question id, not by position", () => {
    // THE BUG THIS EXISTS TO CATCH. Same questions, opposite order. Pairing by
    // position would compare q1's score against q3's and report a difference
    // that never happened.
    const a = run(result("q1", { "recall@10": 1 }), result("q3", { "recall@10": 0 }));
    const b = run(result("q3", { "recall@10": 0 }), result("q1", { "recall@10": 1 }));

    const series = join("recall@10", "rate", true, a, b, extract);
    expect(series.ids).toEqual(["q1", "q3"]);
    expect(series.a).toEqual([1, 0]);
    expect(series.b).toEqual([1, 0]);
  });

  it("returns ids in sorted order regardless of input order", () => {
    const a = run(
      result("q9", { "recall@10": 1 }),
      result("q2", { "recall@10": 1 }),
      result("q5", { "recall@10": 1 }),
    );
    expect(join("recall@10", "rate", true, a, a, extract).ids).toEqual([
      "q2",
      "q5",
      "q9",
    ]);
  });

  it("keeps only questions present in both runs", () => {
    const a = run(result("q1", { "recall@10": 1 }), result("q2", { "recall@10": 1 }));
    const b = run(result("q2", { "recall@10": 0 }), result("q3", { "recall@10": 0 }));
    expect(join("recall@10", "rate", true, a, b, extract).ids).toEqual(["q2"]);
  });

  it("drops a question that errored in either run", () => {
    const a = run(
      result("q1", { "recall@10": 1 }),
      result("q2", {}, { error: "quota exhausted" }),
      result("q3", { "recall@10": 1 }),
    );
    const b = run(
      result("q1", { "recall@10": 0 }),
      result("q2", { "recall@10": 0 }),
      result("q3", {}, { error: "boom" }),
    );
    expect(join("recall@10", "rate", true, a, b, extract).ids).toEqual(["q1"]);
  });

  it("drops a question whose metric is null in either run", () => {
    // Retrieval metrics are null for unanswerable questions by design.
    const a = run(result("q1", { "recall@10": null }), result("q2", { "recall@10": 1 }));
    const b = run(result("q1", { "recall@10": 1 }), result("q2", { "recall@10": 1 }));
    expect(join("recall@10", "rate", true, a, b, extract).ids).toEqual(["q2"]);
  });

  it("drops a question missing the metric entirely", () => {
    const a = run(result("q1", {}), result("q2", { "recall@10": 1 }));
    const b = run(result("q1", { "recall@10": 1 }), result("q2", { "recall@10": 1 }));
    expect(join("recall@10", "rate", true, a, b, extract).ids).toEqual(["q2"]);
  });

  it("drops non-finite values rather than propagating NaN", () => {
    const a = run(result("q1", { "recall@10": NaN }), result("q2", { "recall@10": 1 }));
    const b = run(result("q1", { "recall@10": 1 }), result("q2", { "recall@10": 1 }));
    expect(join("recall@10", "rate", true, a, b, extract).ids).toEqual(["q2"]);
  });

  it("produces empty vectors when nothing is shared", () => {
    const a = run(result("q1", { "recall@10": 1 }));
    const b = run(result("q2", { "recall@10": 1 }));
    const series = join("recall@10", "rate", true, a, b, extract);
    expect(series.ids).toEqual([]);
    expect(series.a).toEqual([]);
  });

  it("carries the kind and direction it was given", () => {
    const a = run(result("q1", { x: 1 }));
    const series = join("x", "count", false, a, a, metricExtractor("x"));
    expect(series.kind).toBe("count");
    expect(series.higherIsBetter).toBe(false);
  });
});

describe("buildSeries", () => {
  it("takes the union of metric keys across both runs", () => {
    const a = run(result("q1", { "recall@10": 1, onlyInA: 1 }));
    const b = run(result("q1", { "recall@10": 0, onlyInB: 0 }));
    const names = buildSeries(a, b).map((s) => s.name);
    // Union collected, then the unpairable ones filtered out — so neither
    // vanishes silently before anyone can see it was never compared.
    expect(names).toContain("recall@10");
    expect(names).not.toContain("onlyInA");
    expect(names).not.toContain("onlyInB");
  });

  it("ignores metric keys contributed only by errored results", () => {
    const a = run(result("q1", { ghost: 1 }, { error: "boom" }), result("q2", { r: 1 }));
    const b = run(result("q1", { ghost: 1 }), result("q2", { r: 1 }));
    expect(buildSeries(a, b).map((s) => s.name)).not.toContain("ghost");
  });

  it("always appends cost and latency", () => {
    const a = run(result("q1", { r: 1 }));
    const names = buildSeries(a, a).map((s) => s.name);
    expect(names).toContain("costUsd");
    expect(names).toContain("totalMs");
  });

  it("orders quality, then counts, then cost and latency", () => {
    const a = run(result("q1", { "recall@10": 1, danglingCitations: 0 }));
    expect(buildSeries(a, a).map((s) => s.name)).toEqual([
      "recall@10",
      "danglingCitations",
      "costUsd",
      "totalMs",
    ]);
  });

  it("keeps metric families in k order within a group", () => {
    const metrics = { "recall@10": 1, "recall@1": 1, "recall@5": 1, mrr: 1 };
    const a = run(result("q1", metrics));
    expect(buildSeries(a, a).map((s) => s.name)).toEqual([
      "mrr",
      "recall@1",
      "recall@5",
      "recall@10",
      "costUsd",
      "totalMs",
    ]);
  });

  it("returns nothing when the runs share no questions", () => {
    expect(buildSeries(run(result("q1", { r: 1 })), run(result("q2", { r: 1 })))).toEqual(
      [],
    );
  });
});

describe("compareMetricNames", () => {
  it("sorts by k numerically, not lexically", () => {
    expect(["recall@10", "recall@1", "recall@5"].sort(compareMetricNames)).toEqual([
      "recall@1",
      "recall@5",
      "recall@10",
    ]);
  });

  it("groups families alphabetically", () => {
    expect(["recall@1", "mrr@1", "ndcg@1"].sort(compareMetricNames)).toEqual([
      "mrr@1",
      "ndcg@1",
      "recall@1",
    ]);
  });

  it("handles names with no @ and names whose suffix is not a number", () => {
    expect(["mrr", "faithfulness", "weird@x"].sort(compareMetricNames)).toEqual([
      "faithfulness",
      "mrr",
      "weird@x",
    ]);
  });
});

describe("regressions", () => {
  it("lists only questions where B is worse, worst first", () => {
    const series = rateSeries(["q1", "q2", "q3", "q4"], [1, 1, 0.5, 0], [1, 0, 0.1, 1]);
    expect(regressions(series).map((d) => d.id)).toEqual(["q2", "q3"]);
    expect(regressions(series)[0].delta).toBe(-1);
    expect(regressions(series)[1].delta).toBeCloseTo(-0.4, 10);
  });

  it("inverts the direction for lower-is-better metrics", () => {
    // More dangling citations is worse, so a positive delta is the regression.
    const series: Series = {
      name: "danglingCitations",
      kind: "count",
      higherIsBetter: false,
      ids: ["q1", "q2", "q3"],
      a: [0, 2, 1],
      b: [3, 0, 1],
    };
    expect(regressions(series).map((d) => d.id)).toEqual(["q1"]);
    expect(regressions(series)[0].delta).toBe(3);
  });

  it("is empty when nothing got worse", () => {
    expect(regressions(rateSeries(["q1", "q2"], [0, 0.5], [1, 0.5]))).toEqual([]);
  });

  it("reports both arms' values alongside the delta", () => {
    const [worst] = regressions(rateSeries(["q1"], [1], [0.25]));
    expect(worst).toEqual({ id: "q1", a: 1, b: 0.25, delta: -0.75 });
  });
});

describe("mean", () => {
  it("averages", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("is NaN for no data rather than 0", () => {
    // 0 would be indistinguishable from a real mean of zero.
    expect(mean([])).toBeNaN();
  });
});
