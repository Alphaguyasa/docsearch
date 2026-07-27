/**
 * Judge calibration — Phase 3 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:calibrate -- [--run <runId>] [--sample 25] [--seed 42]
 *
 * Samples results from a completed run, asks YOU to label the same four
 * judgements the model made, then reports raw agreement and Cohen's kappa per
 * judge. Warns below kappa 0.6.
 *
 * This is the step that separates "I used an LLM judge" from "I validated my
 * LLM judge". Without it every downstream faithfulness and correctness number is
 * an unverified model opinion.
 *
 * Your labels are appended to eval/golden/judge-calibration.jsonl and reused, so
 * re-running after a prompt change re-measures against the SAME human labels —
 * which is the only way to tell whether the prompt improved or the judge merely
 * drifted somewhere else.
 */
import "../src/lib/loadenv";

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { mulberry32, shuffle } from "../eval/src/corpus";
import { DEV_FILE, HOLDOUT_FILE, parseJsonl } from "../eval/src/goldenset";
import { readLocalRuns } from "../eval/src/runs";
import {
  cohensKappa,
  type Agreement,
  type JudgeScores,
} from "../eval/src/metrics/judge";
import type { Question, QuestionResult } from "../eval/src/types";

const RUNS_DIR = "eval/runs";
const LABELS_FILE = "eval/golden/judge-calibration.jsonl";
/**
 * Both halves, keyed by id — this is a LOOKUP, not a sample.
 *
 * Calibration labels judge outputs on results a run already produced; it reads
 * the golden set only to recover each question's text and expected answer. If a
 * holdout run is ever calibrated, its questions must resolve, and restricting
 * this to dev would silently drop them from the kappa. No selection happens
 * here, so there is nothing to leak.
 */
const GOLDEN_FILES = [DEV_FILE, HOLDOUT_FILE];

/** One human labelling of one result. Model labels are recorded alongside so a
 *  later prompt change can be compared against the same human judgement. */
interface CalibrationLabel {
  runId: string;
  questionId: string;
  labelledAt: string;
  human: {
    faithful: "faithful" | "unfaithful" | null;
    correctness: "correct" | "partial" | "incorrect" | null;
    citations: "all-valid" | "has-invalid" | null;
    refused: "refused" | "answered" | null;
  };
  model: {
    faithful: string | null;
    correctness: string | null;
    citations: string | null;
    refused: string | null;
  };
}

/**
 * The judges emit continuous scores; kappa needs categories. Binarising at
 * "perfect" is the honest cut for faithfulness and citations: anything less than
 * every claim supported, or every citation valid, is a defect worth catching.
 * State this in the writeup — the choice moves the number.
 */
function modelLabels(scores: JudgeScores): CalibrationLabel["model"] {
  const faith = scores.faithfulness?.ok ? scores.faithfulness.value : null;
  const corr = scores.correctness?.ok ? scores.correctness.value : null;
  const cite = scores.citationAccuracy?.ok ? scores.citationAccuracy.value : null;
  const ref = scores.refusal?.ok ? scores.refusal.value : null;

  return {
    faithful: faith ? (faith.score === 1 ? "faithful" : "unfaithful") : null,
    correctness: corr ? corr.verdict : null,
    citations: cite ? (cite.score === 1 ? "all-valid" : "has-invalid") : null,
    refused: ref ? (ref.refused ? "refused" : "answered") : null,
  };
}

