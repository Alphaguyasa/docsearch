/**
 * Retrieval evaluation harness.
 *
 *   npm run eval -- [--mode vector|keyword|hybrid] [--delay <ms>]
 *
 * Runs retrieve() for every ANSWERABLE question in evals/questions.jsonl and
 * scores the ranked top-10 against each question's expected document + pages.
 * Reports recall@1/@5/@10 and MRR, overall and broken down by difficulty, flags
 * every question with no hit in the top 10, and writes the full result set to
 * evals/results/<timestamp>-<mode>.json.
 *
 * The five unanswerable questions (expected_doc: null) test refusal, not
 * retrieval — they are excluded from every metric and reported separately.
 *
 * This harness only CALLS retrieve(); it does not modify retrieval code.
 *
 * --delay paces requests: Voyage's free tier allows ~3 embeddings/min, so
 * vector/hybrid runs need a delay (e.g. --delay 20000) to avoid 429s. keyword
 * mode uses no embeddings and needs no delay.
 */
import "../src/lib/loadenv"; // must precede modules that read env

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { retrieve, type RetrieveMode, type RetrievedChunk } from "../src/lib/retrieve";

const MODES: RetrieveMode[] = ["hybrid", "vector", "keyword"];
const TOP_K = 10; // deepest cutoff we measure (recall@10 / MRR@10)
const RESULTS_DIR = "evals/results";

interface Question {
  id: string;
  question: string;
  expected_doc: string | null;
  expected_pages: number[];
  difficulty: string;
  notes: string;
}

interface QuestionResult {
  id: string;
  difficulty: string;
  question: string;
  expected_doc: string;
  expected_pages: number[];
  /** 1-based rank of the first relevant chunk in the top 10, or null if none. */
  firstHitRank: number | null;
  hitAt1: boolean;
  hitAt5: boolean;
  hitAt10: boolean;
  degraded: boolean;
  /** What actually came back (top 3), for diagnosing misses. */
  topReturned: { filename: string; pageNumber: number | null }[];
}

interface Metrics {
  n: number;
  recallAt1: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
}

interface Args {
  mode: RetrieveMode;
  delayMs: number;
  /** Optional tag for the output filename and payload, e.g. an experiment name. */
  label: string | null;
}

function parseArgs(argv: string[]): Args {
  let mode: RetrieveMode = "hybrid";
  let delayMs = 0;
  let label: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") {
      const value = argv[++i];
      if (!MODES.includes(value as RetrieveMode)) {
        throw new Error(`--mode must be one of: ${MODES.join(", ")}`);
      }
      mode = value as RetrieveMode;
    } else if (arg === "--delay") {
      delayMs = Number(argv[++i]);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("--delay must be a non-negative number of milliseconds");
      }
    } else if (arg === "--label") {
      const value = argv[++i];
      if (!value) throw new Error("--label requires a value");
      label = value.replace(/[^a-zA-Z0-9._-]/g, "-"); // keep it filename-safe
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { mode, delayMs, label };
}

