/**
 * /evals/compare?a=&b= — the paired comparison, and the per-question deltas.
 *
 * REUSES THE HARNESS'S OWN JOIN AND BOOTSTRAP (eval/src/compare.ts,
 * eval/src/metrics/stats.ts) rather than reimplementing either. Two
 * implementations of a paired comparison is how a dashboard and a CLI end up
 * publishing different deltas for the same pair of runs, and the disagreement
 * shows up as a number nobody can reproduce rather than as an error.
 *
 * Direction: A is the baseline, B is the candidate, and every delta reads
 * B − A — "what did the change do".
 */
import Link from "next/link";

import { buildSeries, regressions, type Series } from "@eval/compare";
import { pairedBootstrap } from "@eval/metrics/stats";

import { getRun, listResults, type ResultRow } from "../data";
import { assertDashboardEnabled } from "../guard";

export const dynamic = "force-dynamic";

/** compare.ts wants QuestionResult-shaped rows; this is the subset it reads. */
function asRunLike(rows: ResultRow[]) {
  return {
    results: rows.map((r) => ({
      questionId: r.questionId,
      retrieved: [],
      answer: r.answer ?? "",
      citations: [],
      metrics: r.metrics ?? {},
      costUsd: r.costUsd ?? 0,
      latency: {
        embedMs: r.latency?.embedMs ?? 0,
        searchMs: r.latency?.searchMs ?? 0,
        rerankMs: r.latency?.rerankMs ?? 0,
        generateMs: r.latency?.generateMs ?? 0,
        totalMs: r.latency?.totalMs ?? 0,
      },
      error: r.error,
    })),
  };
}

const INTERESTING = new Set([
  "recall@1",
  "recall@5",
  "recall@10",
  "hitRate@10",
  "mrr",
  "ndcg@10",
  "correctness",
  "faithfulness",
  "citationAccuracy",
  "refusalAccuracy",
]);

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  assertDashboardEnabled();
  const { a, b } = await searchParams;

  if (!a || !b) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Compare runs</h1>
        <p className="mt-3 text-sm text-muted">
          Pass two run ids: <code>/evals/compare?a=&lt;baseline&gt;&amp;b=&lt;candidate&gt;</code>.
          Deltas read B − A.
        </p>
        <Link href="/evals" className="mt-4 inline-block text-sm underline underline-offset-2">
          ← All runs
        </Link>
      </main>
    );
  }

  const [runA, runB] = await Promise.all([getRun(a), getRun(b)]);
  if (!runA || !runB) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Compare runs</h1>
        <p className="mt-4 border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {!runA ? `No run ${a}.` : `No run ${b}.`}
        </p>
      </main>
    );
  }

  const [rowsA, rowsB] = await Promise.all([listResults(a), listResults(b)]);
  const series = buildSeries(asRunLike(rowsB), asRunLike(rowsA)).filter((s) =>
    INTERESTING.has(s.name),
  );

  const questionText = new Map(rowsA.map((r) => [r.questionId, r.question]));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav className="text-xs text-muted">
        <Link href="/evals" className="hover:text-foreground">
          Evals
        </Link>{" "}
        / compare
      </nav>

      <h1 className="mt-2 text-lg font-semibold tracking-tight">
        {runA.variantName} → {runB.variantName}
      </h1>
      <p className="mt-1 text-xs text-muted">
        A <span className="font-mono">{a.slice(0, 8)}</span> · B{" "}
        <span className="font-mono">{b.slice(0, 8)}</span> · deltas read B − A ·
        paired on question id, 2,000 bootstrap resamples, seed 42
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="py-2 text-left font-medium">metric</th>
            <th className="py-2 text-right font-medium">n</th>
            <th className="py-2 text-right font-medium">A</th>
            <th className="py-2 text-right font-medium">B</th>
            <th className="py-2 text-right font-medium">delta</th>
            <th className="py-2 text-right font-medium">95% CI</th>
            <th className="py-2 text-right font-medium">p</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <Row key={s.name} series={s} />
          ))}
        </tbody>
      </table>

      {series.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          These two runs share no questions with comparable metrics.
        </p>
      )}

      <p className="mt-4 max-w-3xl text-xs text-muted">
        A confidence interval that straddles zero means this golden set cannot
        distinguish the two arms on that metric — not that they are equal. At
        n≈63 answerable questions the smallest difference two independent arms
        could resolve is roughly 25 points; pairing brings that down, which is
        why these are paired.
      </p>

      <PerQuestion series={series} questionText={questionText} runB={b} />
    </main>
  );
}

function Row({ series }: { series: Series }) {
  const meanA = avg(series.b);
  const meanB = avg(series.a);
  const paired = pairedBootstrap(series.a, series.b, 2000, {
    seed: 42,
    idsA: series.ids,
    idsB: series.ids,
  });
  const significant = paired.lo > 0 || paired.hi < 0;

  return (
    <tr className="border-b border-border/60">
      <td className="py-2">{series.name}</td>
      <td className="py-2 text-right tabular-nums text-muted">{series.ids.length}</td>
      <td className="py-2 text-right tabular-nums">{pct(meanA)}</td>
      <td className="py-2 text-right tabular-nums">{pct(meanB)}</td>
      <td
        className={`py-2 text-right tabular-nums ${
          significant ? "font-medium" : "text-muted"
        }`}
      >
        {pp(paired.meanDiff)}
      </td>
      <td className="py-2 text-right tabular-nums text-xs text-muted">
        [{pp(paired.lo)}, {pp(paired.hi)}]
      </td>
      <td className="py-2 text-right tabular-nums text-xs text-muted">
        {paired.pValue < 0.001 ? "<0.001" : paired.pValue.toFixed(3)}
      </td>
    </tr>
  );
}

/** The questions B made worse, which is the debugging workflow. */
function PerQuestion({
  series,
  questionText,
  runB,
}: {
  series: Series[];
  questionText: Map<string, string | null>;
  runB: string;
}) {
  const primary =
    series.find((s) => s.name === "recall@10") ?? series.find((s) => s.name === "correctness");
  if (!primary) return null;

  const worse = regressions(primary).slice(0, 10);
  if (worse.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted">
        No question got worse on {primary.name}.
      </p>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-tight">
        Worse on {primary.name}
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {worse.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-3">
            <Link
              href={`/evals/${runB}/q/${d.id}`}
              className="font-mono text-xs underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {d.id}
            </Link>
            <span className="tabular-nums text-muted">
              {pct(d.b)} → {pct(d.a)}
            </span>
            <span className="max-w-2xl truncate text-muted">
              {questionText.get(d.id) ?? ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function pp(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}pp`;
}
