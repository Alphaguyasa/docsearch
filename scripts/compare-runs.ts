/**
 * Paired run comparison — Phase 5 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:compare -- <runA> <runB>
 *       [--local] [--seed 42] [--iters 10000] [--alpha 0.05]
 *       [--regressions] [--metric recall@10] [--limit 15]
 *
 * <runA> and <runB> are either run ids, or variant names — a variant name
 * resolves to that variant's most recent run WITH USABLE RESULTS. That last
 * clause matters: a crashed run leaves a header row and no results, and
 * silently comparing against it would report every metric as missing rather
 * than saying the run is empty.
 *
 * WHAT THIS DOES THAT A TABLE OF MEANS DOES NOT. Both runs answered the same
 * questions, so this joins them on questionId and bootstraps the per-question
 * DIFFERENCES. Question difficulty is the largest source of variance in a
 * golden set of 77 and it affects both arms identically, so differencing
 * cancels it. A comparison of two independent means at this n can resolve
 * almost nothing; the paired version can resolve a few points.
 *
 * Reading the output: the CI is on the DIFFERENCE. If it contains zero, the
 * run did not distinguish the variants — which is a result, not a failure, and
 * the `min detectable effect` line at the bottom says how large a difference
 * would have had to be before this golden set could have seen it.
 */
import "../src/lib/loadenv";

import {
  buildSeries,
  isResource,
  mean,
  regressions,
  type Series,
  type SeriesKind,
} from "../eval/src/compare";
import { loadGoldenSet, HOLDOUT_FILE, DEV_FILE } from "../eval/src/goldenset";
import {
  correlation,
  DEFAULT_SEED,
  holmBonferroni,
  mcNemar,
  minDetectableEffect,
  pairedBootstrap,
  type PairedResult,
} from "../eval/src/metrics/stats";
import {
  readLocalRuns,
  resolveLocal,
  usable,
  type LoadedRun,
} from "../eval/src/runs";
import type { Question, QuestionResult } from "../eval/src/types";
import { db } from "../src/lib/db";
import { fetchAllRows } from "../src/lib/paginate";

/** Candidate runs inspected when resolving a variant name to its latest run. */
const RESOLVE_CANDIDATES = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- CLI ---------------------------------------------------------------------

interface Args {
  refA: string;
  refB: string;
  local: boolean;
  seed: number;
  iters: number;
  alpha: number;
  regressions: boolean;
  metric: string | null;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const args: Args = {
    refA: "",
    refB: "",
    local: false,
    seed: DEFAULT_SEED,
    iters: 10000,
    alpha: 0.05,
    regressions: false,
    metric: null,
    limit: 15,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--local") args.local = true;
    else if (flag === "--regressions") args.regressions = true;
    else if (flag === "--seed") args.seed = Number(argv[++i]);
    else if (flag === "--iters") args.iters = Number(argv[++i]);
    else if (flag === "--alpha") args.alpha = Number(argv[++i]);
    else if (flag === "--metric") args.metric = argv[++i];
    else if (flag === "--limit") args.limit = Number(argv[++i]);
    else if (flag.startsWith("--")) throw new Error(`Unknown flag: ${flag}`);
    else positional.push(flag);
  }

  if (positional.length !== 2) {
    throw new Error(
      "Usage: npm run eval:compare -- <runA> <runB> [--local] [--regressions]\n" +
        "  <runA>/<runB>: a run id, or a variant name (resolves to its latest run).",
    );
  }
  if (!Number.isFinite(args.seed)) throw new Error("--seed must be a number");
  if (!Number.isInteger(args.iters) || args.iters < 100) {
    throw new Error("--iters must be an integer >= 100");
  }
  if (!(args.alpha > 0 && args.alpha < 1)) {
    throw new Error("--alpha must be in (0,1)");
  }

  [args.refA, args.refB] = positional;
  return args;
}

// --- Loading -----------------------------------------------------------------

interface RunRow {
  run_id: string;
  variant: { name?: string } | null;
  started_at: string;
}

interface ResultRow {
  question_id: string;
  metrics: Record<string, number | null> | null;
  cost_usd: number | null;
  latency: Record<string, number> | null;
  answer: string | null;
  error: string | null;
}

