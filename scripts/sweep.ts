/**
 * Run a set of variants and emit one combined markdown report — Phase 6 of
 * docs/EVAL_HARNESS.md.
 *
 *   npm run eval:sweep -- <variant...> [--baseline baseline] [--retrieval-only]
 *       [--reuse] [--out <path>] [--metric recall@10]
 *       [--seed 42] [--iters 10000] [--alpha 0.05]
 *       [--subset <n>] [--concurrency <n>] [--skip-db] [--no-cache]
 *
 * WHY THIS EXISTS. The first four experiments in this project were run by hand
 * and their report was assembled by hand from eleven separate runs. That worked
 * at eleven arms and produced two errors I caught only by chance — an
 * aggregation metric read against the wrong ceiling, and three identical
 * numbers mistaken for a finding when they were arithmetic coincidence. A
 * chunk-size sweep adds nine more arms. Hand-assembly does not survive that.
 *
 * WHAT IT GUARANTEES that hand-assembly did not:
 *   - Every arm is compared against the same baseline, with the same seed.
 *   - Every comparison gets Holm correction across its own metric family, so
 *     the false-positive budget is stated rather than assumed.
 *   - The per-type breakdown prints each type's recall CEILING alongside its
 *     score, because aggregation questions average 35 relevant chunks against a
 *     topK of 8 and their recall cannot exceed ~31% however good retrieval is.
 *     Reading that row against 100% is the error this column exists to prevent.
 *   - Degraded runs are flagged in the report, not just in the console.
 *
 * `--reuse` skips execution and reports on each variant's most recent usable
 * run. That is how you regenerate a report after changing its layout without
 * re-running anything, and how you assemble a report over arms that were run
 * days apart.
 */
import "../src/lib/loadenv";

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildSeries, mean, type Series } from "../eval/src/compare";
import { loadVariant } from "../eval/src/config";
import { loadGoldenSet } from "../eval/src/goldenset";
import {
  bootstrapCI,
  DEFAULT_SEED,
  holmBonferroni,
  minDetectableEffect,
  pairedBootstrap,
  correlation,
} from "../eval/src/metrics/stats";
import {
  degradedCount,
  readLocalRuns,
  resolveLocal,
  RUNS_DIR,
  usable,
  type LoadedRun,
} from "../eval/src/runs";
import type { Question, QuestionType, Variant } from "../eval/src/types";

// --- CLI ---------------------------------------------------------------------

interface Args {
  variants: string[];
  baseline: string;
  retrievalOnly: boolean;
  reuse: boolean;
  out: string | null;
  metric: string | null;
  seed: number;
  iters: number;
  alpha: number;
  /** Forwarded verbatim to the runner. */
  passthrough: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    variants: [],
    baseline: "baseline",
    retrievalOnly: false,
    reuse: false,
    out: null,
    metric: null,
    seed: DEFAULT_SEED,
    iters: 10000,
    alpha: 0.05,
    passthrough: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--retrieval-only") {
      args.retrievalOnly = true;
      args.passthrough.push(flag);
    } else if (flag === "--reuse") args.reuse = true;
    else if (flag === "--baseline") args.baseline = argv[++i];
    else if (flag === "--out") args.out = argv[++i];
    else if (flag === "--metric") args.metric = argv[++i];
    else if (flag === "--seed") args.seed = Number(argv[++i]);
    else if (flag === "--iters") args.iters = Number(argv[++i]);
    else if (flag === "--alpha") args.alpha = Number(argv[++i]);
    else if (flag === "--skip-db" || flag === "--no-cache" || flag === "--no-judge") {
      args.passthrough.push(flag);
    } else if (flag === "--subset" || flag === "--concurrency") {
      args.passthrough.push(flag, argv[++i]);
    } else if (flag.startsWith("--")) throw new Error(`Unknown flag: ${flag}`);
    else args.variants.push(flag);
  }

  if (args.variants.length === 0) {
    throw new Error(
      "Usage: npm run eval:sweep -- <variant...> [--baseline <name>] [--reuse]\n" +
        "  Example: npm run eval:sweep -- topk-3 topk-5 topk-10 topk-20 --retrieval-only",
    );
  }
  if (!(args.alpha > 0 && args.alpha < 1)) throw new Error("--alpha must be in (0,1)");
  if (!Number.isInteger(args.iters) || args.iters < 100) {
    throw new Error("--iters must be an integer >= 100");
  }

  // The baseline is compared against, so it must be in the set of runs. Added
  // rather than required on the command line — forgetting it would otherwise
  // fail after every arm had already executed.
  if (!args.variants.includes(args.baseline)) args.variants.unshift(args.baseline);

  return args;
}

