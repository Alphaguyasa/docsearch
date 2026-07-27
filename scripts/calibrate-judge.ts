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
  judgeAll,
  type Agreement,
  type JudgeScores,
} from "../eval/src/metrics/judge";
import { mcNemar } from "../eval/src/metrics/stats";
import type { Question, QuestionResult, RetrievedChunk } from "../eval/src/types";

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
  /**
   * Labels corrected against the SOURCE after the fact, with the evidence.
   *
   * An adjudicated label is no longer independent of the model's: it was
   * changed by someone who already knew what the model said. That is legitimate
   * as a correction of the record — the source text settles who was right —
   * and fatal as calibration data, because agreement you produced by looking at
   * the answer key measures nothing. So these are kept, cited, and EXCLUDED
   * from the kappa rather than quietly folded into it.
   */
  adjudicated?: {
    field: string;
    from: string | null;
    to: string | null;
    /** Where in the corpus the question was settled. */
    evidence: string;
    at: string;
  }[];
  /**
   * How this item was drawn — and it is not bookkeeping.
   *
   * A stratified sample is deliberately unrepresentative: half its items were
   * chosen BECAUSE the judge flagged them. Pooling those with a random sample
   * and reporting one kappa describes a population that never existed, and the
   * raw agreement percentage becomes uninterpretable. Recorded per label so the
   * report can refuse to blend them silently.
   *
   * Absent means random — the first 25 labels predate this field.
   */
  sampling?: "random" | "stratified";
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
    // score === null means the answer made no factual claims — a refusal. There
    // is nothing for grounding to be true of, so it is not a faithfulness
    // judgement at all and must not enter the kappa as one.
    faithful:
      faith && faith.score !== null ? (faith.score === 1 ? "faithful" : "unfaithful") : null,
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
/**
 * Passages of the item currently on screen, so `/term` can search them.
 *
 * Module state rather than a parameter threaded through askLabel: the search is
 * a property of what the reviewer is looking at, and every call site already
 * passes the same thing showItem just printed.
 */
let currentPassages: RetrievedChunk[] = [];

/** Print every occurrence of `term` in the current passages, with context. */
function searchHits(term: string): void {
  const needle = term.toLowerCase();
  let hits = 0;

  for (const [i, chunk] of currentPassages.entries()) {
    const hay = chunk.text.toLowerCase();
    let at = hay.indexOf(needle);
    while (at !== -1) {
      hits++;
      const from = Math.max(0, at - 160);
      const window = chunk.text.slice(from, at + term.length + 160).replace(/\s+/g, " ");
      console.log(`\n  [${i + 1}] p.${chunk.page}  …${window}…`);
      if (hits >= 8) {
        console.log("\n  (stopping at 8 hits)");
        return;
      }
      at = hay.indexOf(needle, at + 1);
    }
  }

  console.log(
    hits === 0
      ? `\n  "${term}" does not appear in any passage.`
      : `\n  ${hits} hit(s).`,
  );
}

