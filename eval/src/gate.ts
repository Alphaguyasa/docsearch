/**
 * Regression gate — Phase 7 of docs/EVAL_HARNESS.md.
 *
 * Decides whether a run may land, by comparing it against a baseline run on a
 * short list of guarded metrics. Pure logic: no I/O, no network, no process
 * exit. The runner supplies two runs and acts on the verdict.
 *
 * THE RULE THAT MAKES THIS USABLE. A metric is only a regression when the drop
 * clears its threshold AND the paired 95% confidence interval excludes zero. A
 * raw drop inside the noise band must not fail a build — at n=63 answerable
 * questions the interval on a single arm's recall is ±12pp, so a gate that
 * fired on point estimates alone would fail on identical pipelines about as
 * often as on broken ones, and would be switched off within a week. The spec
 * says this explicitly and it is the whole design.
 *
 * QUALITY METRICS AND RESOURCE METRICS ARE GATED DIFFERENTLY, because they are
 * different kinds of number:
 *
 *   quality  (recall@10, faithfulness, …) — per-question values that pair on
 *            question id. Bootstrapped, CI-gated, threshold in absolute points.
 *   resource (p95TotalMs, costPerQuery)  — aggregates over the whole run. A
 *            95th percentile is not a per-question quantity and cannot be
 *            paired, so these compare aggregate to aggregate with a RELATIVE
 *            threshold and carry no CI.
 *
 * That asymmetry is not a shortcut, and the latency half comes with a caveat
 * this project has already been burnt by: two runs retrieving byte-identical
 * chunks showed a 39-SECOND mean latency difference purely because one ran cold
 * and the other replayed from cache. A latency gate compares the runs as
 * EXECUTED. See `cacheStateWarning`.
 */
import { join, metricExtractor, type RunLike, type Series } from "./compare";
import { pairedBootstrap } from "./metrics/stats";

/** Threshold table, as read from eval/config/gate.json. */
export interface GateConfig {
  /**
   * Absolute drop tolerated before a quality metric fails, as a positive
   * number: 0.03 means "fail if it falls more than 3 points".
   */
  quality: Record<string, number>;
  /**
   * Relative rise tolerated before a resource metric fails: 0.25 means "fail if
   * it grows more than 25%".
   */
  resource: Record<string, number>;
  /** Bootstrap resamples and seed, so a gate verdict is reproducible. */
  iters?: number;
  seed?: number;
}

/** Defaults from docs/EVAL_HARNESS.md, Phase 7. */
export const DEFAULT_GATE: GateConfig = {
  quality: {
    "recall@10": 0.03,
    faithfulness: 0.05,
    citationAccuracy: 0.05,
    refusalAccuracy: 0.05,
  },
  resource: {
    // SPEC SAYS `p95TotalMs`; the harness's aggregate emits `totalMs.p95`
    // (flattenAggregate in aggregate.ts, which derives the key from the stage
    // name). Using the spec's spelling would have gated on a metric that does
    // not exist — reported as "missing" and silently guarding nothing, which is
    // the failure mode a gate can least afford. The real key is used here and
    // the deviation is recorded rather than renaming a field the whole harness
    // already writes.
    "totalMs.p95": 0.25,
    costPerQuery: 0.2,
  },
  iters: 10000,
  seed: 42,
};

export interface GateFinding {
  metric: string;
  kind: "quality" | "resource";
  /** Baseline value, then this run's. */
  before: number;
  after: number;
  /** after - before for quality; (after - before) / before for resource. */
  delta: number;
  threshold: number;
  /** Absent for resource metrics, which have no paired interval. */
  ci?: { lo: number; hi: number; pValue: number };
  n: number;
  failed: boolean;
  /** Why it did not fail, when it dropped past the threshold anyway. */
  note?: string;
}

export interface GateVerdict {
  passed: boolean;
  findings: GateFinding[];
  /** Metrics named in the config that neither run measured. */
  missing: string[];
  /** Cache-state mismatch, when latency or cost is being gated. See below. */
  warning?: string;
}

/** Mean of the values that are not null. */
function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * A resource comparison is only meaningful between runs with matched cache
 * state, and the harness cannot know that from the numbers alone.
 *
 * MEASURED, not hypothetical: an earlier round of this project put searchTop
 * 40 -> 80 at +461ms and a later round at +142ms, same configs, same corpus,
 * same questions. A cold run against a cached one is a much larger gap still.
 * Gating a build on that would fail an innocent change and pass a slow one,
 * depending only on which run happened to warm the cache.
 */
export function cacheStateWarning(
  config: GateConfig,
  baselineCacheHitRate: number | undefined,
  runCacheHitRate: number | undefined,
): string | undefined {
  if (Object.keys(config.resource).length === 0) return undefined;
  if (baselineCacheHitRate === undefined || runCacheHitRate === undefined) {
    return (
      "Gating latency/cost without knowing either run's cache state. These " +
      "compare the runs AS EXECUTED: a cold run against a cached one differs " +
      "enormously while doing identical work."
    );
  }
  if (Math.abs(baselineCacheHitRate - runCacheHitRate) > 0.2) {
    return (
      `Cache hit rates differ sharply (${(baselineCacheHitRate * 100).toFixed(0)}% ` +
      `vs ${(runCacheHitRate * 100).toFixed(0)}%). Latency and cost deltas below ` +
      `describe that difference at least as much as any code change.`
    );
  }
  return undefined;
}