// --- Running -----------------------------------------------------------------

/**
 * Execute one variant and return the run it produced.
 *
 * Identifies the new run by diffing the runs directory rather than by parsing
 * the runner's stdout. Scraping a progress bar for a uuid is exactly the kind
 * of coupling that breaks the next time someone improves the summary output.
 */
function runVariant(variant: string, args: Args): LoadedRun {
  const before = new Set(existsSync(RUNS_DIR) ? readdirSync(RUNS_DIR) : []);

  execFileSync(
    process.execPath,
    [
      path.join("node_modules", "tsx", "dist", "cli.mjs"),
      path.join("eval", "src", "runner.ts"),
      "--variant",
      variant,
      ...args.passthrough,
    ],
    { stdio: "inherit" },
  );

  const created = readdirSync(RUNS_DIR).filter(
    (f) => !before.has(f) && f.endsWith(".jsonl"),
  );
  if (created.length === 0) {
    throw new Error(`${variant}: the runner produced no run file.`);
  }

  const runs = readLocalRuns();
  const match = runs.find((r) => created.includes(path.basename(r.file)));
  if (!match) throw new Error(`${variant}: could not read back the new run file.`);
  if (!usable(match.results)) {
    throw new Error(
      `${variant}: run ${match.runId} produced no successful results. ` +
        `Sweep stopped — continuing would report a variant as catastrophically ` +
        `worse when it simply failed.`,
    );
  }
  return match;
}