async function fetchResults(runId: string): Promise<QuestionResult[]> {
  const rows = await fetchAllRows<ResultRow>(`eval_results(${runId})`, (from, to) =>
    db
      .from("eval_results")
      .select("question_id, metrics, cost_usd, latency, answer, error")
      .eq("run_id", runId)
      // Paging without a total order can repeat and drop rows — see paginate.ts.
      .order("question_id", { ascending: true })
      .range(from, to)
      .returns<ResultRow[]>(),
  );

  // NOTE: `degraded` is deliberately absent here. eval_results has no such
  // column yet, and adding one means a migration that must be applied before
  // the next run or every upsert fails. So a Supabase-sourced comparison
  // cannot raise the degraded-retrieval warning — `--local` can, and disk is
  // the source of truth for a single run either way. Left undefined rather
  // than defaulted to false, so "unknown" never reads as "verified healthy".
  return rows.map((row) => ({
    questionId: row.question_id,
    retrieved: [],
    answer: row.answer ?? "",
    citations: [],
    metrics: row.metrics ?? {},
    costUsd: row.cost_usd ?? 0,
    latency: {
      embedMs: row.latency?.embedMs ?? 0,
      searchMs: row.latency?.searchMs ?? 0,
      rerankMs: row.latency?.rerankMs ?? 0,
      generateMs: row.latency?.generateMs ?? 0,
      totalMs: row.latency?.totalMs ?? 0,
    },
    error: row.error,
  }));
}

async function resolveRemote(ref: string): Promise<LoadedRun> {
  const query = db
    .from("eval_runs")
    .select("run_id, variant, started_at")
    .order("started_at", { ascending: false })
    .limit(RESOLVE_CANDIDATES);

  const res = UUID.test(ref)
    ? await query.eq("run_id", ref).returns<RunRow[]>()
    : await query.eq("variant->>name", ref).returns<RunRow[]>();

  if (res.error) {
    throw new Error(
      `Supabase read failed: ${res.error.message}\n` +
        `  Runs are also on disk — retry with --local.`,
    );
  }

  const candidates = res.data ?? [];
  if (candidates.length === 0) {
    throw new Error(
      `No run found in Supabase for "${ref}".\n` +
        `  Runs written before the database was reachable exist only on disk — ` +
        `retry with --local.`,
    );
  }

  // Newest first; take the first one that actually has results.
  for (const row of candidates) {
    const results = await fetchResults(row.run_id);
    if (usable(results)) {
      return {
        runId: row.run_id,
        variantName: row.variant?.name ?? "(unknown)",
        startedAt: row.started_at,
        source: "supabase",
        results,
      };
    }
  }

  throw new Error(
    `Found ${candidates.length} run(s) for "${ref}" in Supabase, none with ` +
      `successful results. Nothing to compare.`,
  );
}

// --- Pairing -----------------------------------------------------------------

// --- Formatting --------------------------------------------------------------

/**
 * Money, formatted to stay readable across six orders of magnitude.
 *
 * Per-question embedding cost on this corpus is ~4e-7; a judged question on a
 * paid model is ~1e-3. Any fixed number of decimal places is wrong for one end
 * or the other, and the failure is not cosmetic: at four places a real,
 * statistically significant cost difference — a cold run against a cached one —
 * printed as $0.0000 next to three stars, which reads as a broken test rather
 * than a fact about the cache. Below $0.0001 this switches to exponential,
 * where a nonzero value cannot render as zero.
 */
function formatUsd(v: number): string {
  if (v === 0) return "$0";
  return Math.abs(v) < 1e-4 ? `$${v.toExponential(2)}` : `$${v.toFixed(6)}`;
}

function formatValue(kind: SeriesKind, v: number): string {
  if (kind === "usd") return formatUsd(v);
  if (kind === "ms") return `${Math.round(v)}ms`;
  if (kind === "count") return v.toFixed(2);
  return `${(v * 100).toFixed(1)}%`;
}

function formatDelta(kind: SeriesKind, v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  const mag = Math.abs(v);
  if (kind === "usd") return `${sign}${formatUsd(mag)}`;
  if (kind === "ms") return `${sign}${Math.round(mag)}ms`;
  if (kind === "count") return `${sign}${mag.toFixed(2)}`;
  return `${sign}${(mag * 100).toFixed(1)}pp`;
}


function formatP(p: number): string {
  if (p >= 0.999) return "1.00";
  if (p < 0.0002) return "<0.001";
  return p.toFixed(3);
}

/**
 * Significance marker.
 *
 * Driven by whether the CI contains zero, NOT by the p-value alone — they agree
 * almost always, and when they disagree the interval is the thing being
 * reported, so it wins. `ns` is printed rather than left blank: an empty cell
 * reads as "not computed", and "we looked and found nothing" is a result worth
 * showing explicitly.
 */