/**
 * Evaluate one quality metric.
 *
 * `run` is the candidate and `baseline` is what it must not regress against, so
 * `meanDiff` reads as after-minus-before and a negative number is a drop.
 */
export function gateQualityMetric(
  metric: string,
  threshold: number,
  baseline: RunLike,
  run: RunLike,
  iters: number,
  seed: number,
): GateFinding | null {
  const series: Series = join(
    metric,
    "rate",
    true,
    run,
    baseline,
    metricExtractor(metric),
  );
  if (series.ids.length === 0) return null;

  const after = mean(series.a);
  const before = mean(series.b);
  const delta = after - before;

  const paired = pairedBootstrap(series.a, series.b, iters, {
    seed,
    idsA: series.ids,
    idsB: series.ids,
  });

  // BOTH conditions, and the CI is the one that stops false alarms. A drop
  // bigger than the threshold whose interval straddles zero is a run that
  // might be worse and might be noise; failing a build on it teaches everyone
  // to pass --no-gate.
  const excludesZero = paired.lo > 0 || paired.hi < 0;
  const past = delta < -threshold;
  const failed = past && excludesZero;

  return {
    metric,
    kind: "quality",
    before,
    after,
    delta,
    threshold,
    ci: { lo: paired.lo, hi: paired.hi, pValue: paired.pValue },
    n: paired.n,
    failed,
    note:
      past && !excludesZero
        ? "dropped past the threshold, but the 95% CI includes zero — noise, not a regression"
        : undefined,
  };
}

/** Evaluate one resource metric from the two runs' aggregates. */
export function gateResourceMetric(
  metric: string,
  threshold: number,
  baselineAggregate: Record<string, number>,
  runAggregate: Record<string, number>,
): GateFinding | null {
  const before = baselineAggregate[metric];
  const after = runAggregate[metric];
  if (typeof before !== "number" || typeof after !== "number") return null;

  // A baseline of zero has no meaningful percentage growth. $0.00 per query on
  // a fully cached run is the normal case in this project, not an edge case.
  if (before === 0) {
    return {
      metric,
      kind: "resource",
      before,
      after,
      delta: after === 0 ? 0 : Infinity,
      threshold,
      n: 0,
      failed: false,
      note:
        after === 0
          ? "both zero"
          : "baseline is zero, so relative growth is undefined — not gated",
    };
  }

  const delta = (after - before) / before;
  return {
    metric,
    kind: "resource",
    before,
    after,
    delta,
    threshold,
    n: 0,
    failed: delta > threshold,
  };
}

export interface GateInput {
  baseline: RunLike & { aggregate?: Record<string, number> };
  run: RunLike & { aggregate?: Record<string, number> };
  config: GateConfig;
  baselineCacheHitRate?: number;
  runCacheHitRate?: number;
}

/** Run every guarded metric and decide whether the run may land. */
export function evaluateGate(input: GateInput): GateVerdict {
  const { baseline, run, config } = input;
  const iters = config.iters ?? DEFAULT_GATE.iters!;
  const seed = config.seed ?? DEFAULT_GATE.seed!;

  const findings: GateFinding[] = [];
  const missing: string[] = [];

  for (const [metric, threshold] of Object.entries(config.quality)) {
    const finding = gateQualityMetric(metric, threshold, baseline, run, iters, seed);
    if (finding) findings.push(finding);
    else missing.push(metric);
  }

  for (const [metric, threshold] of Object.entries(config.resource)) {
    const finding = gateResourceMetric(
      metric,
      threshold,
      baseline.aggregate ?? {},
      run.aggregate ?? {},
    );
    if (finding) findings.push(finding);
    else missing.push(metric);
  }

  return {
    passed: findings.every((f) => !f.failed),
    findings,
    missing,
    warning: cacheStateWarning(config, input.baselineCacheHitRate, input.runCacheHitRate),
  };
}

/**
 * The questions a regressed metric got worse on, worst first.
 *
 * A gate that only says "recall@10 fell 6 points" tells you the build is red.
 * These tell you where to look, which is the difference between a gate people
 * fix and a gate people disable.
 */
export function worstRegressions(
  metric: string,
  baseline: RunLike,
  run: RunLike,
  limit = 5,
): { questionId: string; before: number; after: number; delta: number }[] {
  const series = join(metric, "rate", true, run, baseline, metricExtractor(metric));
  return series.ids
    .map((questionId, i) => ({
      questionId,
      after: series.a[i],
      before: series.b[i],
      delta: series.a[i] - series.b[i],
    }))
    .filter((d) => d.delta < 0)
    .sort((x, y) => x.delta - y.delta)
    .slice(0, limit);
}
