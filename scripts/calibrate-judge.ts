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

import { execFileSync } from "node:child_process";
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
import { mcNemar } from "../eval/src/metrics/stats";
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

/**
 * THIS DECLARATION USED TO BE THE WHOLE BUG. It asserted that runs persist raw
 * judge output alongside the flattened metrics. They did not: the runner built
 * the scores, flattened them into `metrics`, and dropped the object — so
 * `result.judge` was `undefined` on every result ever written, the labelling
 * loop's `if (!question || !judge) continue` skipped all of them, and this
 * script would have reported kappa over zero pairs after showing a reviewer
 * nothing to label. A local interface can only describe what a file contains;
 * it cannot make it true. The field is now on QuestionResult and the runner
 * actually writes it.
 */
type StoredResult = QuestionResult;

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

/**
 * Why this result cannot be labelled against the CURRENT golden set, or null.
 *
 * A run is a photograph of the golden set as it was, and the golden set moves.
 * The unanswerable audit deleted q-0087, reclassified q-0090 from unanswerable
 * to factoid, and rewrote the text of two more — all AFTER the only 30-question
 * judged run on disk was produced. Labelling that run today would have asked for
 * a verdict on a question that no longer exists, and asked the refusal question
 * about one the golden set now calls a factoid.
 *
 * These are DROPPED, not skipped mid-loop, because the sample is sliced to
 * --sample before the labelling loop runs: a mid-loop `continue` spends a slot
 * and returns 24 labels from a request for 25. That is the same silent-shortfall
 * bug the header-line filter fixed, arriving by a different route.
 */
function staleness(result: StoredResult, questions: Map<string, Question>): string | null {
  const question = questions.get(result.questionId);
  if (!question) return "no longer in the golden set";
  if (!result.judge) return "no judge output";

  // Which judges ran is a record of what the golden set said at run time: the
  // refusal judge runs for unanswerable questions and the other three do not.
  const judgedUnanswerable = result.judge.refusal !== null;
  if (judgedUnanswerable !== (question.type === "unanswerable")) {
    return `judged as ${judgedUnanswerable ? "unanswerable" : "answerable"}, ` +
      `golden set now says ${question.type}`;
  }
  return null;
}

/**
 * Loud warning when the run predates the current golden set.
 *
 * The per-item check above catches deletions and type changes. It CANNOT catch
 * a rewritten question, because a run records only `questionId` — the answer was
 * generated against text nobody can recover from the run file. q-0086 is exactly
 * that: re-anchored to its intended paper by the audit, so its stored answer
 * addresses a question that is no longer on the page. A reviewer would label an
 * answer to a different question and never know.
 *
 * Commit ancestry is the available signal. If the commit that last touched the
 * golden set is not an ancestor of the run's SHA, the run is older than the
 * questions it would be labelled against.
 */
