/**
 * Run-level aggregates. PURE FUNCTIONS — no I/O.
 *
 * The rules that matter, all from docs/EVAL_HARNESS.md Phase 4:
 *   - retrieval metrics average over ANSWERABLE questions only. Phase 2 returns
 *     null for unanswerable rather than 0 precisely so they can be skipped here;
 *     averaging a 0 in would make a system that correctly refuses look like a
 *     system that failed to retrieve.
 *   - refusal accuracy averages over UNANSWERABLE only, for the mirror reason.
 *   - errored questions are excluded from every mean and counted separately. A
 *     failed question is missing data, not a zero score.
 */
import { meanIgnoringNull } from "./metrics/retrieval";
import type { Question, QuestionResult } from "./types";

export interface Aggregate {
  questions: number;
  errors: number;
  /**
   * Questions that scored, but from only one of hybrid retrieval's two sources.
   *
   * Counted separately from errors because they are not errors — they produced
   * results and entered every mean above. A nonzero value means the run's
   * numbers describe a partly-degraded system and are not comparable to a clean
   * run of the same variant.
   */
  degraded: number;
  /** Mean of each retrieval metric over answerable, non-errored questions. */
  retrieval: Record<string, number | null>;
  faithfulness: number | null;
  correctness: number | null;
  citationAccuracy: number | null;
  /** Over unanswerable questions only. */
  refusalAccuracy: number | null;
  costUsd: number;
  costPerQuestion: number;
  cost: { embed: number; rerank: number; generate: number; judge: number };
  latency: Record<string, { p50: number; p95: number }>;
}

/** Percentile by nearest-rank. Empty input is 0 — there is no latency to report. */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/** Metric keys that are judge scores rather than retrieval scores. */
const JUDGE_KEYS = new Set([
  "faithfulness",
  "correctness",
  "citationAccuracy",
  "refusalAccuracy",
]);

export function aggregate(
  results: QuestionResult[],
  questions: Question[],
): Aggregate {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ok = results.filter((r) => r.error === null);

  const isUnanswerable = (r: QuestionResult): boolean =>
    byId.get(r.questionId)?.type === "unanswerable";

  const answerable = ok.filter((r) => !isUnanswerable(r));
  const unanswerable = ok.filter(isUnanswerable);

  // Every retrieval metric key seen anywhere, so a variant that adds one does
  // not silently vanish from the report.
  const retrievalKeys = new Set<string>();
  for (const r of ok) {
    for (const key of Object.keys(r.metrics)) {
      if (!JUDGE_KEYS.has(key)) retrievalKeys.add(key);
    }
  }

  const retrieval: Record<string, number | null> = {};
  for (const key of [...retrievalKeys].sort()) {
    retrieval[key] = meanIgnoringNull(answerable.map((r) => r.metrics[key] ?? null));
  }

  const judgeMean = (key: string, pool: QuestionResult[]): number | null =>
    meanIgnoringNull(pool.map((r) => r.metrics[key] ?? null));

  const latencyKeys = ["embedMs", "searchMs", "rerankMs", "generateMs", "totalMs"] as const;
  const latency: Record<string, { p50: number; p95: number }> = {};
  for (const key of latencyKeys) {
    const values = ok.map((r) => r.latency[key]);
    latency[key] = { p50: percentile(values, 0.5), p95: percentile(values, 0.95) };
  }

  const cost = { embed: 0, rerank: 0, generate: 0, judge: 0 };
  for (const r of ok) {
    cost.embed += r.cost?.embed ?? 0;
    cost.rerank += r.cost?.rerank ?? 0;
    cost.generate += r.cost?.generate ?? 0;
    cost.judge += r.cost?.judge ?? 0;
  }
  const costUsd = ok.reduce((sum, r) => sum + r.costUsd, 0);

  return {
    questions: results.length,
    errors: results.length - ok.length,
    degraded: ok.filter((r) => r.degraded === true).length,
    retrieval,
    faithfulness: judgeMean("faithfulness", answerable),
    correctness: judgeMean("correctness", answerable),
    citationAccuracy: judgeMean("citationAccuracy", answerable),
    refusalAccuracy: judgeMean("refusalAccuracy", unanswerable),
    costUsd,
    costPerQuestion: ok.length === 0 ? 0 : costUsd / ok.length,
    cost,
    latency,
  };
}

/** Flatten for the `aggregate` jsonb column and for compare-runs. */
export function flattenAggregate(agg: Aggregate): Record<string, number | null> {
  const flat: Record<string, number | null> = {
    questions: agg.questions,
    errors: agg.errors,
    degraded: agg.degraded,
    faithfulness: agg.faithfulness,
    correctness: agg.correctness,
    citationAccuracy: agg.citationAccuracy,
    refusalAccuracy: agg.refusalAccuracy,
    costUsd: agg.costUsd,
    costPerQuery: agg.costPerQuestion,
  };
  for (const [key, value] of Object.entries(agg.retrieval)) flat[key] = value;
  for (const [stage, value] of Object.entries(agg.cost)) flat[`cost.${stage}`] = value;
  for (const [key, value] of Object.entries(agg.latency)) {
    flat[`${key}.p50`] = value.p50;
    flat[`${key}.p95`] = value.p95;
  }
  return flat;
}
