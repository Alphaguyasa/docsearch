/**
 * Eval runner — Phase 4 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:run -- --variant baseline
 *                       [--subset 10] [--types factoid,multihop]
 *                       [--concurrency 4] [--no-cache] [--notes "..."]
 *                       [--no-judge] [--retrieval-only] [--holdout] [--skip-db]
 *                       [--gate <runId|variant>]
 *
 * `--gate` compares the finished run against a baseline and exits non-zero if a
 * guarded metric regressed — Phase 7. Thresholds live in eval/config/gate.json.
 * A drop only counts when its paired 95% CI excludes zero, so noise cannot fail
 * a build; see eval/src/gate.ts for why that rule is the whole design.
 *
 * `--retrieval-only` stops after retrieval: no generation, no judging, no LLM
 * quota beyond an optional query rewrite. Most Phase 6 experiments change
 * nothing downstream of retrieval, so this is the difference between a sweep
 * taking an afternoon and taking weeks.
 *
 * Runs the DEV split by default. `--holdout` is a one-time measurement and says
 * so loudly — see eval/src/goldenset.ts.
 *
 * DURABILITY: each result is appended to eval/runs/<runId>.jsonl the moment the
 * question finishes, before anything else can fail. A crash at question 87
 * keeps the first 86. Supabase is written after, because disk is the source of
 * truth for a single run and the database is the source of truth for history —
 * so a database outage degrades the run to disk-only rather than ending it.
 */
import "../../src/lib/loadenv";

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { aggregate, flattenAggregate, type Aggregate } from "./aggregate";
import { cacheStats, setCacheEnabled } from "./cache";
import { loadVariant } from "./config";
import {
  DEFAULT_GATE,
  evaluateGate,
  worstRegressions,
  type GateConfig,
} from "./gate";
import { readLocalRuns, resolveLocal } from "./runs";
import { loadGoldenSet, warnHoldout } from "./goldenset";
import { judgeAll, judgeScoresToMetrics, type JudgeScores } from "./metrics/judge";
import { scoreRetrieval } from "./metrics/retrieval";
import { runPipeline } from "./pipeline";
import { pacerState, QuotaExhaustedError } from "./provider";
import { createRun, finishRun, syncQuestions, upsertResults } from "./store";
import type { Question, QuestionResult, QuestionType, Run, Variant } from "./types";

const RUNS_DIR = "eval/runs";

interface Args {
  variant: string;
  subset: number | undefined;
  types: Set<QuestionType> | undefined;
  concurrency: number;
  useCache: boolean;
  notes: string | null;
  judge: boolean;
  holdout: boolean;
  skipDb: boolean;
  /** Baseline run id or variant name to gate against. */
  gate: string | null;
  retrievalOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    variant: "baseline",
    subset: undefined,
    types: undefined,
    concurrency: 4,
    useCache: true,
    notes: null,
    judge: true,
    holdout: false,
    skipDb: false,
    gate: null,
    retrievalOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--no-cache") args.useCache = false;
    else if (flag === "--no-judge") args.judge = false;
    else if (flag === "--holdout") args.holdout = true;
    else if (flag === "--skip-db") args.skipDb = true;
    else if (flag === "--retrieval-only") {
      args.retrievalOnly = true;
      // Judging scores an answer that was never generated. Implied rather than
      // left as a combination that silently produces a page of nulls.
      args.judge = false;
    }
    else {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} requires a value`);
      }
      if (flag === "--gate") args.gate = value;
      else if (flag === "--variant") args.variant = value;
      else if (flag === "--notes") args.notes = value;
      else if (flag === "--subset") args.subset = requirePositive(value, flag);
      else if (flag === "--concurrency") args.concurrency = requirePositive(value, flag);
      else if (flag === "--types") {
        args.types = new Set(
          value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean) as QuestionType[],
        );
      } else throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function requirePositive(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} must be a positive number`);
  return n;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    // Recorded explicitly rather than left blank: the Phase 7 gate compares
    // runs across SHAs and cannot place a run that has none.
    return "unknown";
  }
}