function warnIfPredatesGoldenSet(runSha: string | undefined): void {
  if (!runSha || runSha === "unknown") return;

  let goldenSha: string;
  try {
    goldenSha = execFileSync("git", ["log", "-1", "--format=%H", "--", DEV_FILE], {
      encoding: "utf8",
    }).trim();
    if (!goldenSha) return;
    // Exit 0 means goldenSha is an ancestor of runSha: the run already had it.
    execFileSync("git", ["merge-base", "--is-ancestor", goldenSha, runSha], {
      stdio: "ignore",
    });
    return;
  } catch {
    // Non-zero from --is-ancestor, or git unavailable / SHA not in this clone.
    // Only the first is worth reporting, and it is the common case.
  }

  console.log(
    `⚠ THIS RUN PREDATES THE CURRENT GOLDEN SET.\n` +
      wrap(
        `${DEV_FILE} was last changed at ${goldenSha!.slice(0, 8)}, which is not an ` +
          `ancestor of the run's ${runSha.slice(0, 8)}. Deleted and reclassified ` +
          `questions are dropped below, but a REWRITTEN question cannot be detected: ` +
          `a run stores only the question id, so its answer was generated against ` +
          `text that is no longer in the file, and labelling it judges an answer to a ` +
          `different question. Produce a fresh run before spending an hour labelling:`,
      ) +
      `\n\n  npm run eval:run -- --variant baseline --subset 30\n`,
  );
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
 *
 * WHAT IS SHOWN is an echo of the choice in plain words: "recorded: the answer
 * asserted a substantive answer". The first calibration pass produced four
 * labels saying exactly that about four IDENTICAL answers reading "This
 * question is not covered by these documents" — a misread of the prompt, held
 * for 25 items because nothing ever played the choice back. The echo reveals a
 * misunderstanding immediately and reveals nothing about what the model said.
 */
async function askLabel<T extends string>(
  question: string,
  options: { key: string; value: T; label: string; echo: string }[],
): Promise<T | null> {
  const menu = options.map((o) => `[${o.key}] ${o.label}`).join("   ");
  for (;;) {
    const answer = await ask(`\n  ${question}\n  ${menu}   [?] skip\n  > `);
    if (answer === "?" || answer === "") return null;
    const chosen = options.find((o) => o.key === answer);
    if (chosen) {
      console.log(`  recorded: ${chosen.echo}`);
      return chosen.value;
    }
    console.log("  Not one of the options.");
  }
}

interface Args {
  runId?: string;
  sample: number;
  seed: number;
  /** Re-render agreement over the saved labels, labelling nothing. */
  reportOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sample: 25, seed: 42, reportOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--report-only") {
      args.reportOnly = true;
    } else if (flag === "--run") {
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

/**
 * Share of labels in the most-used category, per rater.
 *
 * Kappa corrects for agreement expected by chance, and chance agreement rises
 * with skew: when one rater says "faithful" to everything, two raters agreeing
 * 85% of the time is no better than they would do at random, so kappa reads 0.
 * A low kappa therefore has two completely different causes with completely
 * different fixes, and the number alone does not distinguish them. This is what
 * tells them apart.
 */
function prevalence(labels: string[]): number {
  if (labels.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return Math.max(...counts.values()) / labels.length;
}

/** `faithful 18, unfaithful 2` — the marginals, printed rather than inferred. */
function distribution(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${label} ${n}`)
    .join(", ");
}

/** Above this share in one category, kappa is reporting the skew, not the judge. */
const SKEW_LIMIT = 0.9;

/**
 * Are the disagreements one-directional?
 *
 * THIS IS THE DISTINCTION KAPPA CANNOT MAKE, and getting it wrong sends you to
 * fix the wrong thing. A judge that disagrees with you at random is noisy; a
 * judge that disagrees with you ALWAYS IN THE SAME DIRECTION is systematically
 * lenient or strict, which is a defect with a size and a direction — and it can
 * hide under a low kappa that looks like the prevalence paradox.
 *
 * Measured here on the real first calibration: faithfulness disagreed 8 times
 * out of 20, and 7 of those 8 were "you say unsupported, judge says supported".
 * That is not chance agreement being eaten by skew. That is a judge accepting
 * claims a reviewer rejects, seven times to one.
 *
 * McNemar over the discordant pairs is the right test — the agreements carry no
 * information about direction — and it is the harness's own exact-binomial
 * implementation, which does not need the 25-discordant-pair floor the
 * chi-square version has.
 */
function directionalBias(
  pairs: { human: string; model: string }[],
): { summary: string; detail: string } | null {
  const discordant = pairs.filter((p) => p.human !== p.model);
  if (discordant.length < 3) return null;

  // Group by which way the disagreement went, then take the most common pattern.
  const ways = new Map<string, number>();
  for (const p of discordant) {
    const key = `you ${p.human} / judge ${p.model}`;
    ways.set(key, (ways.get(key) ?? 0) + 1);
  }
  const [topWay, topCount] = [...ways.entries()].sort((a, b) => b[1] - a[1])[0];
  const others = discordant.length - topCount;

  if (topCount <= others) return null;

  // The sign test the harness already owns: does one direction dominate?
  //
  // The two arrays must put the dominant direction in b01 and EVERY OTHER
  // disagreement in b10. Marking the first array all-true instead lands the
  // other directions on the diagonal, where McNemar treats them as ties and
  // drops them — which turned 7-versus-1 into 7-versus-0 and reported p=0.016
  // for a split whose real two-sided exact p is 0.070. The difference is the
  // whole verdict at α=0.05.
  const isTop = discordant.map((p) => `you ${p.human} / judge ${p.model}` === topWay);
  const { pValue } = mcNemar(
    isTop,
    isTop.map((t) => !t),
  );

  return {
    summary: `${topCount}:${others} — ${topWay}`,
    detail:
      `disagreements: ${topCount} of ${discordant.length} are "${topWay}"` +
      `  (McNemar p=${pValue < 0.001 ? "<0.001" : pValue.toFixed(3)})`,
  };
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
  /** Low kappa caused by the label distribution rather than by the judge. */
  const skewed: string[] = [];
  /** Disagreements that all run one way — a judge defect with a direction. */
  const biased: string[] = [];
  /** Kappa high only because neither rater ever used the other category. */
  const degenerate: string[] = [];
  for (const judge of judges) {
    const pairs = labels
      .map(judge.pick)
      .filter((p): p is { human: string; model: string } => p.human !== null && p.model !== null);

    if (pairs.length === 0) {
      console.log(`  ${judge.name.padEnd(13)} —    (no labelled pairs)`);
      continue;
    }

    const humanLabels = pairs.map((p) => p.human);
    const modelLabelValues = pairs.map((p) => p.model);
    const agreement: Agreement = cohensKappa(humanLabels, modelLabelValues);
    const skew = Math.max(prevalence(humanLabels), prevalence(modelLabelValues));
    const bias = directionalBias(pairs);

    // Four outcomes, and only the first is a judge that has been validated.
    //   ok        both raters used the categories and they agree
    //   BIASED    they disagree ONE WAY — the judge is systematically lenient
    //             or strict. A real defect with a direction, whatever kappa says
    //   SKEWED    agreement is high but one rater used a single category, so
    //             chance agreement eats it and kappa means nothing
    //   WEAK      they disagree in both directions: noise, not bias
    let flag = "";
    if (bias) {
      flag = "   ⚠ BIASED";
      biased.push(`${judge.name} (${bias.summary})`);
    } else if (agreement.weak && skew >= SKEW_LIMIT) {
      flag = "   ⚠ SKEWED";
      skewed.push(judge.name);
    } else if (agreement.weak) {
      flag = "   ⚠ WEAK";
      weak.push(judge.name);
    } else if (skew >= SKEW_LIMIT) {
      // Kappa at or above 0.6 is normally the pass condition, but unanimity is
      // not evidence: 5 of 5 refusals labelled "refused" by both raters scores
      // kappa 1.00 while containing no case that could have separated a working
      // judge from one that always says "refused".
      flag = "   ⚠ NO NEGATIVES";
      degenerate.push(judge.name);
    }

    console.log(
      `  ${judge.name.padEnd(13)} ${String(agreement.n).padStart(2)}   ` +
        `${(agreement.rawAgreement * 100).toFixed(0).padStart(6)}%   ` +
        `${agreement.kappa.toFixed(2).padStart(6)}${flag}`,
    );
    console.log(
      `                    you: ${distribution(humanLabels)}\n` +
        `                  judge: ${distribution(modelLabelValues)}` +
        (bias ? `\n                 ${bias.detail}` : ""),
    );
  }

  if (biased.length > 0) {
    console.log(
      `\n⚠ SYSTEMATIC DISAGREEMENT, one direction: ${biased.join("; ")}\n` +
        wrap(
          "The disagreements are not spread both ways, so this is a judge that " +
            "reads the rubric differently from you rather than a noisy one — and " +
            "it is a real defect no matter what kappa says, because a lenient " +
            "faithfulness judge inflates every faithfulness number downstream by " +
            "roughly the rate shown above. For faithfulness the fix is usually to " +
            "make the atomic-claim decomposition more explicit: a judge that " +
            "bundles several facts into one claim cannot mark part of it " +
            "unsupported, so it labels the whole thing supported. Tighten the " +
            "prompt, then re-run against these same saved labels — that is what " +
            "the file is for, and it is the only way to tell a real improvement " +
            "from a judge that drifted somewhere else.",
        ),
    );
  }

  if (degenerate.length > 0) {
    console.log(
      `\n⚠ NOTHING TO DISAGREE ABOUT: ${degenerate.join(", ")}\n` +
        wrap(
          "Both raters put nearly everything in one category, so the kappa is " +
            "high by arithmetic rather than by evidence — unanimity scores 1.00 " +
            "whatever the judge is doing. This is NOT a validated judge and must " +
            "not be reported as one. It needs cases in the sample where the " +
            "system failed: for refusal, unanswerable questions the system " +
            "actually answered. If the system never fails that way, say THAT, " +
            "with the count, instead of quoting a kappa.",
        ),
    );
  }

  if (skewed.length > 0) {
    console.log(
      `\n⚠ kappa is not interpretable for: ${skewed.join(", ")}\n` +
        wrap(
          `One rater put ${Math.round(SKEW_LIMIT * 100)}%+ of items in a single ` +
            "category, so chance agreement is nearly as high as the agreement " +
            "actually observed and kappa collapses toward zero however good the " +
            "judge is. THIS IS THE KAPPA PARADOX, not a broken judge: with 20 of 20 " +
            "answers labelled faithful by you and 17 of 20 by the judge, raw " +
            "agreement is 85% and kappa is exactly 0.00. Tightening the prompt " +
            "cannot move a number that is measuring the label distribution rather " +
            "than the judge. What fixes it is a calibration sample with real " +
            "negatives in it — deliberately include results you expect to be " +
            "unfaithful or wrong — and reporting raw agreement and both marginals " +
            "next to the kappa so a reader can see which case they are in.",
        ),
    );
  }

  if (weak.length > 0) {
    console.log(
      `\n⚠ kappa below 0.6 for: ${weak.join(", ")}\n` +
        wrap(
          "Both raters used the categories, so this one is about the judge. For " +
            "faithfulness the fix is usually to make the atomic-claim " +
            "decomposition more explicit in the prompt — a judge that bundles " +
            "several facts into one claim cannot mark part of it unsupported. " +
            "Tighten the prompt, then re-run this against the same saved labels to " +
            "see whether it actually moved.",
        ),
    );
  }

  if (weak.length === 0 && skewed.length === 0 && labels.length > 0) {
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

  // Re-score the saved labels without labelling anything. This is what makes
  // "tighten the judge prompt, then re-measure against the SAME human labels"
  // an actual workflow rather than an instruction with no command behind it.
  if (args.reportOnly) {
    if (existing.length === 0) {
      throw new Error(`No labels in ${LABELS_FILE} — nothing to report on.`);
    }
    console.log(`\n${existing.length} saved label(s) from ${LABELS_FILE}`);
    report(existing);
    return;
  }
  // Re-running after a prompt change must re-measure against the SAME human
  // labels, so previously labelled questions are never re-asked.
  const alreadyLabelled = new Set(existing.map((l) => `${l.runId}:${l.questionId}`));

  const runFile = latestRunFile(args.runId);
  const runId = path.basename(runFile, ".jsonl");

  // Split the file by line type. The `run` header carries the git SHA the
  // staleness check needs; the `aggregate` footer carries nothing useful here.
  // Both lack an `error` field, so the pool filter below (`!r.error`) used to
  // let them through — the labelling loop skipped them silently and the sample
  // came back short. Asking for 25 and labelling 23 matters when the acceptance
  // criterion is 25.
  const lines = readJsonl<StoredResult & { type?: string; gitSha?: string }>(runFile);
  const runHeader = lines.find((l) => l.type === "run");
  const results = lines.filter((r) => r.type === "result");
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

  warnIfPredatesGoldenSet(runHeader?.gitSha);

  const stale = new Map<string, string>();
  const labelable = results.filter((r) => {
    if (alreadyLabelled.has(`${runId}:${r.questionId}`) || r.error) return false;
    const reason = staleness(r, questions);
    if (reason) {
      stale.set(r.questionId, reason);
      return false;
    }
    return true;
  });

  const rand = mulberry32(args.seed);
  const pool = shuffle(labelable, rand).slice(0, args.sample);

  console.log(`\nRun: ${runId}  —  ${results.length} result(s)`);
  if (stale.size > 0) {
    console.log(`Dropped ${stale.size} stale against the current golden set:`);
    for (const [id, reason] of stale) console.log(`  ${id}  ${reason}`);
  }
  console.log(`Already labelled: ${existing.length}.  To label now: ${pool.length}.`);
  if (pool.length < args.sample) {
    console.log(
      `\n⚠ ${pool.length} labelable, ${args.sample} asked for. Phase 3's acceptance is ` +
        `25 — top up with a larger run rather than reporting kappa on fewer.`,
    );
  }
  console.log();

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
      // PHRASED AS A YES/NO ON y/n, like every other prompt here. It used to ask
      // "decline, or assert an answer?" on [r]/[a] — the one prompt in the tool
      // where neither key was y or n, reached only on unanswerable questions and
      // so never adjacent to itself. Four of five came back saying an answer
      // reading "This question is not covered by these documents" had asserted
      // something, which is not a judgement anyone makes about that sentence.
      human.refused = await askLabel(
        "Did the answer DECLINE to answer? (it should have — this question is unanswerable)",
        [
          {
            key: "y",
            value: "refused" as const,
            label: "yes, it declined",
            echo: "the answer declined / said it could not answer",
          },
          {
            key: "n",
            value: "answered" as const,
            label: "no, it asserted an answer",
            echo: "the answer asserted a substantive answer",
          },
        ],
      );
    } else {
      human.faithful = await askLabel(
        "Is EVERY claim in the answer supported by the passages above?",
        [
          {
            key: "y",
            value: "faithful" as const,
            label: "yes, all supported",
            echo: "every claim is supported by the passages",
          },
          {
            key: "n",
            value: "unfaithful" as const,
            label: "no, something is not",
            echo: "at least one claim is NOT supported by the passages",
          },
        ],
      );
      if (question.expectedAnswer) {
        human.correctness = await askLabel("How does it compare to the reference answer?", [
          {
            key: "c",
            value: "correct" as const,
            label: "correct",
            echo: "same as the reference answer in substance",
          },
          {
            key: "p",
            value: "partial" as const,
            label: "partial",
            echo: "partly right — some of the reference answer, not all",
          },
          {
            key: "i",
            value: "incorrect" as const,
            label: "incorrect",
            echo: "wrong, or not the reference answer at all",
          },
        ]);
      }
      human.citations = await askLabel("Does every [n] point at a passage that supports it?", [
        {
          key: "y",
          value: "all-valid" as const,
          label: "yes, all valid",
          echo: "every citation points at a passage that supports its sentence",
        },
        {
          key: "n",
          value: "has-invalid" as const,
          label: "no, at least one is wrong",
          echo: "at least one citation points somewhere that does NOT support it",
        },
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