function loadQuestions(): Question[] {
  return readFileSync("evals/questions.jsonl", "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Question);
}

/** A chunk is relevant iff it is from the expected document AND on an expected page. */
function isHit(chunk: RetrievedChunk, q: Question): boolean {
  return (
    q.expected_doc !== null &&
    chunk.filename === q.expected_doc &&
    chunk.pageNumber !== null &&
    q.expected_pages.includes(chunk.pageNumber)
  );
}

/** Aggregate recall@k and MRR@10 over a set of per-question results. */
function summarize(results: QuestionResult[]): Metrics {
  const n = results.length;
  if (n === 0) {
    return { n: 0, recallAt1: 0, recallAt5: 0, recallAt10: 0, mrr: 0 };
  }
  const rate = (pred: (r: QuestionResult) => boolean): number =>
    results.filter(pred).length / n;

  const mrr =
    results.reduce(
      (sum, r) => sum + (r.firstHitRank !== null ? 1 / r.firstHitRank : 0),
      0,
    ) / n;

  return {
    n,
    recallAt1: rate((r) => r.hitAt1),
    recallAt5: rate((r) => r.hitAt5),
    recallAt10: rate((r) => r.hitAt10),
    mrr,
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(q: Question, mode: RetrieveMode): Promise<QuestionResult> {
  const { results, degraded } = await retrieve(q.question, { mode, limit: TOP_K });

  let firstHitRank: number | null = null;
  for (let i = 0; i < results.length; i++) {
    if (isHit(results[i], q)) {
      firstHitRank = i + 1;
      break;
    }
  }

  return {
    id: q.id,
    difficulty: q.difficulty,
    question: q.question,
    expected_doc: q.expected_doc as string,
    expected_pages: q.expected_pages,
    firstHitRank,
    hitAt1: firstHitRank !== null && firstHitRank <= 1,
    hitAt5: firstHitRank !== null && firstHitRank <= 5,
    hitAt10: firstHitRank !== null && firstHitRank <= 10,
    degraded,
    topReturned: results.slice(0, 3).map((c) => ({
      filename: c.filename,
      pageNumber: c.pageNumber,
    })),
  };
}

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + "%";
}

function printMetricsRow(label: string, m: Metrics): void {
  console.log(
    `  ${label.padEnd(10)} n=${String(m.n).padStart(2)}   ` +
      `R@1 ${pct(m.recallAt1)}   R@5 ${pct(m.recallAt5)}   ` +
      `R@10 ${pct(m.recallAt10)}   MRR ${m.mrr.toFixed(3)}`,
  );
}

async function main(): Promise<void> {
  const { mode, delayMs, label } = parseArgs(process.argv.slice(2));
  const questions = loadQuestions();

  const answerable = questions.filter((q) => q.expected_doc !== null);
  const unanswerable = questions.filter((q) => q.expected_doc === null);

  console.log(
    `\nEvaluating retrieval — mode=${mode}, ${answerable.length} answerable ` +
      `question(s)${delayMs ? `, ${delayMs}ms delay` : ""}\n`,
  );

  const results: QuestionResult[] = [];
  for (const q of answerable) {
    const r = await evaluate(q, mode);
    results.push(r);
    const rank = r.firstHitRank === null ? "MISS" : `#${r.firstHitRank}`;
    console.log(
      `  ${q.id}  ${q.difficulty.padEnd(6)}  ${rank.padStart(5)}` +
        `${r.degraded ? "  ⚠ degraded" : ""}`,
    );
    if (delayMs) await sleep(delayMs);
  }

  // Overall + per-difficulty breakdown.
  const overall = summarize(results);
  const difficulties = [...new Set(results.map((r) => r.difficulty))].sort();
  const byDifficulty: Record<string, Metrics> = {};
  for (const d of difficulties) {
    byDifficulty[d] = summarize(results.filter((r) => r.difficulty === d));
  }

  const misses = results.filter((r) => r.firstHitRank === null);
  const degradedCount = results.filter((r) => r.degraded).length;

  console.log("\n── Metrics ─────────────────────────────────────────────");
  printMetricsRow("overall", overall);
  console.log("  by difficulty:");
  for (const d of difficulties) printMetricsRow("  " + d, byDifficulty[d]);

  if (misses.length > 0) {
    console.log(`\n── Misses (no hit in top ${TOP_K}) ─────────────────────`);
    for (const m of misses) {
      console.log(`  ${m.id} [${m.difficulty}] ${m.question}`);
      console.log(
        `      expected ${m.expected_doc} pages ${JSON.stringify(m.expected_pages)}`,
      );
      const got = m.topReturned
        .map((t) => `${t.filename}:${t.pageNumber ?? "-"}`)
        .join(", ");
      console.log(`      top returned: ${got || "(none)"}`);
    }
  }

  if (degradedCount > 0) {
    console.log(
      `\n⚠ ${degradedCount} question(s) ran with DEGRADED retrieval (a search ` +
        `arm failed — likely a Voyage rate limit). Metrics may understate ` +
        `${mode} quality; re-run with a larger --delay.`,
    );
  }

  console.log(
    `\n── Unanswerable (excluded from retrieval metrics) ──────`,
  );
  console.log(
    `  ${unanswerable.length} refusal-test question(s); these are evaluated by ` +
      `scripts/ask.ts --refusals, not here:`,
  );
  for (const u of unanswerable) console.log(`  ${u.id}  ${u.question}`);

  // Persist the full result set.
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = `${RESULTS_DIR}/${timestamp}-${mode}${label ? `-${label}` : ""}.json`;
  const payload = {
    mode,
    label,
    timestamp,
    delayMs,
    counts: {
      total: questions.length,
      answerable: answerable.length,
      unanswerable: unanswerable.length,
      degraded: degradedCount,
    },
    overall,
    byDifficulty,
    misses: misses.map((m) => ({
      id: m.id,
      question: m.question,
      difficulty: m.difficulty,
      expected_doc: m.expected_doc,
      expected_pages: m.expected_pages,
      topReturned: m.topReturned,
    })),
    perQuestion: results,
    unanswerable: unanswerable.map((u) => ({ id: u.id, question: u.question })),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nResults written to ${outPath}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