/**
 * Stratified subset: proportional from each type, not the first N.
 *
 * `--subset 10` off the top of a type-ordered file would be ten factoids and
 * zero unanswerable questions — a smoke run that never exercises refusal, the
 * highest-signal bucket in the set. Deterministic (no shuffle), so the same
 * subset re-runs against the same cache entries.
 */
export function selectSubset(questions: Question[], n: number): Question[] {
  if (n >= questions.length) return questions;

  const byType = new Map<string, Question[]>();
  for (const q of questions) {
    const list = byType.get(q.type);
    if (list) list.push(q);
    else byType.set(q.type, [q]);
  }

  const quota = new Map<string, Question[]>();
  for (const [type, group] of byType) {
    const share = Math.max(1, Math.round((group.length / questions.length) * n));
    quota.set(type, group.slice(0, share));
  }

  // Rounding up per bucket overshoots. Trim from the LARGEST bucket down, never
  // below one per type — trimming by file order instead drops whichever type
  // happens to sit late in the file, which on a real run silently removed every
  // unanswerable question from a `--subset 6` and reported refusal accuracy as
  // "no data". That is exactly the failure stratifying is meant to prevent.
  let total = [...quota.values()].reduce((s, g) => s + g.length, 0);
  while (total > n) {
    const largest = [...quota.entries()]
      .filter(([, g]) => g.length > 1)
      .sort((a, b) => b[1].length - a[1].length)[0];
    if (!largest) break;
    largest[1].pop();
    total--;
  }

  const order = new Map(questions.map((q, i) => [q.id, i]));
  return [...quota.values()]
    .flat()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Bounded-concurrency map preserving input order in the output. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return out;
}

class Progress {
  private done = 0;
  private failed = 0;
  private readonly startedAt = Date.now();

  constructor(private readonly total: number) {}

  tick(errored: boolean): void {
    this.done++;
    if (errored) this.failed++;

    const width = 28;
    const filled = Math.round((this.done / this.total) * width);
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const rate = this.done / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? ((this.total - this.done) / rate) * 1000 : 0;

    process.stdout.write(
      `\r  [${"#".repeat(filled)}${".".repeat(width - filled)}] ` +
        `${this.done}/${this.total}` +
        (this.failed > 0 ? `  ${this.failed} error(s)` : "") +
        `  eta ${formatDuration(eta)}      `,
    );
  }