interface StoredResult extends QuestionResult {
  /** Runs persist the raw judge output alongside the flattened metrics. */
  judge?: JudgeScores;
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

/** A result carries judge output if any of the four judges scored it. */
function isJudged(r: QuestionResult): boolean {
  if (r.error !== null) return false;
  return (
    r.metrics?.faithfulness != null ||
    r.metrics?.correctness != null ||
    r.metrics?.citationAccuracy != null ||
    r.metrics?.refusalAccuracy != null
  );
}

/**
 * Pick the run to calibrate against: the most recent one that actually has
 * judge output.
 *
 * PREVIOUS BEHAVIOUR WAS A BUG. This sorted filenames and took the last, with a
 * comment claiming run ids are timestamp-prefixed. They are `randomUUID()`
 * (runner.ts), so the "newest" run was whichever uuid sorted highest — and at
 * the time this was found, that was a run with ZERO results. Calibration with
 * no `--run` argument would have failed on an empty file.
 *
 * Two filters now, both load-bearing. Sorting by the header's `startedAt` makes
 * "most recent" mean what it says. Requiring judge output matters because most
 * runs in this project are `--retrieval-only` sweep arms with no judge scores
 * at all; picking one would present a reviewer with nothing to label.
 */
function latestRunFile(runId?: string): string {
  const runs = readLocalRuns();
  if (runs.length === 0) {
    throw new Error(
      `No run files in ${RUNS_DIR}. Produce one first with Phase 4's runner:\n` +
        `  npm run eval:run -- --variant baseline --subset 30`,
    );
  }

  if (runId) {
    const match = runs.find((r) => r.runId.startsWith(runId));
    if (!match) throw new Error(`No run file for id "${runId}" in ${RUNS_DIR}`);
    return match.file;
  }

  const judged = runs
    .filter((r) => r.results.some(isJudged))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (judged.length === 0) {
    throw new Error(
      `No run in ${RUNS_DIR} contains judge output.\n` +
        `  ${runs.length} run(s) found, all retrieval-only or empty.\n` +
        `  Calibration compares MODEL judgements against yours, so it needs a run\n` +
        `  that was judged:  npm run eval:run -- --variant baseline --subset 30`,
    );
  }

  const chosen = judged[0];
  console.log(
    `Calibrating against ${chosen.runId} (${chosen.variantName}, ` +
      `${chosen.results.filter(isJudged).length} judged of ${chosen.results.length}, ` +
      `started ${chosen.startedAt}).\n` +
      `Pass --run <id> to choose a different one.\n`,
  );
  return chosen.file;
}

function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function wrap(text: string, width = 76, indent = "  "): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

/**
 * Ask for one label. The model's verdict is deliberately NOT shown — seeing it
 * first anchors the human to it, and an anchored label inflates agreement while
 * measuring nothing.
 */
async function askLabel<T extends string>(
  question: string,
  options: { key: string; value: T; label: string }[],
): Promise<T | null> {
  const menu = options.map((o) => `[${o.key}] ${o.label}`).join("   ");
  for (;;) {
    const answer = await ask(`\n  ${question}\n  ${menu}   [?] skip\n  > `);
    if (answer === "?" || answer === "") return null;
    const chosen = options.find((o) => o.key === answer);
    if (chosen) return chosen.value;
    console.log("  Not one of the options.");
  }
}

interface Args {
  runId?: string;
  sample: number;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sample: 25, seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--run") {
      if (!value) throw new Error("--run requires a value");
      args.runId = value;
      i++;
    } else if (flag === "--sample") {
      args.sample = Number(value);
      i++;
      if (!Number.isFinite(args.sample) || args.sample <= 0) {
        throw new Error("--sample must be a positive number");
      }
    } else if (flag === "--seed") {
      args.seed = Number(value);
      i++;
      if (!Number.isFinite(args.seed)) throw new Error("--seed must be a number");
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function report(labels: CalibrationLabel[]): void {
  const judges: {
    name: string;
    pick: (l: CalibrationLabel) => { human: string | null; model: string | null };
  }[] = [
    { name: "faithfulness", pick: (l) => ({ human: l.human.faithful, model: l.model.faithful }) },
    { name: "correctness", pick: (l) => ({ human: l.human.correctness, model: l.model.correctness }) },
    { name: "citations", pick: (l) => ({ human: l.human.citations, model: l.model.citations }) },
    { name: "refusal", pick: (l) => ({ human: l.human.refused, model: l.model.refused }) },
  ];

  console.log("\n── Judge agreement ─────────────────────────────────────");
  console.log("  judge          n   raw agree    kappa");

  const weak: string[] = [];
  for (const judge of judges) {
    const pairs = labels
      .map(judge.pick)
      .filter((p): p is { human: string; model: string } => p.human !== null && p.model !== null);

    if (pairs.length === 0) {
      console.log(`  ${judge.name.padEnd(13)} —    (no labelled pairs)`);
      continue;
    }

    const agreement: Agreement = cohensKappa(
      pairs.map((p) => p.human),
      pairs.map((p) => p.model),
    );
    console.log(
      `  ${judge.name.padEnd(13)} ${String(agreement.n).padStart(2)}   ` +
        `${(agreement.rawAgreement * 100).toFixed(0).padStart(6)}%   ` +
        `${agreement.kappa.toFixed(2).padStart(6)}` +
        (agreement.weak ? "   ⚠ WEAK" : ""),
    );
    if (agreement.weak) weak.push(judge.name);
  }

  if (weak.length > 0) {
    console.log(
      `\n⚠ kappa below 0.6 for: ${weak.join(", ")}\n` +
        wrap(
          "That judge is not reliable enough to quote. For faithfulness the fix " +
            "is usually to make the atomic-claim decomposition more explicit in " +
            "the prompt — a judge that bundles several facts into one claim " +
            "cannot mark part of it unsupported. Tighten the prompt, then re-run " +
            "this against the same saved labels to see whether it actually moved.",
        ),
    );
  } else if (labels.length > 0) {
    console.log("\n✓ Every judge is at or above kappa 0.6. Report these in the writeup.");
  }

  console.log(
    "\n" +
      wrap(
        "Binarisation: faithfulness and citations are cut at perfect (every " +
          "claim supported / every citation valid); correctness uses the three " +
          "verdicts directly. That choice moves the number — state it alongside " +
          "the kappa.",
      ) +
      "\n",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const existing = readJsonl<CalibrationLabel>(LABELS_FILE);
  // Re-running after a prompt change must re-measure against the SAME human
  // labels, so previously labelled questions are never re-asked.
  const alreadyLabelled = new Set(existing.map((l) => `${l.runId}:${l.questionId}`));

  const runFile = latestRunFile(args.runId);
  const runId = path.basename(runFile, ".jsonl");

  // Filter to RESULT lines. A run file also carries a `run` header and an
  // `aggregate` footer, and neither has an `error` field — so the pool filter
  // below (`!r.error`) let them through. The labelling loop skips them via its
  // `!question || !judge` guard, so nothing crashed; the sample just came back
  // silently short. Asking for 25 and labelling 23 matters when the acceptance
  // criterion is 25.
  const results = readJsonl<StoredResult & { type?: string }>(runFile).filter(
    (r) => r.type === "result",
  );
  if (results.length === 0) {
    throw new Error(
      `${runFile} contains no result lines — the run produced nothing to label.`,
    );
  }

  const questions = new Map(
    GOLDEN_FILES.filter((f) => existsSync(f))
      .flatMap((f) => parseJsonl<Question>(f).rows)
      .map((q) => [q.id, q]),
  );

  const rand = mulberry32(args.seed);
  const pool = shuffle(
    results.filter((r) => !alreadyLabelled.has(`${runId}:${r.questionId}`) && !r.error),
    rand,
  ).slice(0, args.sample);

  console.log(`\nRun: ${runId}  —  ${results.length} result(s)`);
  console.log(`Already labelled: ${existing.length}.  To label now: ${pool.length}.\n`);

  if (pool.length === 0) {
    console.log("Nothing new to label — reporting on existing labels.");
    report(existing);
    return;
  }

  const collected: CalibrationLabel[] = [];

  for (const [i, result] of pool.entries()) {
    const question = questions.get(result.questionId);
    const judge = result.judge;
    if (!question || !judge) continue;

    console.clear();
    console.log("═".repeat(80));
    console.log(`  ${result.questionId}   ${question.type}   [${i + 1} of ${pool.length}]`);
    console.log("═".repeat(80));
    console.log("\nQUESTION");
    console.log(wrap(question.question));

    if (question.expectedAnswer) {
      console.log("\nREFERENCE ANSWER");
      console.log(wrap(question.expectedAnswer));
    }

    console.log("\nGENERATED ANSWER");
    console.log(wrap(result.answer || "(empty)"));

    if (result.retrieved.length > 0) {
      console.log("\nRETRIEVED PASSAGES (as numbered in the prompt)");
      for (const [j, chunk] of result.retrieved.entries()) {
        console.log(`\n  [${j + 1}] p.${chunk.page}  ${chunk.chunkId}`);
        console.log(wrap(chunk.text.slice(0, 600), 74, "      "));
      }
    }

    console.log("\n" + "─".repeat(80));
    console.log("  Label what YOU think. The model's verdict is hidden until after.");

    const human: CalibrationLabel["human"] = {
      faithful: null,
      correctness: null,
      citations: null,
      refused: null,
    };

    if (question.type === "unanswerable") {
      human.refused = await askLabel("Did the answer decline, or assert an answer?", [
        { key: "r", value: "refused" as const, label: "refused" },
        { key: "a", value: "answered" as const, label: "asserted an answer" },
      ]);
    } else {
      human.faithful = await askLabel(
        "Is EVERY claim in the answer supported by the passages above?",
        [
          { key: "y", value: "faithful" as const, label: "yes, all supported" },
          { key: "n", value: "unfaithful" as const, label: "no, something is not" },
        ],
      );
      if (question.expectedAnswer) {
        human.correctness = await askLabel("How does it compare to the reference answer?", [
          { key: "c", value: "correct" as const, label: "correct" },
          { key: "p", value: "partial" as const, label: "partial" },
          { key: "i", value: "incorrect" as const, label: "incorrect" },
        ]);
      }
      human.citations = await askLabel("Does every [n] point at a passage that supports it?", [
        { key: "y", value: "all-valid" as const, label: "yes, all valid" },
        { key: "n", value: "has-invalid" as const, label: "no, at least one is wrong" },
      ]);
    }

    const label: CalibrationLabel = {
      runId,
      questionId: result.questionId,
      labelledAt: new Date().toISOString(),
      human,
      model: modelLabels(judge),
    };
    collected.push(label);

    // Written after every item so an interrupted session keeps its work.
    mkdirSync(path.dirname(LABELS_FILE), { recursive: true });
    writeFileSync(
      LABELS_FILE,
      [...existing, ...collected].map((l) => JSON.stringify(l)).join("\n") + "\n",
    );
  }

  console.clear();
  console.log(`\nLabelled ${collected.length} result(s) → ${LABELS_FILE}`);
  report([...existing, ...collected]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
