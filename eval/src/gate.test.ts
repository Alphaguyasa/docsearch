import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  cacheStateWarning,
  DEFAULT_GATE,
  evaluateGate,
  gateQualityMetric,
  gateResourceMetric,
  worstRegressions,
  type GateConfig,
} from "./gate";
import type { QuestionResult } from "./types";

function result(id: string, metrics: Record<string, number | null>): QuestionResult {
  return {
    questionId: id,
    retrieved: [],
    answer: "",
    citations: [],
    metrics,
    costUsd: 0,
    latency: { embedMs: 0, searchMs: 0, rerankMs: 0, generateMs: 0, totalMs: 0 },
    error: null,
  };
}

/** n results whose metric value is `value`, ids q-000..q-0nn. */
function run(metric: string, values: number[]) {
  return {
    results: values.map((v, i) => result(`q-${String(i).padStart(4, "0")}`, { [metric]: v })),
  };
}

const ITERS = 2000;

describe("gateQualityMetric", () => {
  it("passes when the runs are identical", () => {
    const values = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0];
    const f = gateQualityMetric("recall@10", 0.03, run("recall@10", values), run("recall@10", values), ITERS, 42)!;
    expect(f.delta).toBe(0);
    expect(f.failed).toBe(false);
  });

  /**
   * THE CENTRAL RULE. A consistent, large drop on every question is a real
   * regression: the interval on the differences excludes zero because every
   * difference has the same sign.
   */
  it("fails on a consistent drop past the threshold", () => {
    const baseline = run("recall@10", Array.from({ length: 40 }, () => 0.9));
    const candidate = run("recall@10", Array.from({ length: 40 }, () => 0.5));
    const f = gateQualityMetric("recall@10", 0.03, baseline, candidate, ITERS, 42)!;
    expect(f.delta).toBeCloseTo(-0.4, 5);
    expect(f.ci!.hi).toBeLessThan(0);
    expect(f.failed).toBe(true);
  });

  /**
   * AND THE RULE'S POINT. The same mean drop, but scattered — some questions up,
   * more down — leaves an interval straddling zero. That is a build that must
   * stay green, because at this sample size the harness cannot tell it from
   * noise, and a gate that cries wolf gets switched off.
   */
  it("does NOT fail on a drop whose CI includes zero", () => {
    const n = 30;
    const baseline = run("recall@10", Array.from({ length: n }, () => 0.5));
    // Five questions get worse, two get better, the rest are unchanged. The
    // mean falls 5 points — past the 3-point threshold — but the per-question
    // differences do not agree in sign, so the interval straddles zero.
    const candidate = run(
      "recall@10",
      Array.from({ length: n }, (_, i) => (i < 5 ? 0 : i < 7 ? 1 : 0.5)),
    );
    const f = gateQualityMetric("recall@10", 0.03, baseline, candidate, ITERS, 42)!;
    expect(f.delta).toBeLessThan(0);
    expect(f.ci!.lo).toBeLessThanOrEqual(0);
    expect(f.ci!.hi).toBeGreaterThanOrEqual(0);
    expect(f.failed).toBe(false);
    expect(f.note).toMatch(/includes zero/);
  });

  it("does not fail an improvement, however large", () => {
    const baseline = run("recall@10", Array.from({ length: 20 }, () => 0.2));
    const candidate = run("recall@10", Array.from({ length: 20 }, () => 0.95));
    const f = gateQualityMetric("recall@10", 0.03, baseline, candidate, ITERS, 42)!;
    expect(f.delta).toBeGreaterThan(0);
    expect(f.failed).toBe(false);
  });

  it("returns null when neither run measured the metric", () => {
    expect(
      gateQualityMetric("nope", 0.03, run("recall@10", [1]), run("recall@10", [1]), ITERS, 42),
    ).toBeNull();
  });

  /** Unanswerable questions carry null retrieval metrics; they must not count. */
  it("skips questions where either side is null", () => {
    const baseline = { results: [result("q-1", { "recall@10": 1 }), result("q-2", { "recall@10": null })] };
    const candidate = { results: [result("q-1", { "recall@10": 1 }), result("q-2", { "recall@10": null })] };
    const f = gateQualityMetric("recall@10", 0.03, baseline, candidate, ITERS, 42)!;
    expect(f.n).toBe(1);
  });
});

describe("gateResourceMetric", () => {
  it("fails when growth exceeds the relative threshold", () => {
    const f = gateResourceMetric("p95TotalMs", 0.25, { p95TotalMs: 1000 }, { p95TotalMs: 1400 })!;
    expect(f.delta).toBeCloseTo(0.4, 5);
    expect(f.failed).toBe(true);
  });

  it("passes growth inside the threshold", () => {
    const f = gateResourceMetric("p95TotalMs", 0.25, { p95TotalMs: 1000 }, { p95TotalMs: 1200 })!;
    expect(f.failed).toBe(false);
  });

  it("never fails on an improvement", () => {
    const f = gateResourceMetric("p95TotalMs", 0.25, { p95TotalMs: 1000 }, { p95TotalMs: 10 })!;
    expect(f.failed).toBe(false);
  });

  /**
   * $0.00 per query is the NORMAL case here — every run in this project after
   * the first is fully cached — so "percentage growth from zero" is not an edge
   * case to shrug at. Dividing by it yields Infinity and fails every build.
   */
  it("does not fail when the baseline is zero", () => {
    expect(gateResourceMetric("costPerQuery", 0.2, { costPerQuery: 0 }, { costPerQuery: 0 })!.failed).toBe(false);
    const grew = gateResourceMetric("costPerQuery", 0.2, { costPerQuery: 0 }, { costPerQuery: 0.01 })!;
    expect(grew.failed).toBe(false);
    expect(grew.note).toMatch(/undefined/);
  });

  it("returns null when the aggregate lacks the metric", () => {
    expect(gateResourceMetric("p95TotalMs", 0.25, {}, {})).toBeNull();
  });
});