function marker(result: PairedResult): string {
  const excludesZero = result.lo > 0 || result.hi < 0;
  if (!excludesZero) return "ns";
  if (result.pValue < 0.001) return "***";
  if (result.pValue < 0.01) return "**";
  return "*";
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function padEnd(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

// --- Report ------------------------------------------------------------------

interface Row {
  series: Series;
  paired: PairedResult;
}

function computeRows(series: Series[], args: Args): Row[] {
  return series.map((s) => ({
    series: s,
    // pairedBootstrap returns mean(first - second). B goes first so the printed
    // delta reads as "B minus A", matching the column order of the table.
    paired: pairedBootstrap(s.b, s.a, args.iters, {
      seed: args.seed,
      alpha: args.alpha,
      idsA: s.ids,
      idsB: s.ids,
    }),
  }));
}

function printTable(rows: Row[], args: Args): void {
  const ciLabel = `${Math.round((1 - args.alpha) * 100)}% CI`;
  const widths = { metric: 22, n: 4, val: 12, delta: 12, ci: 27, p: 8, sig: 4, holm: 9 };

  // Holm over EVERY metric in this table, quality and resource alike — they are
  // all tests run against the same pair of runs, which is what makes them one
  // family. Computed once here rather than per row.
  const holm = holmBonferroni(rows.map((r) => r.paired.pValue), args.alpha);

  const header =
    padEnd("metric", widths.metric) +
    pad("n", widths.n) +
    pad("A", widths.val) +
    pad("B", widths.val) +
    pad("delta", widths.delta) +
    pad(`${ciLabel} (B−A)`, widths.ci) +
    pad("p", widths.p) +
    pad("sig", widths.sig) +
    pad("holm", widths.holm);

  console.log(header);
  console.log("─".repeat(header.length));

  let lastKind: SeriesKind | null = null;
  rows.forEach(({ series, paired }, i) => {
    // A rule between the quality metrics and the cost/latency block, which are
    // read in the opposite direction.
    if (lastKind !== null && !isResource(lastKind) && isResource(series.kind)) {
      console.log("─".repeat(header.length));
    }
    lastKind = series.kind;

    const meanA = mean(series.a);
    const meanB = mean(series.b);
    const ci = `[${formatDelta(series.kind, paired.lo)}, ${formatDelta(series.kind, paired.hi)}]`;

    console.log(
      padEnd(series.name, widths.metric) +
        pad(String(paired.n), widths.n) +
        pad(formatValue(series.kind, meanA), widths.val) +
        pad(formatValue(series.kind, meanB), widths.val) +
        pad(formatDelta(series.kind, paired.meanDiff), widths.delta) +
        pad(ci, widths.ci) +
        pad(formatP(paired.pValue), widths.p) +
        pad(marker(paired), widths.sig) +
        pad(
          holm[i].reject ? `${formatP(holm[i].adjusted)} ✓` : formatP(holm[i].adjusted),
          widths.holm,
        ),
    );
  });

  const survivors = holm.filter((h) => h.reject).length;
  console.log(
    `\n  * CI excludes 0 · ** p<0.01 · *** p<0.001 · ns = not distinguishable\n` +
      `  Quality metrics: higher is better. Cost and latency: lower is better.\n` +
      `\n  holm = Holm–Bonferroni adjusted p across all ${rows.length} tests above; ` +
      `✓ survives at α=${args.alpha}.\n` +
      `  ${survivors} of ${rows.length} survive. Testing ${rows.length} metrics at ` +
      `α=${args.alpha} expects ~${(rows.length * args.alpha).toFixed(1)} false\n` +
      `  positives by chance, so an unadjusted * on its own is weak evidence.\n` +
      `  CONSERVATIVE HERE: recall@1…@20 are one metric at five cutoffs, not five\n` +
      `  independent hypotheses. Holm assumes the worst about that dependence, so\n` +
      `  failing it is "not established by this test alone", NOT refuted. A result\n` +
      `  that fails Holm but moves consistently across related metrics and widens\n` +
      `  with contrast is still worth believing — that judgment stays yours.`,
  );

  if (rows.some((r) => isResource(r.series.kind))) {
    // Learned from the first real comparison this ran on: two runs with
    // bit-identical retrieval showed a 39-SECOND mean latency difference and a
    // significant cost difference, purely because one ran cold and the other
    // replayed from cache behind a 3-request/minute embedding tier. Both
    // numbers were correct and neither was about the variant.
    const n = rows.find((r) => isResource(r.series.kind))?.series.ids.length ?? 0;
    console.log(
      `\n  Cost and latency describe the runs AS EXECUTED — cache state and\n` +
        `  rate-limiter pacing included. A cold run against a cached one differs\n` +
        `  enormously on both while retrieving identical chunks. Compare these\n` +
        `  only between runs with the same cache state, and prefer the p50 in the\n` +
        `  run summary over the mean: one paced wait dominates a mean of ${n}.`,
    );
  }
}

/** Binary metrics get McNemar's test as well — see stats.ts for why. */
function printMcNemar(rows: Row[]): void {
  const binary = rows.filter(({ series }) =>
    series.kind === "rate" &&
    series.a.every((v) => v === 0 || v === 1) &&
    series.b.every((v) => v === 0 || v === 1),
  );
  if (binary.length === 0) return;

  console.log("\n── McNemar, binary metrics ─────────────────────────────");
  console.log(
    padEnd("metric", 22) +
      pad("A only", 8) +
      pad("B only", 8) +
      pad("disc.", 7) +
      pad("p", 9),
  );
  for (const { series } of binary) {
    const result = mcNemar(
      series.a.map((v) => v === 1),
      series.b.map((v) => v === 1),
    );
    console.log(
      padEnd(series.name, 22) +
        pad(String(result.b01), 8) +
        pad(String(result.b10), 8) +
        pad(String(result.n), 7) +
        pad(formatP(result.pValue), 9),
    );
  }
  console.log(
    "\n  Only pairs where the two runs DISAGREE carry information; ties drop out.",
  );
}

/**
 * Pick the metric the regression list and the power statement are keyed to.
 *
 * Preference order is deliberate: an end-to-end quality metric if the run was
 * judged, otherwise the headline retrieval number. Falls back to the first
 * quality series so this never fails on an unusual variant.
 */
function primarySeries(rows: Row[], requested: string | null): Row {
  if (requested) {
    const found = rows.find((r) => r.series.name === requested);
    if (!found) {
      throw new Error(
        `--metric "${requested}" is not in this comparison.\n` +
          `  Available: ${rows.map((r) => r.series.name).join(", ")}`,
      );
    }
    return found;
  }
  const preferred = ["correctness", "faithfulness", "recall@10", "recall@5"];
  for (const name of preferred) {
    const found = rows.find((r) => r.series.name === name);
    if (found) return found;
  }
  return rows.find((r) => r.series.kind === "rate") ?? rows[0];
}

function printPower(row: Row): void {
  const { series, paired } = row;

  // minDetectableEffect models a PROPORTION — its variance term is p(1-p). Fed
  // a count or a duration it returns a confident-looking number that means
  // nothing. Say so rather than printing it.
  if (series.kind !== "rate") {
    console.log("\n── What this golden set can detect ─────────────────────");
    console.log(
      `  Not computed: "${series.name}" is a ${series.kind}, and the power\n` +
        `  calculation applies to rates in [0,1]. Pass --metric with a rate\n` +
        `  (recall@10, correctness, faithfulness) to get this figure.`,
    );
    return;
  }

  const meanA = mean(series.a);
  const rho = correlation(series.a, series.b);
  const mde = minDetectableEffect(paired.n, Math.min(Math.max(meanA, 0), 1), {
    correlation: rho,
  });

  console.log("\n── What this golden set can detect ─────────────────────");
  console.log(`  keyed to ${series.name} at ${formatValue(series.kind, meanA)}, n=${mde.n}`);
  console.log(
    `  95% CI half-width on one arm's mean   ±${(mde.ciHalfWidth * 100).toFixed(1)}pp`,
  );
  console.log(
    `  min detectable effect, unpaired       ${(mde.mde * 100).toFixed(1)}pp   ` +
      `(80% power, α=0.05)`,
  );
  console.log(
    `  min detectable effect, paired         ${(mde.mdePaired! * 100).toFixed(1)}pp   ` +
      `(arms correlate ρ=${rho.toFixed(2)})`,
  );

  if (rho > 0.99) {
    // The formula scales by sqrt(1-ρ), so ρ=1 sends the paired MDE to 0 — true
    // in the limit and useless as guidance. Two arms that agree on every
    // question have no variance left to detect anything against; the figure is
    // an artifact of comparing a run with itself or with a near-clone.
    console.log(
      `\n  ρ≈1: the arms agree on essentially every question, so the paired\n` +
        `  figure collapses toward zero. That is arithmetic, not statistical\n` +
        `  power — use the unpaired figure for planning until two genuinely\n` +
        `  different variants have been run.`,
    );
  } else {
    console.log(
      `\n  A difference smaller than the paired figure is one this set cannot\n` +
        `  resolve. Report those as inconclusive, not as "no effect".`,
    );
  }
}

function loadQuestionText(): Map<string, Question> {
  const byId = new Map<string, Question>();
  for (const file of [DEV_FILE, HOLDOUT_FILE]) {
    try {
      for (const q of loadGoldenSet({ file }).questions) byId.set(q.id, q);
    } catch {
      // A missing split is not fatal here — the regression list degrades to
      // ids, which is still usable. Only the text is lost.
    }
  }
  return byId;
}

function printRegressions(row: Row, args: Args): void {
  const { series } = row;
  const questions = loadQuestionText();

  const worse = regressions(series);

  console.log(`\n── Regressions on ${series.name} ───────────────────────`);
  if (worse.length === 0) {
    console.log(`  None. B is no worse than A on any of the ${series.ids.length} paired questions.`);
    return;
  }

  console.log(
    `  ${worse.length} of ${series.ids.length} question(s) where B is worse than A, worst first.\n`,
  );
  for (const d of worse.slice(0, args.limit)) {
    const q = questions.get(d.id);
    console.log(
      `  ${formatDelta(series.kind, d.delta)}  ` +
        `${formatValue(series.kind, d.a)} → ${formatValue(series.kind, d.b)}  ` +
        `${d.id}${q ? `  [${q.type}/${q.difficulty}]` : ""}`,
    );
    if (q) console.log(`      ${q.question}`);
  }
  if (worse.length > args.limit) {
    console.log(`\n  ... and ${worse.length - args.limit} more (--limit ${worse.length} to see all).`);
  }
}

// --- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let runA: LoadedRun;
  let runB: LoadedRun;
  if (args.local) {
    const local = readLocalRuns();
    runA = resolveLocal(args.refA, local);
    runB = resolveLocal(args.refB, local);
  } else {
    runA = await resolveRemote(args.refA);
    runB = await resolveRemote(args.refB);
  }

  console.log(`\n── Comparing ───────────────────────────────────────────`);
  console.log(`  A  ${runA.runId}  ${runA.variantName}  ${runA.startedAt}`);
  console.log(`     ${runA.source}  ${runA.results.length} result(s)`);
  console.log(`  B  ${runB.runId}  ${runB.variantName}  ${runB.startedAt}`);
  console.log(`     ${runB.source}  ${runB.results.length} result(s)`);
  console.log(`  seed ${args.seed}, ${args.iters} bootstrap resamples\n`);

  if (runA.runId === runB.runId) {
    // The Phase 5 acceptance case. Say what it is, so a zero row is read as the
    // harness working rather than as a real finding about two variants.
    console.log(
      `  NULL TEST — both references resolved to the same run. Every delta\n` +
        `  must be exactly zero with intervals to match. This checks the join\n` +
        `  and the statistics, not the variants.\n`,
    );
  }

  const series = buildSeries(runA, runB);
  if (series.length === 0) {
    throw new Error(
      "No metric is present in both runs on any shared question.\n" +
        "  Check that the two runs cover the same golden set split.",
    );
  }

  const rows = computeRows(series, args);

  // A degraded question scores like any other, so a comparison against an arm
  // containing them attributes a retrieval outage to the variant.
  for (const [label, run] of [["A", runA], ["B", runB]] as const) {
    const degraded = run.results.filter((r) => r.degraded === true).length;
    if (degraded > 0) {
      console.log(
        `  ⚠ Run ${label} has ${degraded} degraded question(s) — hybrid retrieval\n` +
          `    lost a source and fused from the survivor. Any delta below may be\n` +
          `    that outage rather than the variant. Re-run ${label} before quoting.\n`,
      );
    }
  }

  const idsA = new Set(runA.results.map((r) => r.questionId));
  const idsB = new Set(runB.results.map((r) => r.questionId));
  const shared = [...idsA].filter((id) => idsB.has(id)).length;
  console.log(
    `  ${shared} shared question(s); ${idsA.size - shared} only in A, ` +
      `${idsB.size - shared} only in B.\n`,
  );

  printTable(rows, args);
  printMcNemar(rows);

  const primary = primarySeries(rows, args.metric);
  printPower(primary);

  if (args.regressions) printRegressions(primary, args);

  console.log("");
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
});