  finish(): void {
    process.stdout.write("\n");
  }
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Set once a per-DAY quota wall is hit.
 *
 * A daily cap is not a per-question failure: every remaining question will fail
 * the same way, and recording 30 identical "quota exhausted" rows produces a run
 * whose aggregate looks like a catastrophic regression rather than an
 * interrupted measurement. A real run hit this and logged the same error 34
 * times before finishing. Once the wall is seen, the rest of the run
 * short-circuits and the summary says plainly that it was cut short.
 */
let quotaWall: string | null = null;

/** One question, end to end. Never throws — a failure becomes `error`. */
async function runQuestion(
  question: Question,
  variant: Variant,
  useJudge: boolean,
  retrievalOnly: boolean,
): Promise<QuestionResult> {
  if (quotaWall !== null) {
    return {
      questionId: question.id,
      retrieved: [],
      answer: "",
      citations: [],
      metrics: {},
      costUsd: 0,
      latency: { embedMs: 0, searchMs: 0, rerankMs: 0, generateMs: 0, totalMs: 0 },
      error: `skipped — ${quotaWall}`,
    };
  }

  try {
    const pipeline = await runPipeline(question.question, variant, { retrievalOnly });

    const metrics: Record<string, number | null> = {
      ...scoreRetrieval(pipeline.retrieved, question),
    };
    // Meaningless without an answer — omitted rather than reported as 0, which
    // would read as "the model cited nothing wrong" instead of "not measured".
    if (!retrievalOnly) metrics.danglingCitations = pipeline.danglingCitations;

    const cost = { ...pipeline.cost };

    // Kept, not just consumed. Flattening the scores into `metrics` and letting
    // the object fall out of scope threw away every claim, verdict and reason
    // behind the four numbers — and with them Phase 3, which compares what the
    // MODEL said against what a human says. See QuestionResult.judge.
    let judge: JudgeScores | null = null;
    if (useJudge) {
      judge = await judgeAll(question, pipeline.answer, pipeline.retrieved);
      Object.assign(metrics, judgeScoresToMetrics(judge));
      cost.judge += judge.costUsd;
      cost.total = cost.embed + cost.rerank + cost.generate + cost.judge;
    }

    return {
      questionId: question.id,
      retrieved: pipeline.retrieved,
      answer: pipeline.answer,
      citations: pipeline.citations,
      metrics,
      costUsd: cost.total,
      cost,
      latency: pipeline.latency,
      degraded: pipeline.degraded,
      judge,
      error: null,
    };
  } catch (err) {
    // A daily quota wall stops the run; everything else is per-question.
    if (err instanceof QuotaExhaustedError) quotaWall = err.message;
    // One bad question must never end a run — a two-hour run lost to a
    // transient 500 is unrecoverable work, and the spec is explicit about it.
    return {
      questionId: question.id,
      retrieved: [],
      answer: "",
      citations: [],
      metrics: {},
      costUsd: 0,
      latency: { embedMs: 0, searchMs: 0, rerankMs: 0, generateMs: 0, totalMs: 0 },
      error: errorMessage(err),
    };
  }
}

function printSummary(
  agg: Aggregate,
  variant: Variant,
  runId: string,
  retrievalOnly: boolean,
): void {
  const pct = (v: number | null): string =>
    v === null ? "—" : `${(v * 100).toFixed(1)}%`;
  const money = (v: number): string => `$${v.toFixed(4)}`;

  console.log(`\n── Run ${runId} ──`);
  console.log(
    `  variant   ${variant.name} (${variant.retrieval.mode}, topK ${variant.retrieval.topK})`,
  );
  console.log(
    `  questions ${agg.questions}${agg.errors > 0 ? `   ⚠ ${agg.errors} error(s)` : ""}`,
  );

  if (agg.degraded > 0) {
    // Loud, because the failure this catches is invisible in every other line
    // of the summary: a degraded question scores like any other, just worse.
    console.log(
      `\n╔══════════════════════════════════════════════════════════════════╗\n` +
        `║  DEGRADED RETRIEVAL — THIS RUN IS NOT COMPARABLE TO A CLEAN ONE  ║\n` +
        `╚══════════════════════════════════════════════════════════════════╝\n` +
        `  ${agg.degraded} of ${agg.questions} question(s) lost one of hybrid retrieval's\n` +
        `  two sources and were fused from the survivor alone. They still\n` +
        `  scored, and their scores are in every mean below.\n` +
        `  Re-run before quoting these numbers — the cache replays the healthy\n` +
        `  questions for free, so only the failures cost anything.`,
    );
  }

  console.log("\n── Retrieval — answerable questions only ───────────────");
  for (const key of Object.keys(agg.retrieval).sort()) {
    console.log(`  ${key.padEnd(22)} ${pct(agg.retrieval[key]).padStart(7)}`);
  }

  if (retrievalOnly) {
    // A table of dashes reads as "the judges failed". Say what happened.
    console.log("\n── Judges ──────────────────────────────────────────────");
    console.log("  not run — --retrieval-only skips generation and judging.");
  } else {
    console.log("\n── Judges ──────────────────────────────────────────────");
    console.log(`  faithfulness           ${pct(agg.faithfulness).padStart(7)}`);
    console.log(`  correctness            ${pct(agg.correctness).padStart(7)}`);
    console.log(`  citationAccuracy       ${pct(agg.citationAccuracy).padStart(7)}`);
    console.log(
      `  refusalAccuracy        ${pct(agg.refusalAccuracy).padStart(7)}   unanswerable only`,
    );
  }

  console.log("\n── Latency (ms) ────────────────────────────────────────");
  console.log(`  ${"stage".padEnd(12)} ${"p50".padStart(8)} ${"p95".padStart(8)}`);
  for (const [key, value] of Object.entries(agg.latency)) {
    console.log(
      `  ${key.padEnd(12)} ${String(value.p50).padStart(8)} ${String(value.p95).padStart(8)}`,
    );
  }

  console.log("\n── Cost ────────────────────────────────────────────────");
  for (const [stage, value] of Object.entries(agg.cost)) {
    console.log(`  ${stage.padEnd(13)} ${money(value).padStart(10)}`);
  }
  console.log(`  ${"TOTAL".padEnd(13)} ${money(agg.costUsd).padStart(10)}`);
  console.log(`  ${"per question".padEnd(13)} ${money(agg.costPerQuestion).padStart(10)}`);

  const { hits, misses } = cacheStats();
  const pace = pacerState();
  console.log(`\n  cache: ${hits} hit(s), ${misses} miss(es)`);
  if (pace.requests > 0) {
    console.log(
      `  paced: ${pace.requests} LLM request(s), ` +
        `${(pace.waitedMs / 1000).toFixed(0)}s waiting`,
    );
  }
}

/**
 * Compare this run against a baseline and print a pass/fail summary.
 *
 * Returns whether the run may land. Everything printed here is for a human;
 * the caller turns the boolean into an exit code, which is what CI reads.
 */
function runGate(
  baselineRef: string,
  current: { results: QuestionResult[]; aggregate: Record<string, number | null> },
  cache: { hits: number; misses: number },
): boolean {
  const runs = readLocalRuns();
  let baseline;
  try {
    baseline = resolveLocal(baselineRef, runs);
  } catch (err) {
    console.log(
      `\n── Gate ────────────────────────────────────────────────\n` +
        `  CANNOT GATE: ${errorMessage(err)}\n` +
        `  A gate that cannot find its baseline must not pass by default.\n`,
    );
    return false;
  }

  const numeric = (o: Record<string, number | null>): Record<string, number> =>
    Object.fromEntries(
      Object.entries(o).filter((e): e is [string, number] => typeof e[1] === "number"),
    );

  const config = loadGateConfig();
  const total = cache.hits + cache.misses;
  const verdict = evaluateGate({
    baseline: { results: baseline.results, aggregate: baseline.aggregate ?? {} },
    run: { results: current.results, aggregate: numeric(current.aggregate) },
    config,
    // The baseline's cache state is not recoverable from its file, so this is
    // deliberately one-sided: it reports what THIS run did and lets the reader
    // judge. Claiming to know both would be worse than admitting to one.
    runCacheHitRate: total > 0 ? cache.hits / total : undefined,
  });

  console.log(`\n── Gate ────────────────────────────────────────────────`);
  console.log(`  baseline ${baseline.runId.slice(0, 8)} (${baseline.variantName})`);
  if (verdict.warning) console.log(`\n  ⚠ ${verdict.warning}`);

  for (const f of verdict.findings) {
    const mark = f.failed ? "FAIL" : "ok  ";
    const shown =
      f.kind === "quality"
        ? `${(f.before * 100).toFixed(1)}% → ${(f.after * 100).toFixed(1)}%  ` +
          `${f.delta >= 0 ? "+" : ""}${(f.delta * 100).toFixed(1)}pp` +
          (f.ci ? `  95% CI [${(f.ci.lo * 100).toFixed(1)}, ${(f.ci.hi * 100).toFixed(1)}]pp` : "")
        : `${f.before.toFixed(f.before < 1 ? 4 : 0)} → ${f.after.toFixed(f.after < 1 ? 4 : 0)}  ` +
          `${f.delta >= 0 ? "+" : ""}${(f.delta * 100).toFixed(1)}%`;
    console.log(`  ${mark} ${f.metric.padEnd(16)} ${shown}`);
    if (f.note) console.log(`       ${f.note}`);
  }

  if (verdict.missing.length > 0) {
    console.log(
      `\n  NOT GATED (neither run measured them): ${verdict.missing.join(", ")}\n` +
        `  A retrieval-only run has no judge metrics, so this is expected there —\n` +
        `  but a metric silently absent from a gate is a metric nobody is guarding.`,
    );
  }

  for (const f of verdict.findings.filter((x) => x.failed && x.kind === "quality")) {
    const worst = worstRegressions(f.metric, { results: baseline.results }, current, 5);
    if (worst.length === 0) continue;
    console.log(`\n  Worst on ${f.metric}:`);
    for (const w of worst) {
      console.log(
        `    ${w.questionId}  ${(w.before * 100).toFixed(0)}% → ${(w.after * 100).toFixed(0)}%` +
          `  (${(w.delta * 100).toFixed(0)}pp)`,
      );
    }
  }

  console.log(
    verdict.passed
      ? `\n  PASS — nothing regressed past its threshold with a CI excluding zero.\n`
      : `\n  FAIL — ${verdict.findings.filter((f) => f.failed).length} metric(s) regressed.\n`,
  );
  return verdict.passed;
}

/** Thresholds from eval/config/gate.json, falling back to the documented defaults. */
function loadGateConfig(): GateConfig {
  const file = "eval/config/gate.json";
  if (!existsSync(file)) {
    console.log(`  (${file} not found — using built-in defaults)`);
    return DEFAULT_GATE;
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<GateConfig>;
  return {
    quality: parsed.quality ?? DEFAULT_GATE.quality,
    resource: parsed.resource ?? DEFAULT_GATE.resource,
    iters: parsed.iters ?? DEFAULT_GATE.iters,
    seed: parsed.seed ?? DEFAULT_GATE.seed,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  setCacheEnabled(args.useCache);

  const variant = loadVariant(args.variant);

  const loaded = loadGoldenSet({ holdout: args.holdout });
  warnHoldout(loaded);

  let questions = loaded.questions;
  if (args.types) questions = questions.filter((q) => args.types!.has(q.type));
  if (args.subset) questions = selectSubset(questions, args.subset);

  if (questions.length === 0) {
    throw new Error(
      `No questions selected from ${loaded.file}` +
        (args.types ? ` for types: ${[...args.types].join(", ")}` : ""),
    );
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const sha = gitSha();
  const outFile = path.join(RUNS_DIR, `${runId}.jsonl`);
  mkdirSync(RUNS_DIR, { recursive: true });

  // Header first, so even a truncated file identifies the run that wrote it.
  writeFileSync(
    outFile,
    JSON.stringify({
      type: "run",
      runId,
      gitSha: sha,
      variant,
      startedAt,
      source: loaded.file,
      isHoldout: loaded.isHoldout,
      questionCount: questions.length,
    }) + "\n",
  );

  console.log(
    `\nRun ${runId}\n` +
      `  variant     ${variant.name} — ${variant.description}\n` +
      `  questions   ${questions.length} from ${loaded.file}\n` +
      `  retrieval   ${variant.retrieval.mode}, topK ${variant.retrieval.topK}` +
      `, rrfK ${variant.retrieval.rrfK ?? "default"}` +
      (variant.retrieval.rerank
        ? `, rerank ${variant.retrieval.rerank.model} top ${variant.retrieval.rerank.topN}`
        : "") +
      `\n  rewrite     ${variant.queryRewrite}\n` +
      `  generation  ${
        args.retrievalOnly
          ? "SKIPPED — --retrieval-only"
          : `${variant.generation.model} (prompt ${variant.generation.promptVersion})`
      }\n` +
      `  judges      ${
        args.retrievalOnly ? "n/a" : args.judge ? "on" : "off (--no-judge)"
      }\n` +
      `  concurrency ${args.concurrency}, cache ${args.useCache ? "on" : "bypassed"}\n`,
  );

  const run: Run = {
    runId,
    gitSha: sha,
    variant,
    startedAt,
    finishedAt: "",
    results: [],
    aggregate: {},
  };

  let persist = !args.skipDb;
  if (persist) {
    try {
      await syncQuestions(questions);
      await createRun(run);
    } catch (err) {
      // Disk is the source of truth for one run; a database problem must not
      // stop it. Reported, then the run continues to disk only.
      console.warn(
        `  ⚠ Supabase unavailable (${errorMessage(err)}) — writing to disk only.\n`,
      );
      persist = false;
    }
  }

  const progress = new Progress(questions.length);
  const results = await mapWithConcurrency(questions, args.concurrency, async (question) => {
    const result = await runQuestion(question, variant, args.judge, args.retrievalOnly);
    // Appended BEFORE anything else can fail. This is the durability guarantee.
    appendFileSync(outFile, JSON.stringify({ type: "result", ...result }) + "\n");
    progress.tick(result.error !== null);
    return result;
  });
  progress.finish();

  const agg = aggregate(results, questions);
  const finishedAt = new Date().toISOString();
  const flat = flattenAggregate(agg);

  appendFileSync(
    outFile,
    JSON.stringify({ type: "aggregate", runId, finishedAt, aggregate: flat }) + "\n",
  );

  if (persist) {
    try {
      await upsertResults(runId, results);
      await finishRun(runId, finishedAt, flat, args.notes);
    } catch (err) {
      console.warn(`\n  ⚠ Supabase write failed: ${errorMessage(err)}`);
      console.warn(`    Results are intact at ${outFile}.`);
    }
  }

  printSummary(agg, variant, runId, args.retrievalOnly);

  const errored = results.filter((r) => r.error !== null);

  if (quotaWall !== null) {
    const skipped = results.filter((r) => r.error?.startsWith("skipped —")).length;
    console.log(
      `\n╔══════════════════════════════════════════════════════════════════╗\n` +
        `║  RUN CUT SHORT BY A DAILY QUOTA — AGGREGATES ARE NOT COMPARABLE  ║\n` +
        `╚══════════════════════════════════════════════════════════════════╝\n` +
        `  ${quotaWall}\n` +
        `  ${results.length - errored.length} of ${results.length} question(s) completed; ` +
        `${skipped} skipped after the wall.\n` +
        `  Completed questions ARE cached — re-running after the reset replays\n` +
        `  them free and only spends quota on what is missing.\n`,
    );
  }

  if (errored.length > 0) {
    console.log(`\n── Errors (${errored.length}) ──────────────────────────`);
    for (const r of errored.slice(0, 5)) console.log(`  ${r.questionId}: ${r.error}`);
    if (errored.length > 5) console.log(`  ... and ${errored.length - 5} more`);
  }

  console.log(`\nWrote ${outFile}\n`);

  if (args.gate) {
    const passed = runGate(args.gate, { results, aggregate: flat }, cacheStats());
    // The exit code is the entire product of a gate. Everything above is for a
    // human; this is what CI reads.
    if (!passed) process.exitCode = 1;
  }
}

/**
 * True only when this file is the process entry point, not when it is imported.
 *
 * WITHOUT THIS GUARD, IMPORTING THE MODULE STARTS A LIVE RUN. `main()` used to
 * be called unconditionally at the bottom of this file, and `runner.test.ts`
 * imports `selectSubset` and `mapWithConcurrency` from here — so
 * `npm run test:eval` launched a full 76-question judged run against Supabase
 * and the free-tier LLM quota as a side effect of collecting unit tests. The
 * worker was killed when the suite finished a second or two later, which is why
 * it never announced itself: no error, no summary, just a partially-written run.
 *
 * That is where the empty run files came from — 30 of the 76 in eval/runs/,
 * one per test invocation, spread across a dozen git SHAs. And it is the ROOT
 * CAUSE of the bug patched downstream in scripts/calibrate-judge.ts, which
 * picked an arbitrary uuid-sorted run and landed on one of these husks. That
 * fix stopped calibration reading them; this one stops them being written.
 *
 * `process.argv[1]` is the resolved script path under tsx, so comparing it as a
 * file URL is the ESM equivalent of `require.main === module`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isEntryPoint()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
