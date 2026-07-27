/**
 * Pairing two runs for comparison. PURE FUNCTIONS — no I/O, no network.
 *
 * Split out of scripts/compare-runs.ts so it can be tested. This is the code
 * that decides WHICH numbers reach the statistics, and a bug here does not
 * throw — it quietly compares the wrong pairs and produces a table that looks
 * exactly like a correct one. Two failure modes worth naming:
 *
 *   - Pairing by position instead of by question id. Any run that skipped a
 *     question, or wrote results in a different order, silently compares
 *     question 14 in one run against question 15 in the other.
 *   - Pairing a real score against a missing one. An errored question has no
 *     score, and treating it as 0 manufactures a difference the run never
 *     measured.
 *
 * The script keeps the I/O and the formatting; everything that shapes the data
 * lives here.
 */
import type { QuestionResult } from "./types";

/** Units, which decide both formatting and which direction is an improvement. */
export type SeriesKind = "rate" | "count" | "usd" | "ms";

/**
 * How to read a metric.
 *
 * NOT every entry in `metrics` is a rate in [0,1] where higher is better, and
 * assuming so is silently wrong in two ways at once. `danglingCitations` is a
 * COUNT of citations pointing at chunks that were never retrieved (pipeline.ts
 * increments it), so rendering it as a percentage is meaningless and — worse —
 * treating higher as better puts a run that fabricated MORE citations at the
 * top of the improvements list and hides it from the regression list entirely.
 *
 * Anything unlisted defaults to a rate where higher is better, which is right
 * for every retrieval and judge metric currently defined. A new metric that
 * breaks that assumption belongs here.
 */
export const METRIC_KINDS: Record<
  string,
  { kind: SeriesKind; higherIsBetter: boolean }
> = {
  danglingCitations: { kind: "count", higherIsBetter: false },
};

export function classifyMetric(name: string): {
  kind: SeriesKind;
  higherIsBetter: boolean;
} {
  return METRIC_KINDS[name] ?? { kind: "rate", higherIsBetter: true };
}

/** Quality metrics first, then counts, then the cost/latency block. */
export const KIND_ORDER: Record<SeriesKind, number> = {
  rate: 0,
  count: 1,
  usd: 2,
  ms: 3,
};

/** Cost and latency are spend, not quality — read in the opposite direction. */
export function isResource(kind: SeriesKind): boolean {
  return kind === "usd" || kind === "ms";
}

/** One metric, paired across two runs and aligned by question id. */
export interface Series {
  name: string;
  kind: SeriesKind;
  higherIsBetter: boolean;
  /** Question ids, sorted. Position i in `a` and `b` is this question. */
  ids: string[];
  a: number[];
  b: number[];
}

/** Pull one comparable number per result, or null when it does not apply. */
export type Extractor = (r: QuestionResult) => number | null;

export function metricExtractor(key: string): Extractor {
  return (r) => {
    const v = r.metrics?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
}

/** Only what pairing needs, so tests do not have to build a whole run record. */
export interface RunLike {
  results: QuestionResult[];
}

/**
 * Inner-join two runs on questionId for one extracted value.
 *
 * Excludes any question that errored in EITHER run, and any where the value is
 * null in either. Both exclusions follow the same rule the aggregates use: a
 * failed or inapplicable question is missing data, not a zero. Retrieval
 * metrics are null for unanswerable questions by design (see metrics/
 * retrieval.ts), which is why n differs per metric and why the table prints it.
 *
 * Ids are sorted so the join order — and therefore the seeded resampling — does
 * not depend on file order or on what the database happened to return first.
 */
export function join(
  name: string,
  kind: SeriesKind,
  higherIsBetter: boolean,
  runA: RunLike,
  runB: RunLike,
  extract: Extractor,
): Series {
  const mapA = new Map(runA.results.map((r) => [r.questionId, r]));
  const mapB = new Map(runB.results.map((r) => [r.questionId, r]));

  const ids: string[] = [];
  const a: number[] = [];
  const b: number[] = [];

  for (const id of [...mapA.keys()].sort()) {
    const ra = mapA.get(id)!;
    const rb = mapB.get(id);
    if (!rb || ra.error !== null || rb.error !== null) continue;

    const va = extract(ra);
    const vb = extract(rb);
    if (va === null || vb === null) continue;

    ids.push(id);
    a.push(va);
    b.push(vb);
  }

  return { name, kind, higherIsBetter, ids, a, b };
}

/** recall@1 before recall@10, and metric families kept together. */
export function compareMetricNames(x: string, y: string): number {
  const split = (s: string): [string, number] => {
    const at = s.lastIndexOf("@");
    if (at === -1) return [s, -1];
    const k = Number(s.slice(at + 1));
    return Number.isFinite(k) ? [s.slice(0, at), k] : [s, -1];
  };
  const [bx, kx] = split(x);
  const [by, ky] = split(y);
  return bx === by ? kx - ky : bx.localeCompare(by);
}

/**
 * Every comparable series across the two runs.
 *
 * The metric key set is the UNION across both runs, not the intersection, so a
 * variant that introduces a metric the other lacks still appears — it simply
 * pairs on nothing and gets filtered out, rather than vanishing without a
 * trace before anyone notices it was never compared.
 */
export function buildSeries(runA: RunLike, runB: RunLike): Series[] {
  const keys = new Set<string>();
  for (const run of [runA, runB]) {
    for (const r of run.results) {
      if (r.error !== null) continue;
      for (const key of Object.keys(r.metrics ?? {})) keys.add(key);
    }
  }

  const series = [...keys].sort(compareMetricNames).map((key) => {
    const { kind, higherIsBetter } = classifyMetric(key);
    return join(key, kind, higherIsBetter, runA, runB, metricExtractor(key));
  });

  // Cost and latency are paired the same way and belong in the same analysis:
  // most Phase 6 experiments buy quality with one or both, and "slower, within
  // noise on quality" is a conclusion the harness should be able to state.
  series.push(
    join("costUsd", "usd", false, runA, runB, (r) =>
      Number.isFinite(r.costUsd) ? r.costUsd : null,
    ),
    join("totalMs", "ms", false, runA, runB, (r) =>
      Number.isFinite(r.latency?.totalMs) ? r.latency.totalMs : null,
    ),
  );

  // Group by kind so the table reads top to bottom as quality, then counts,
  // then the cost/latency block. Sort is stable, so names keep their order
  // within a group.
  return series
    .filter((s) => s.ids.length > 0)
    .sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);
}

export interface QuestionDelta {
  id: string;
  a: number;
  b: number;
  delta: number;
}

/**
 * Per-question rows where B is worse than A, worst first.
 *
 * "Worse" follows the metric's direction: lower correctness is worse, and so
 * is higher cost. This is the debugging workflow — the point is to land on the
 * specific questions a change broke, not to admire the aggregate.
 */
export function regressions(series: Series): QuestionDelta[] {
  return series.ids
    .map((id, i) => ({
      id,
      a: series.a[i],
      b: series.b[i],
      delta: series.b[i] - series.a[i],
    }))
    .filter((d) => (series.higherIsBetter ? d.delta < 0 : d.delta > 0))
    .sort((x, y) => (series.higherIsBetter ? x.delta - y.delta : y.delta - x.delta));
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