async function askLabel<T extends string>(
  question: string,
  // `value: null` is a real choice, not a missing one: a refusal is not a
  // faithfulness judgement, and the reviewer needs a way to say so.
  options: { key: string; value: T | null; label: string; echo: string }[],
): Promise<T | null> {
  const menu = options.map((o) => `[${o.key}] ${o.label}`).join("   ");
  for (;;) {
    const answer = await ask(
      `\n  ${question}\n  ${menu}   [/text] search passages   [?] skip\n  > `,
    );
    if (answer === "?" || answer === "") return null;

    // SEARCH, BECAUSE SCANNING IS WHERE THE ERRORS CAME FROM. A question here
    // retrieves eight passages of dense academic prose, ~16,000 characters. The
    // first faithfulness pass marked six answers unsupported whose claims were
    // all present — one buried mid-paragraph on page 26, one split across a line
    // break as "Ja- son Reifler". Asking a human to verify a claim by eye
    // against that much text is a task design that produces wrong labels, and
    // wrong labels are indistinguishable from a broken judge in the output.
    if (answer.startsWith("/") && answer.length > 1) {
      searchHits(answer.slice(1));
      continue;
    }

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
  /** Re-run the judges with current prompts and re-score against saved labels. */
  rejudge: boolean;
  /** Re-ask one judge's question on items already labelled for it. */
  relabel?: RelabelTarget;
  /** Draw half the sample from results the judge flagged as failures. */
  stratify: boolean;
  /**
   * Characters of each passage shown before truncation. Effectively unlimited
   * by default, and that is the point.
   *
   * IT USED TO BE A HARDCODED 600, which on this corpus is about a QUARTER of
   * what the judge reads — chunks average ~2,000 characters and a question
   * retrieves eight of them. The reviewer was asked "is every claim supported
   * by the passages above?" while being shown a quarter of the passages.
   *
   * That is not a cosmetic difference, and it is not symmetric: truncation can
   * only remove support, never invent it, so every label it changes moves the
   * same direction. Measured on the first calibration, the evidence for
   * q-0052's second F1 score and for q-0007's "overfitting" both sat past the
   * cut — labelled unsupported by a reviewer who could not see them, supported
   * by a judge who could. That reads as a lenient judge in the agreement table
   * and is nothing of the kind.
   */
  contextChars: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    stratify: false,
    rejudge: false,
    sample: 25,
    seed: 42,
    reportOnly: false,
    contextChars: Number.MAX_SAFE_INTEGER,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--report-only") {
      args.reportOnly = true;
    } else if (flag === "--stratify") {
      args.stratify = true;
    } else if (flag === "--rejudge") {
      args.rejudge = true;
    } else if (flag === "--relabel") {
      if (!value || !(value in HUMAN_FIELD)) {
        throw new Error(
          `--relabel needs one of: ${Object.keys(HUMAN_FIELD).join(", ")}`,
        );
      }
      args.relabel = value as RelabelTarget;
      i++;
    } else if (flag === "--context") {
      args.contextChars = Number(value);
      i++;
      if (!Number.isFinite(args.contextChars) || args.contextChars <= 0) {
        throw new Error("--context must be a positive number of characters");
      }
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

function report(
  labels: CalibrationLabel[],
  title = "Judge agreement",
): Record<string, Agreement> {
  const scored: Record<string, Agreement> = {};
  const judges: {
    name: string;
    /** The `human`/`model` key this judge reads — also what adjudication cites. */
    field: "faithful" | "correctness" | "citations" | "refused";
  }[] = [
    { name: "faithfulness", field: "faithful" },
    { name: "correctness", field: "correctness" },
    { name: "citations", field: "citations" },
    { name: "refusal", field: "refused" },
  ];

  /**
   * Adjudicated judgements are excluded — PER FIELD, not per label.
   *
   * A label corrected against the source after the model's verdict was known
   * cannot measure agreement with that verdict, so it must not enter the kappa.
   * But adjudication touches ONE judgement: the six faithfulness corrections
   * left those items' correctness and citation labels exactly as they were made,
   * blind. Dropping whole labels threw six independent correctness judgements
   * away with them and quietly cut that judge's n from 20 to 14 — discarding the
   * one validated result in the phase to fix a different judge's problem.
   */
  const adjudicatedCount = labels.filter((l) => l.adjudicated?.length).length;
  const isAdjudicated = (l: CalibrationLabel, field: string): boolean =>
    l.adjudicated?.some((a) => a.field === field) ?? false;

  console.log(`\n── ${title} ${"─".repeat(Math.max(3, 54 - title.length))}`);

  // A stratified sample over-represents flagged failures BY DESIGN. Averaging it
  // together with a random one produces a kappa for a population that never
  // existed and a raw agreement percentage that describes neither sample.
  const stratified = labels.filter((l) => l.sampling === "stratified").length;
  const random = labels.length - stratified;
  if (stratified > 0 && random > 0) {
    console.log(
      `  ⚠ MIXED SAMPLE DESIGNS: ${random} random + ${stratified} stratified.\n` +
        `  The figures below pool them, which is wrong for a headline number —\n` +
        `  report the two designs separately, or re-run with one of them.`,
    );
  } else if (stratified > 0) {
    console.log(
      `  Stratified sample: flagged failures are over-represented on purpose, so\n` +
        `  raw agreement is NOT this run's agreement rate. Say so with the number.`,
    );
  }

  if (adjudicatedCount > 0) {
    console.log(
      `  ${adjudicatedCount} adjudicated judgement(s) excluded from the judge they\n` +
        `  correct — settled against the source after the model's verdict was\n` +
        `  known, so not independent. Their OTHER judgements still count.`,
    );
  }
  console.log("  judge          n   raw agree    kappa");

  const weak: string[] = [];
  /** Low kappa caused by the label distribution rather than by the judge. */
  const skewed: string[] = [];
  /** Disagreements that all run one way — a judge defect with a direction. */
  const biased: string[] = [];
  /** Kappa high only because neither rater ever used the other category. */
  const degenerate: string[] = [];
  for (const judge of judges) {
    const pairs: { human: string; model: string }[] = labels
      .filter((l) => !isAdjudicated(l, judge.field))
      .map((l) => ({
        human: l.human[judge.field] as string | null,
        model: l.model[judge.field],
      }))
      .filter(
        (p): p is { human: string; model: string } => p.human !== null && p.model !== null,
      );

    if (pairs.length === 0) {
      console.log(`  ${judge.name.padEnd(13)} —    (no labelled pairs)`);
      continue;
    }

    const humanLabels = pairs.map((p) => p.human);
    const modelLabelValues = pairs.map((p) => p.model);
    const agreement: Agreement = cohensKappa(humanLabels, modelLabelValues);
    const skew = Math.max(prevalence(humanLabels), prevalence(modelLabelValues));
    const bias = directionalBias(pairs);
    scored[judge.name] = agreement;

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
          "The disagreements are not spread both ways, so one of the two raters " +
            "is applying the rubric differently — this is not noise. IT DOES NOT " +
            "SAY WHICH RATER. That distinction cannot be made from an agreement " +
            "table, and assuming it is the model is how you end up tuning a judge " +
            "to reproduce a reviewer's mistake.",
        ) +
        "\n\n" +
        wrap(
          "This message previously asserted the judge was at fault. On the first " +
            "run where it fired — faithfulness, 11:0 — the judge was RIGHT and " +
            "every disputed claim turned out to be near-verbatim in the passages, " +
            "one of them buried on page 26 of a dense paper and another split " +
            "across a line break as \"Ja- son Reifler\". Scanning eight passages " +
            "of academic text per item is where the errors came from, not the " +
            "rubric.",
        ) +
        "\n\n" +
        wrap(
          "SETTLE IT ON THE SOURCE, not on the statistics: take two or three " +
            "disputed items and find the claim in the passages yourself. If it is " +
            "there, the labels are wrong and the sample needs relabelling. If it " +
            "is not, the judge is lenient and the prompt needs the atomic-claim " +
            "decomposition made more explicit. Either way --rejudge measures the " +
            "change against the saved human labels.",
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

  return scored;
}

/**
 * Print one result exactly as a reviewer must see it before judging it.
 *
 * Shared by first-pass labelling and by --relabel, deliberately: a relabelled
 * item has to be shown the same way a fresh one is, or the two labels are not
 * comparable and the calibration set becomes a mixture of two tasks.
 */
function showItem(
  question: Question,
  result: StoredResult,
  args: Args,
  position: string,
): void {
  console.clear();
  console.log("═".repeat(80));
  console.log(`  ${result.questionId}   ${question.type}   ${position}`);
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
    const shown = result.retrieved.reduce(
      (n, c) => n + Math.min(c.text.length, args.contextChars),
      0,
    );
    const full = result.retrieved.reduce((n, c) => n + c.text.length, 0);

    console.log(
      `\nRETRIEVED PASSAGES (as numbered in the prompt) — ` +
        `the SAME text the judge was given` +
        (shown < full
          ? `, TRUNCATED to ${Math.round((100 * shown) / full)}% of it ` +
            `by --context ${args.contextChars}`
          : ""),
    );
    for (const [j, chunk] of result.retrieved.entries()) {
      console.log(`\n  [${j + 1}] p.${chunk.page}  ${chunk.chunkId}`);
      console.log(wrap(chunk.text.slice(0, args.contextChars), 74, "      "));
      if (chunk.text.length > args.contextChars) {
        console.log(`      … ${chunk.text.length - args.contextChars} more characters HIDDEN`);
      }
    }
    if (shown < full) {
      console.log(
        "\n" +
          wrap(
            "⚠ You are judging on less evidence than the judge had. Truncation " +
              "can only ever REMOVE support, never add it, so every label it " +
              "changes moves the same way — toward unsupported.",
          ),
      );
    }
  }

  // Registered for `/term` search: the reviewer has to be able to LOOK FOR a
  // claim rather than scan eight passages hoping to notice it.
  currentPassages = result.retrieved;

  console.log("\n" + "─".repeat(80));
  console.log("  Label what YOU think. The model's verdict is hidden until after.");
  console.log("  Type /text to search the passages — claims are often buried mid-paragraph.");
}

/**
 * Re-run the judges with the CURRENT prompts over the already-labelled results,
 * and score the fresh verdicts against the SAME human labels.
 *
 * This is the half of "tighten the prompt, then re-measure" that did not exist.
 * --report-only re-reads verdicts recorded at labelling time, so it prints the
 * same table forever however much a prompt changes; the human labels are the
 * fixed point, and it is the MODEL side that has to move.
 *
 * Costs real quota: a changed prompt is a different cache key by construction,
 * so every call is a miss. That is the point of it — an unchanged prompt is
 * free, because every call hits.
 */
async function rejudge(
  labels: CalibrationLabel[],
  results: Map<string, StoredResult>,
  questions: Map<string, Question>,
): Promise<CalibrationLabel[]> {
  const refreshed: CalibrationLabel[] = [];

  for (const [i, label] of labels.entries()) {
    const result = results.get(label.questionId);
    const question = questions.get(label.questionId);
    if (!result || !question) {
      console.log(`  ${label.questionId}: skipped — not in the run or the golden set`);
      continue;
    }

    process.stdout.write(`\r  re-judging ${i + 1}/${labels.length}  ${label.questionId}   `);
    const scores = await judgeAll(question, result.answer, result.retrieved);
    refreshed.push({ ...label, model: modelLabels(scores) });
  }

  process.stdout.write("\r".padEnd(60) + "\r");
  return refreshed;
}

const FAITHFULNESS_QUESTION = "Is EVERY claim in the answer supported by the passages above?";

/**
 * "No claims" is an option because a refusal is not a faithfulness judgement.
 *
 * An answer reading "This question is not covered by these documents" asserts
 * nothing about the subject, so there is nothing for grounding to be true or
 * false of. Forcing it into yes/no made reviewers pick "no, something is not
 * supported" — reasonably, since nothing was supported — and that single choice
 * accounted for 5 of the 11 human/judge disagreements. The judge now returns an
 * empty claim list and a null score for the same case, so both sides say "not
 * applicable" and the item drops out of the kappa instead of landing in it as a
 * disagreement neither rater intended.
 */
const FAITHFULNESS_OPTIONS = [
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
  {
    key: "x",
    value: null,
    label: "n/a — it made no claims (a refusal)",
    echo: "the answer asserted nothing: not a faithfulness judgement, excluded",
  },
];

/** Did any judge score this result below perfect? */
function judgeFlagsFailure(result: StoredResult): boolean {
  return ["faithfulness", "correctness", "citationAccuracy", "refusalAccuracy"].some((key) => {
    const v = result.metrics?.[key];
    return typeof v === "number" && v < 1;
  });
}

/**
 * Half the sample from results the judge flagged, half from results it did not.
 *
 * WHY A RANDOM SAMPLE WAS NOT ENOUGH. Kappa needs both categories to appear. A
 * random 25 drawn from this run gave 19 of 19 citations "all-valid" and 5 of 5
 * refusals "refused" — no negatives, so no disagreement was possible and the
 * kappa measured the label distribution instead of the judge. The failures do
 * exist: the full dev split has 7 imperfect citation scores out of 57. They are
 * simply too rare to land in a small random draw.
 *
 * WHAT THIS COSTS, AND IT MUST BE REPORTED. Stratifying on the MODEL's verdict
 * makes the sample deliberately unrepresentative of the run. The resulting kappa
 * estimates agreement in a balanced population, not in production, and the raw
 * agreement percentage is NOT the run's agreement rate. That is the standard
 * treatment for rare-event agreement studies and it is only honest if the design
 * travels with the number — so each label records how it was drawn, and the
 * report says so.
 *
 * Note the one thing stratification cannot fix: refusal has 13 opportunities and
 * zero failures in the whole split. There is no negative stratum to draw from.
 * The honest statement there is the count, not a kappa.
 */
function stratifiedSample(
  pool: StoredResult[],
  size: number,
  rand: () => number,
): StoredResult[] {
  const flagged = shuffle(pool.filter(judgeFlagsFailure), rand);
  const clean = shuffle(pool.filter((r) => !judgeFlagsFailure(r)), rand);

  const wantFlagged = Math.min(flagged.length, Math.ceil(size / 2));
  const wantClean = Math.min(clean.length, size - wantFlagged);
  // Whichever stratum ran short, refill from the other rather than returning a
  // short sample: 25 asked for is 25 labelled.
  const picked = [
    ...flagged.slice(0, wantFlagged),
    ...clean.slice(0, wantClean),
    ...flagged.slice(wantFlagged),
    ...clean.slice(wantClean),
  ].slice(0, size);

  console.log(
    `\nSTRATIFIED SAMPLE: ${picked.filter(judgeFlagsFailure).length} the judge flagged, ` +
      `${picked.filter((r) => !judgeFlagsFailure(r)).length} it did not.\n` +
      wrap(
        "Drawn deliberately unrepresentative so both categories appear — a random " +
          "draw from this run produced no negatives at all for citations or " +
          "refusal, and kappa cannot be computed against a category nobody used. " +
          "The agreement percentage below is therefore NOT this run's agreement " +
          "rate, and the kappa describes a balanced population rather than " +
          "production. Both facts belong next to the number in the writeup.",
      ),
  );

  return picked;
}

/** Which human field each judge's label lives in. */
const HUMAN_FIELD = {
  faithfulness: "faithful",
  correctness: "correctness",
  citations: "citations",
  refusal: "refused",
} as const;

type RelabelTarget = keyof typeof HUMAN_FIELD;

/**
 * Re-ask ONE judge's question on items that already carry a label for it.
 *
 * WHY ONE AND NOT ALL FOUR. The truncation bug contaminated exactly the
 * judgements that depend on reading the passages — faithfulness and citations.
 * Correctness compares the answer against a reference answer, both of which
 * were always shown in full, so its labels are sound and its kappa of 0.80 is
 * the one real result Phase 3 has. Re-asking it would put a validated number
 * back at risk to fix a different judge's problem.
 *
 * The previous answer is NOT shown. A reviewer reminded of what they said last
 * time is being asked to agree with themselves, and the point of relabelling is
 * a judgement formed again from the evidence — this time all of it.
 */
async function relabel(
  target: RelabelTarget,
  labels: CalibrationLabel[],
  results: Map<string, StoredResult>,
  questions: Map<string, Question>,
  args: Args,
  ask: (question: Question, result: StoredResult) => Promise<string | null>,
): Promise<CalibrationLabel[]> {
  const field = HUMAN_FIELD[target];
  const todo = labels.filter((l) => l.human[field] !== null && results.has(l.questionId));

  console.log(
    `\nRelabelling ${target} on ${todo.length} item(s), full context, previous ` +
      `answers hidden.\nEverything else in each label is kept as it is.\n`,
  );

  let done = 0;
  const updated = labels.map((l) => ({ ...l, human: { ...l.human } }));

  for (const label of updated) {
    if (label.human[field] === null) continue;
    const result = results.get(label.questionId);
    const question = questions.get(label.questionId);
    if (!result || !question) continue;

    done++;
    showItem(question, result, args, `${target}  [${done} of ${todo.length}]`);
    const answer = await ask(question, result);
    if (answer !== null) (label.human as Record<string, string | null>)[field] = answer;

    writeFileSync(LABELS_FILE, updated.map((l) => JSON.stringify(l)).join("\n") + "\n");
  }

  console.clear();
  console.log(`\nRelabelled ${done} ${target} judgement(s) → ${LABELS_FILE}`);
  return updated;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const existing = readJsonl<CalibrationLabel>(LABELS_FILE);

  // Re-score the saved labels without labelling anything.
  //
  // NOTE WHAT THIS DOES NOT DO. The `model` verdicts in the labels file were
  // captured when the labels were made. Re-running this after changing a judge
  // prompt re-reads those stored verdicts and prints the identical table — the
  // agreement cannot move, because nothing re-judged anything. Measuring a
  // prompt change needs --rejudge, below, which calls the judges again with the
  // current prompts and scores the NEW verdicts against the SAME human labels.
  if (args.reportOnly) {
    if (existing.length === 0) {
      throw new Error(`No labels in ${LABELS_FILE} — nothing to report on.`);
    }
    console.log(
      `\n${existing.length} saved label(s) from ${LABELS_FILE}` +
        `\nModel verdicts as recorded at labelling time. To measure a judge` +
        ` prompt change, use --rejudge.`,
    );
    report(existing);
    return;
  }
  // Re-running after a prompt change must re-measure against the SAME human
  // labels, so previously labelled questions are never re-asked.
  //
  // KEYED BY QUESTION, NOT BY RUN. It used to be `${runId}:${questionId}`, which
  // meant a question labelled in one run came back for labelling in the next —
  // and because generation is cached, "the next run" usually shows the reviewer
  // the identical answer to the identical question. That is not a second
  // independent judgement, it is the same one recalled, and it would quietly
  // pollute exactly the fresh sample this exists to produce.
  const alreadyLabelled = new Set(existing.map((l) => l.questionId));

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

  if (args.relabel) {
    const target = args.relabel;
    const byId = new Map(results.map((r) => [r.questionId, r]));

    // Archived before anything is overwritten. The superseded labels are the
    // evidence for WHY the relabel happened — the 7:1 split that turned out to
    // be a truncated display — and a calibration set that quietly rewrites
    // itself cannot be audited later.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archive = LABELS_FILE.replace(/\.jsonl$/, `.before-${target}-${stamp}.jsonl`);
    writeFileSync(archive, existing.map((l) => JSON.stringify(l)).join("\n") + "\n");
    console.log(`\nPrevious labels archived → ${archive}`);

    const updated = await relabel(target, existing, byId, questions, args, async (question) => {
      if (target === "faithfulness") {
        return askLabel(FAITHFULNESS_QUESTION, FAITHFULNESS_OPTIONS);
      }
      if (target === "citations") {
        return askLabel("Does every [n] point at a passage that supports it?", [
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
      if (target === "correctness") {
        return askLabel("How does it compare to the reference answer?", [
          { key: "c", value: "correct" as const, label: "correct", echo: "same in substance" },
          { key: "p", value: "partial" as const, label: "partial", echo: "partly right" },
          { key: "i", value: "incorrect" as const, label: "incorrect", echo: "wrong" },
        ]);
      }
      return askLabel(
        "Did the answer DECLINE to answer? (it should have — this question is unanswerable)",
        [
          { key: "y", value: "refused" as const, label: "yes, it declined", echo: "it declined" },
          {
            key: "n",
            value: "answered" as const,
            label: "no, it asserted an answer",
            echo: "it asserted a substantive answer",
          },
        ],
      );
    });

    report(updated, `Judge agreement — ${target} relabelled on full context`);
    console.log(
      wrap(
        `The ${target} labels above were made a second time, on the complete ` +
          `passages. The model verdicts are unchanged, so any movement against ` +
          `the previous table is the reviewer seeing what the judge saw.`,
      ) + "\n",
    );
    return;
  }

  if (args.rejudge) {
    const forThisRun = existing.filter((l) => l.runId === runId);
    if (forThisRun.length === 0) {
      throw new Error(
        `No saved labels for run ${runId}. --rejudge re-scores labels you have ` +
          `already made; pass --run <id> for the run they were made against.`,
      );
    }

    console.log(
      `\nRe-judging ${forThisRun.length} labelled result(s) with the CURRENT ` +
        `judge prompts.\nHuman labels are held fixed — only the model side moves.\n`,
    );

    const before = report(forThisRun, "BEFORE — verdicts recorded at labelling time");
    const after = report(
      await rejudge(forThisRun, new Map(results.map((r) => [r.questionId, r])), questions),
      "AFTER — verdicts from the current prompts",
    );

    console.log("\n── Movement ────────────────────────────────────────────");
    for (const name of Object.keys(before)) {
      const b = before[name];
      const a = after[name];
      if (!b || !a) continue;
      const d = a.kappa - b.kappa;
      console.log(
        `  ${name.padEnd(13)} kappa ${b.kappa.toFixed(2)} → ${a.kappa.toFixed(2)}` +
          `  (${d >= 0 ? "+" : ""}${d.toFixed(2)})   ` +
          `agreement ${(b.rawAgreement * 100).toFixed(0)}% → ${(a.rawAgreement * 100).toFixed(0)}%`,
      );
    }
    console.log(
      "\n" +
        wrap(
          "The human labels did not change, so any movement here is the judge " +
            "and nothing else. That is the whole point of keeping them.",
        ) +
        "\n",
    );
    return;
  }

  const stale = new Map<string, string>();
  const labelable = results.filter((r) => {
    if (alreadyLabelled.has(r.questionId) || r.error) return false;
    const reason = staleness(r, questions);
    if (reason) {
      stale.set(r.questionId, reason);
      return false;
    }
    return true;
  });

  const rand = mulberry32(args.seed);
  const pool = args.stratify
    ? stratifiedSample(labelable, args.sample, rand)
    : shuffle(labelable, rand).slice(0, args.sample);

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

    showItem(question, result, args, `[${i + 1} of ${pool.length}]`);

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
        FAITHFULNESS_QUESTION,
        FAITHFULNESS_OPTIONS,
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
      sampling: args.stratify ? ("stratified" as const) : ("random" as const),
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
