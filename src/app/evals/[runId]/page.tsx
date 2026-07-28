/**
 * /evals/[runId] — one run in detail. Phase 8 of docs/EVAL_HARNESS.md.
 *
 * Server component for the data; the charts and the searchable table are client
 * components because they are interaction, not content.
 *
 * ERROR BARS ARE COMPUTED HERE, on the server, using the harness's own
 * bootstrap rather than an approximation invented for the chart. A dashboard
 * that draws its own intervals would eventually disagree with the numbers in
 * the reports, and the disagreement would be invisible.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { bootstrapCI } from "@eval/metrics/stats";

import { getRun, listResults, type ResultRow } from "../data";
import { assertDashboardEnabled } from "../guard";
import { MetricBars, LatencyWaterfall } from "./Charts";
import { ResultsTable } from "./ResultsTable";

export const dynamic = "force-dynamic";

/** Metrics worth an interval on the headline chart. */
const HEADLINE = ["recall@1", "recall@5", "recall@10", "mrr", "ndcg@10"] as const;

function meanOf(rows: ResultRow[], key: string): number[] {
  return rows
    .map((r) => r.metrics?.[key])
    .filter((v): v is number => typeof v === "number");
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  assertDashboardEnabled();
  const { runId } = await params;

  const run = await getRun(runId);
  if (!run) notFound();

  const results = await listResults(runId);

  // Seeded, so reloading the page cannot move an error bar. Same seed as the
  // CLI's default, so the chart and `npm run eval:compare` agree.
  const bars = HEADLINE.map((key) => {
    const values = meanOf(results, key);
    if (values.length === 0) return null;
    const ci = bootstrapCI(values, 2000, 0.05, 42);
    return { metric: key, mean: ci.mean, lo: ci.lo, hi: ci.hi, n: values.length };
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  const byType = groupByType(results);
  const latency = latencyStages(results);
  const judged = results.some((r) => typeof r.metrics?.correctness === "number");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav className="text-xs text-muted">
        <Link href="/evals" className="hover:text-foreground">
          Evals
        </Link>{" "}
        / <span className="font-mono">{runId.slice(0, 8)}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {run.variantName}
          <span className="ml-2 font-mono text-sm font-normal text-muted">
            {runId.slice(0, 8)}
          </span>
        </h1>
        <p className="text-xs text-muted">
          {new Date(run.startedAt).toISOString().replace("T", " ").slice(0, 19)} ·{" "}
          {results.length} question{results.length === 1 ? "" : "s"} ·{" "}
          {results.filter((r) => r.error).length} error(s)
          {run.notes ? ` · ${run.notes}` : ""}
        </p>
      </div>

      {!judged && (
        <p className="mt-4 border border-border px-4 py-3 text-sm text-muted">
          Retrieval-only run — no generation, no judging. Answer and judge panels
          are empty by construction, not by failure.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">
          Retrieval, with 95% bootstrap intervals
        </h2>
        <p className="mt-1 text-xs text-muted">
          Percentile bootstrap, 2,000 resamples, seed 42 — the same routine the
          CLI reports. Intervals this wide are why every comparison in this
          project is paired.
        </p>
        <MetricBars data={bars} />
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">By question type</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 text-left font-medium">type</th>
                <th className="py-2 text-right font-medium">n</th>
                <th className="py-2 text-right font-medium">recall@10</th>
                <th className="py-2 text-right font-medium">correctness</th>
              </tr>
            </thead>
            <tbody>
              {byType.map((t) => (
                <tr key={t.type} className="border-b border-border/60">
                  <td className="py-2">{t.type}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{t.n}</td>
                  <td className="py-2 text-right tabular-nums">
                    {t.recall === null ? "—" : `${(t.recall * 100).toFixed(1)}%`}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {t.correctness === null ? "—" : `${(t.correctness * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Unanswerable questions have no relevant chunks, so retrieval metrics
            are null for them rather than zero — they are excluded here, not
            averaged in as failures.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-tight">Latency by stage</h2>
          <p className="mt-1 text-xs text-muted">
            Median milliseconds per question. Describes the run as executed —
            cache state included.
          </p>
          <LatencyWaterfall data={latency} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight">Questions</h2>
        <ResultsTable runId={runId} rows={results} />
      </section>
    </main>
  );
}

function groupByType(rows: ResultRow[]) {
  const groups = new Map<string, ResultRow[]>();
  for (const r of rows) {
    const key = r.type ?? "(unknown)";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([type, group]) => ({
      type,
      n: group.length,
      recall: average(group.map((g) => g.metrics?.["recall@10"])),
      correctness: average(group.map((g) => g.metrics?.correctness)),
    }))
    .sort((a, b) => b.n - a.n);
}

/** Mean over defined values, or null when there are none — never 0. */
function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function latencyStages(rows: ResultRow[]) {
  const stages = ["embedMs", "searchMs", "rerankMs", "generateMs"] as const;
  return stages
    .map((stage) => {
      const values = rows
        .map((r) => r.latency?.[stage])
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);
      const p50 = values.length === 0 ? 0 : values[Math.floor(values.length / 2)];
      return { stage: stage.replace(/Ms$/, ""), p50 };
    })
    .filter((s) => s.p50 > 0);
}