describe("cacheStateWarning", () => {
  const config: GateConfig = { quality: {}, resource: { p95TotalMs: 0.25 } };

  it("warns when cache state is unknown", () => {
    expect(cacheStateWarning(config, undefined, undefined)).toMatch(/AS EXECUTED/);
  });

  it("warns when hit rates diverge sharply", () => {
    expect(cacheStateWarning(config, 0.1, 0.95)).toMatch(/differ sharply/);
  });

  it("is silent when they match", () => {
    expect(cacheStateWarning(config, 0.9, 0.95)).toBeUndefined();
  });

  it("is silent when no resource metric is gated", () => {
    expect(cacheStateWarning({ quality: { "recall@10": 0.03 }, resource: {} }, 0.1, 0.9)).toBeUndefined();
  });
});

describe("evaluateGate", () => {
  it("passes a run identical to its baseline", () => {
    const values = Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? 1 : 0));
    const both = { ...run("recall@10", values), aggregate: { p95TotalMs: 900, costPerQuery: 0 } };
    const verdict = evaluateGate({
      baseline: both,
      run: both,
      config: { ...DEFAULT_GATE, iters: ITERS },
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.findings.some((f) => f.failed)).toBe(false);
  });

  it("reports metrics the runs never measured rather than passing silently", () => {
    const values = [1, 1, 0, 0];
    const verdict = evaluateGate({
      baseline: run("recall@10", values),
      run: run("recall@10", values),
      config: { quality: { "recall@10": 0.03, faithfulness: 0.05 }, resource: {}, iters: ITERS },
    });
    expect(verdict.missing).toContain("faithfulness");
  });

  it("fails the whole verdict when any single metric fails", () => {
    const baseline = { ...run("recall@10", Array.from({ length: 30 }, () => 1)), aggregate: {} };
    const candidate = { ...run("recall@10", Array.from({ length: 30 }, () => 0)), aggregate: {} };
    const verdict = evaluateGate({
      baseline,
      run: candidate,
      config: { quality: { "recall@10": 0.03 }, resource: {}, iters: ITERS },
    });
    expect(verdict.passed).toBe(false);
  });
});

describe("worstRegressions", () => {
  it("lists the biggest drops first and ignores improvements", () => {
    const baseline = {
      results: [
        result("q-a", { "recall@10": 1 }),
        result("q-b", { "recall@10": 1 }),
        result("q-c", { "recall@10": 0 }),
      ],
    };
    const candidate = {
      results: [
        result("q-a", { "recall@10": 0.2 }),
        result("q-b", { "recall@10": 0.9 }),
        result("q-c", { "recall@10": 1 }),
      ],
    };
    const worst = worstRegressions("recall@10", baseline, candidate);
    expect(worst.map((w) => w.questionId)).toEqual(["q-a", "q-b"]);
    expect(worst[0].delta).toBeCloseTo(-0.8, 5);
  });
});

/**
 * The shipped threshold tables, checked as data.
 *
 * gate.ci.json exists because latency cannot be gated on a hosted runner — a
 * cold, rate-limited CI run against a warm committed baseline reported +2140%
 * on totalMs.p95 while every quality metric was identical. The risk of keeping
 * a second table is that it drifts from the first and quietly stops guarding a
 * metric someone thinks is covered, so the two are compared here rather than
 * trusted.
 */
describe("shipped gate configs", () => {
  const load = (p: string): GateConfig =>
    JSON.parse(readFileSync(p, "utf8")) as GateConfig;

  const local = load("eval/config/gate.json");
  const ci = load("eval/config/gate.ci.json");

  it("gates the same quality metrics locally and in CI", () => {
    expect(Object.keys(ci.quality).sort()).toEqual(Object.keys(local.quality).sort());
  });

  it("uses identical quality thresholds, so CI is not the lenient one", () => {
    expect(ci.quality).toEqual(local.quality);
  });

  it("gates no resource metric in CI, and at least one locally", () => {
    expect(Object.keys(ci.resource)).toHaveLength(0);
    expect(Object.keys(local.resource).length).toBeGreaterThan(0);
  });

  it("keeps the bootstrap reproducible in both", () => {
    expect(ci.seed).toBe(local.seed);
    expect(ci.iters).toBe(local.iters);
  });

  it("gates correctness — the only judge Phase 3 validated", () => {
    expect(ci.quality).toHaveProperty("correctness");
  });
});