// --- Report ------------------------------------------------------------------

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const pp = (v: number): string =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v * 100).toFixed(1)}pp`;
const money = (v: number): string =>
  v === 0 ? "$0" : Math.abs(v) < 1e-4 ? `$${v.toExponential(2)}` : `$${v.toFixed(6)}`;
const fmtP = (p: number): string =>
  p >= 0.999 ? "1.00" : p < 0.0002 ? "<0.001" : p.toFixed(3);

/** Metric shown in the headline table when the caller does not pick one. */
function pickMetric(runs: LoadedRun[], requested: string | null): string {
  const present = new Set<string>();
  for (const run of runs) {
    for (const r of run.results) {
      if (r.error === null) for (const k of Object.keys(r.metrics ?? {})) present.add(k);
    }
  }
  if (requested) {
    if (!present.has(requested)) {
      throw new Error(
        `--metric "${requested}" is not present in these runs.\n` +
          `  Available: ${[...present].sort().join(", ")}`,
      );
    }
    return requested;
  }
  for (const name of ["correctness", "faithfulness", "recall@20", "recall@10"]) {
    if (present.has(name)) return name;
  }
  throw new Error("No metric found in any run — nothing to report.");
}

function values(run: LoadedRun, metric: string): number[] {
  return run.results
    .filter((r) => r.error === null)
    .map((r) => r.metrics?.[metric])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/**
 * Recall ceiling for a question type at a given cut.
 *
 * An aggregation question with 79 relevant chunks cannot exceed 8/79 recall
 * when 8 chunks are returned. Reporting its ~8% against an implied 100% reads
 * as total failure; against its real 31% ceiling it reads as "a quarter of what
 * is reachable, and recall is the wrong instrument for this question type".
 */
function recallCeiling(questions: Question[], k: number): number {
  const relevant = questions.map((q) => q.relevantChunkIds.length).filter((n) => n > 0);
  if (relevant.length === 0) return 0;
  return mean(relevant.map((n) => Math.min(k, n) / n));
}

interface Comparison {
  variant: string;
  series: Series[];
  survivors: number;
  tests: number;
  primary: { delta: number; lo: number; hi: number; p: number; adjusted: number } | null;
}

function compare(
  baseline: LoadedRun,
  arm: LoadedRun,
  metric: string,
  args: Args,
): Comparison {
  const series = buildSeries(baseline, arm);
  const paired = series.map((s) =>
    pairedBootstrap(s.b, s.a, args.iters, {
      seed: args.seed,
      alpha: args.alpha,
      idsA: s.ids,
      idsB: s.ids,
    }),
  );
  const holm = holmBonferroni(paired.map((p) => p.pValue), args.alpha);

  const index = series.findIndex((s) => s.name === metric);
  return {
    variant: arm.variantName,
    series,
    survivors: holm.filter((h) => h.reject).length,
    tests: holm.length,
    primary:
      index === -1
        ? null
        : {
            delta: paired[index].meanDiff,
            lo: paired[index].lo,
            hi: paired[index].hi,
            p: paired[index].pValue,
            adjusted: holm[index].adjusted,
          },
  };
}

function buildReport(
  runs: LoadedRun[],
  variants: Map<string, Variant>,
  baseline: LoadedRun,
  metric: string,
  questions: Question[],
  args: Args,
  gitSha: string,
): string {
  const out: string[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const totalCost = runs.reduce(
    (s, run) => s + run.results.reduce((t, r) => t + (r.costUsd ?? 0), 0),
    0,
  );

  out.push(`# Sweep report — ${new Date().toISOString()}`);
  out.push("");
  out.push(
    `${runs.length} arms · ${runs.reduce((s, r) => s + r.results.length, 0)} ` +
      `question-runs · ${money(totalCost)} · commit \`${gitSha}\``,
  );
  out.push("");
  out.push(
    `Baseline: \`${baseline.variantName}\` · primary metric: \`${metric}\` · ` +
      `seed ${args.seed} · ${args.iters} resamples · α=${args.alpha}` +
      (args.retrievalOnly ? " · **retrieval-only** (no generation, no judging)" : ""),
  );
  out.push("");

  const degraded = runs.filter((r) => degradedCount(r) > 0);
  if (degraded.length > 0) {
    out.push(
      `> ⚠ **Degraded retrieval.** ` +
        degraded
          .map((r) => `\`${r.variantName}\` (${degradedCount(r)} question(s))`)
          .join(", ") +
        ` lost one of hybrid retrieval's two sources and scored from the survivor` +
        ` alone. Those arms are not comparable to a clean run — re-run before` +
        ` quoting them.`,
    );
    out.push("");
  }

  // --- Summary with CIs ------------------------------------------------------
  out.push(`## Arms`);
  out.push("");
  out.push(`| variant | n | ${metric} | 95% CI | nDCG@10 | MRR |`);
  out.push(`|---|---|---|---|---|---|`);
  for (const run of runs) {
    const vals = values(run, metric);
    if (vals.length === 0) {
      out.push(`| \`${run.variantName}\` | 0 | — | — | — | — |`);
      continue;
    }
    const ci = bootstrapCI(vals, args.iters, args.alpha, args.seed);
    const nd = values(run, "ndcg@10");
    const mr = values(run, "mrr");
    out.push(
      `| \`${run.variantName}\` | ${vals.length} | ${pct(ci.mean)} | ` +
        `[${pct(ci.lo)}, ${pct(ci.hi)}] | ` +
        `${nd.length ? pct(mean(nd)) : "—"} | ${mr.length ? pct(mean(mr)) : "—"} |`,
    );
  }
  out.push("");
  out.push(
    `Those intervals are on individual means and overlap heavily. They support ` +
      `almost no conclusion on their own — which is why the next section is paired.`,
  );
  out.push("");

  // --- Paired vs baseline ----------------------------------------------------
  out.push(`## Paired against \`${baseline.variantName}\``);
  out.push("");
  out.push(`| variant | Δ ${metric} | 95% CI | p | Holm adj. | survives Holm |`);
  out.push(`|---|---|---|---|---|---|`);
  const comparisons: Comparison[] = [];
  for (const run of runs) {
    if (run.runId === baseline.runId) continue;
    const c = compare(baseline, run, metric, args);
    comparisons.push(c);
    const pr = c.primary;
    out.push(
      `| \`${c.variant}\` | ${pr ? pp(pr.delta) : "—"} | ` +
        `${pr ? `[${pp(pr.lo)}, ${pp(pr.hi)}]` : "—"} | ${pr ? fmtP(pr.p) : "—"} | ` +
        `${pr ? fmtP(pr.adjusted) : "—"} | **${c.survivors}** of ${c.tests} |`,
    );
  }
  out.push("");
  out.push(
    `"Survives Holm" counts every metric in that comparison whose ` +
      `Holm-adjusted p clears α, not just the primary. Testing ~${
        comparisons[0]?.tests ?? 0
      } metrics at α=${args.alpha} expects ~${(
        (comparisons[0]?.tests ?? 0) * args.alpha
      ).toFixed(1)} false positives by chance, so an uncorrected p is weak evidence ` +
      `on its own.`,
  );
  out.push("");
  out.push(
    `**Holm is conservative on this metric set.** \`recall@1\`…\`recall@20\` are ` +
      `one metric at five cutoffs, not five independent hypotheses. Failing Holm ` +
      `means "not established by this test alone", not "refuted".`,
  );
  out.push("");

  // --- Per-question-type -----------------------------------------------------
  const types: QuestionType[] = [
    "factoid",
    "multihop",
    "aggregation",
    "paraphrase",
    "unanswerable",
  ];
  /**
   * Effective cut for a ceiling: the metric's @k, capped by how many chunks the
   * arm actually returns.
   *
   * Getting this wrong is subtle and produces a confidently wrong number. A
   * recall@20 column over arms with topK=8 only ever sees 8 chunks, so the
   * ceiling is set by 8, not 20 — using the metric's cutoff reported 68% for
   * aggregation when the real figure at topK=8 is 31%. Since topK varies across
   * arms in a top-k sweep, the ceiling genuinely differs per arm; the column is
   * anchored to the baseline and the header says so.
   */
  const metricCut = Number(metric.split("@")[1]);
  const baselineTopK = variants.get(baseline.variantName)?.retrieval.topK ?? metricCut;
  const cut = Number.isFinite(metricCut)
    ? Math.min(metricCut, baselineTopK)
    : baselineTopK;
  const topKs = [...new Set(runs.map((r) => variants.get(r.variantName)?.retrieval.topK))];

  out.push(`## By question type — \`${metric}\``);
  out.push("");
  out.push(
    `| type | n | ceiling @k=${cut} | ${runs.map((r) => `\`${r.variantName}\``).join(" | ")} |`,
  );
  out.push(`|---|---|---|${runs.map(() => "---").join("|")}|`);
  for (const type of types) {
    const inType = questions.filter((q) => q.type === type);
    if (inType.length === 0) continue;
    const ceiling =
      Number.isFinite(cut) && inType.some((q) => q.relevantChunkIds.length > 0)
        ? pct(recallCeiling(inType, cut))
        : "—";
    const cells = runs.map((run) => {
      const vals = run.results
        .filter((r) => r.error === null && byId.get(r.questionId)?.type === type)
        .map((r) => r.metrics?.[metric])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      return vals.length === 0 ? "—" : pct(mean(vals));
    });
    out.push(`| ${type} | ${inType.length} | ${ceiling} | ${cells.join(" | ")} |`);
  }
  out.push("");
  out.push(
    `**Read each row against its ceiling, not against 100%.** A type whose ` +
      `questions have more relevant chunks than the arm returns cannot reach ` +
      `100% recall however good retrieval is, so a low score there is partly a ` +
      `statement about topK rather than about retrieval quality.`,
  );
  if (topKs.length > 1) {
    out.push("");
    out.push(
      `> The ceiling column is anchored to \`${baseline.variantName}\` ` +
        `(topK=${baselineTopK}). These arms use different topK values ` +
        `(${topKs.filter((k) => k !== undefined).sort((a, b) => a! - b!).join(", ")}), ` +
        `so arms returning more chunks have a proportionally higher ceiling on any ` +
        `type whose relevant set exceeds their topK. Compare within a topK, not across.`,
    );
  }
  out.push("");

  // --- Cost and latency ------------------------------------------------------
  out.push(`## Cost and latency`);
  out.push("");
  out.push(`| variant | cost | per question | total p50 | total p95 |`);
  out.push(`|---|---|---|---|---|`);
  for (const run of runs) {
    const ok = run.results.filter((r) => r.error === null);
    const cost = ok.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const lat = ok.map((r) => r.latency?.totalMs ?? 0).sort((a, b) => a - b);
    const q = (f: number) =>
      lat.length === 0 ? 0 : lat[Math.min(lat.length - 1, Math.ceil(f * lat.length) - 1)];
    out.push(
      `| \`${run.variantName}\` | ${money(cost)} | ` +
        `${money(ok.length ? cost / ok.length : 0)} | ${q(0.5)}ms | ${q(0.95)}ms |`,
    );
  }
  out.push("");
  out.push(
    `Cost and latency describe the runs **as executed**, including cache state ` +
      `and rate-limiter pacing. A cold arm against a cached one differs enormously ` +
      `on both while retrieving identical chunks. Compare these only between arms ` +
      `run under the same cache state.`,
  );
  out.push("");

  // --- Power -----------------------------------------------------------------
  const baseVals = values(baseline, metric);
  if (baseVals.length > 0) {
    const first = comparisons[0]?.series.find((s) => s.name === metric);
    const rho = first ? correlation(first.a, first.b) : undefined;
    const mde = minDetectableEffect(
      baseVals.length,
      Math.min(Math.max(mean(baseVals), 0), 1),
      rho === undefined ? {} : { correlation: rho },
    );
    out.push(`## What this golden set can detect`);
    out.push("");
    // Percentage POINTS, not percent — these are differences between rates.
    const points = (v: number): string => `${(v * 100).toFixed(1)}pp`;
    out.push(`- 95% CI half-width on one arm's mean: **±${points(mde.ciHalfWidth)}**`);
    out.push(`- Minimum detectable effect, unpaired: **${points(mde.mde)}** (80% power)`);
    if (mde.mdePaired !== null) {
      out.push(
        `- Minimum detectable effect, paired: **${points(mde.mdePaired)}** ` +
          `(ρ=${rho!.toFixed(2)}, measured against \`${comparisons[0].variant}\`)`,
      );
    }
    out.push("");
    out.push(
      `A difference smaller than the paired figure is **inconclusive here, not ` +
        `absent**. The MDE is a planning figure from a normal approximation; the ` +
        `CIs above come from the observed difference distribution and can resolve ` +
        `smaller effects when arms are highly correlated. The MDE answers "how big ` +
        `an effect should I plan to need"; the CI answers "did I find one".`,
    );
    out.push("");
  }

  out.push(`---`);
  out.push("");
  out.push(
    `Generated by \`scripts/sweep.ts\`. Reproduce any row with ` +
      `\`npm run eval:compare -- ${baseline.variantName} <variant> --local\`.`,
  );
  out.push("");
  return out.join("\n");
}

// --- Main --------------------------------------------------------------------

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // Validate every config BEFORE running anything. A typo in the last of nine
  // arms should not surface after the first eight have executed.
  const variants = new Map<string, Variant>();
  for (const name of args.variants) variants.set(name, loadVariant(name));

  const questions = loadGoldenSet().questions;

  console.log(
    `\nSweep: ${args.variants.join(", ")}\n` +
      `  baseline    ${args.baseline}\n` +
      `  mode        ${args.reuse ? "REUSE latest runs (nothing executed)" : "run each sequentially"}\n` +
      `  seed        ${args.seed}, ${args.iters} resamples, α=${args.alpha}\n`,
  );

  const runs: LoadedRun[] = [];
  for (const name of args.variants) {
    if (args.reuse) {
      runs.push(resolveLocal(name, readLocalRuns()));
    } else {
      console.log(`\n── ${name} ──────────────────────────────────────────`);
      runs.push(runVariant(name, args));
    }
  }

  const baseline = runs.find((r) => r.variantName === args.baseline);
  if (!baseline) throw new Error(`Baseline "${args.baseline}" is not among the runs.`);

  const metric = pickMetric(runs, args.metric);
  const report = buildReport(
    runs,
    variants,
    baseline,
    metric,
    questions,
    args,
    gitSha(),
  );

  // Default to the path the spec names. Note that eval/runs/ is gitignored, so
  // a report meant to be committed needs --out — hence the flag, and hence this
  // line saying so rather than leaving someone to discover it via git status.
  const outPath =
    args.out ??
    path.join(RUNS_DIR, `sweep-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, report);

  const totalCost = runs.reduce(
    (s, run) => s + run.results.reduce((t, r) => t + (r.costUsd ?? 0), 0),
    0,
  );
  const totalDegraded = runs.reduce((s, r) => s + degradedCount(r), 0);

  console.log(`\n── Sweep complete ──────────────────────────────────────`);
  console.log(`  arms          ${runs.length}`);
  console.log(`  questions     ${runs.reduce((s, r) => s + r.results.length, 0)}`);
  console.log(`  TOTAL COST    ${money(totalCost)}`);
  if (totalDegraded > 0) {
    console.log(`  ⚠ degraded    ${totalDegraded} question(s) across the sweep`);
  }
  console.log(`\n  Wrote ${outPath}`);
  if (!args.out && outPath.startsWith(RUNS_DIR)) {
    console.log(`  NOTE: ${RUNS_DIR}/ is gitignored. Use --out docs/... to commit it.`);
  }
  console.log("");
}

try {
  main();
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
}
