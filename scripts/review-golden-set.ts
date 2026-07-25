/**
 * Golden set review tool — Phase 1 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:review
 *
 * Shows one candidate at a time with its source chunk text, and accepts:
 *   a  accept  — append to eval/golden/questions.jsonl
 *   e  edit    — open in $EDITOR, then accept the edited version
 *   d  drop    — reject permanently
 *   s  skip    — leave undecided, show again next run
 *   q  quit
 *
 * Resumable: every id you decide on is recorded in eval/golden/.reviewed and is
 * never shown again. Skipped ids are deliberately NOT recorded, so an
 * interrupted session resumes exactly where it stopped.
 *
 * This step is the whole point of Phase 1. Model-written questions are often
 * trivially lexical — they repeat the passage's rare words, so retrieval scores
 * high without demonstrating anything. Rewrite those with different vocabulary
 * or drop them.
 */
import "../src/lib/loadenv";

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { loadCorpus, type CorpusChunk } from "../eval/src/corpus";
import { sortForReview } from "../eval/src/triage";
import type { Question } from "../eval/src/types";

const CANDIDATES = "eval/golden/questions.candidate.jsonl";
const ACCEPTED = "eval/golden/questions.jsonl";
const REVIEWED = "eval/golden/.reviewed";

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function loadReviewed(): Set<string> {
  if (!existsSync(REVIEWED)) return new Set();
  return new Set(
    readFileSync(REVIEWED, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

function markReviewed(id: string, decision: string): void {
  mkdirSync(path.dirname(REVIEWED), { recursive: true });
  appendFileSync(REVIEWED, `${id}\n`);
  void decision;
}

function accept(question: Question): void {
  mkdirSync(path.dirname(ACCEPTED), { recursive: true });
  appendFileSync(ACCEPTED, JSON.stringify(question) + "\n");
}

/** Read a single keypress without waiting for Enter. */
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", (buf: Buffer) => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      const key = buf.toString("utf8");
      // Ctrl-C must still quit even in raw mode, where the OS no longer sends
      // SIGINT for us.
      if (key === "") {
        console.log("\n\nInterrupted.");
        process.exit(130);
      }
      resolve(key.toLowerCase());
    });
  });
}

/** Fallback for non-TTY stdin (piped input, some CI shells). */
function readLineFallback(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().slice(0, 1));
    });
  });
}

/**
 * Open the question in $EDITOR as JSON and read the result back.
 *
 * The edited text must still parse as a Question, and edits that would break the
 * type's invariants are rejected rather than written — a hand-edited row with a
 * non-null expectedAnswer on an unanswerable question would silently corrupt the
 * refusal metric.
 */
function editInEditor(question: Question): Question | null {
  const editor =
    process.env.EDITOR ??
    process.env.VISUAL ??
    (process.platform === "win32" ? "notepad" : "vi");

  const tmpDir = path.join("eval", ".cache", "review");
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${question.id}.json`);
  writeFileSync(tmpFile, JSON.stringify(question, null, 2));

  const result = spawnSync(editor, [tmpFile], { stdio: "inherit", shell: true });
  if (result.error) {
    console.log(`\n  Could not launch "${editor}": ${result.error.message}`);
    return null;
  }

  let edited: Question;
  try {
    edited = JSON.parse(readFileSync(tmpFile, "utf8")) as Question;
  } catch (err) {
    console.log(`\n  Edited file is not valid JSON (${errorMessage(err)}) — not accepted.`);
    return null;
  }

  if (!edited.question?.trim()) {
    console.log("\n  Edited question text is empty — not accepted.");
    return null;
  }
  if (edited.type === "unanswerable" && edited.expectedAnswer !== null) {
    console.log("\n  Unanswerable questions must have expectedAnswer: null — not accepted.");
    return null;
  }
  if (edited.type !== "unanswerable" && edited.relevantChunkIds.length === 0) {
    console.log("\n  Answerable questions need at least one relevantChunkId — not accepted.");
    return null;
  }
  return edited;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function wrap(text: string, width = 76, indent = "  "): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

function render(
  question: Question,
  chunks: Map<string, CorpusChunk>,
  index: number,
  total: number,
): void {
  console.clear();
  console.log("═".repeat(80));
  console.log(
    `  ${question.id}   ${question.type}   ${question.difficulty}` +
      `        [${index + 1} of ${total}]`,
  );
  console.log("═".repeat(80));

  // Advisory flag from generation triage. Shown prominently because these are
  // the candidates most likely to need a rewrite or a drop — but the call is
  // still the reviewer's, so nothing is pre-decided here.
  if (question.suspect) {
    const label = question.suspect === "lexical" ? "LEXICAL OVERLAP" : "NEAR-DUPLICATE";
    console.log(`\n⚠ FLAGGED — ${label}`);
    if (question.suspectDetail) console.log(wrap(question.suspectDetail));
    console.log(
      question.suspect === "lexical"
        ? wrap(
            "This question reuses its source passage's distinctive wording, so " +
              "retrieval can match on a shared rare term rather than on meaning. " +
              "Rewrite it with different vocabulary, or drop it.",
          )
        : wrap("This restates a question already in the set. Usually a drop."),
    );
  }

  console.log("\nQUESTION");
  console.log(wrap(question.question));

  console.log("\nEXPECTED ANSWER");
  console.log(
    question.expectedAnswer === null
      ? "  (none — this question must be refused)"
      : wrap(question.expectedAnswer),
  );

  if (question.notes) console.log(`\nNOTES\n  ${question.notes}`);

  if (question.relevantChunkIds.length === 0) {
    console.log("\nSOURCE");
    console.log("  No relevant chunk. The correct behaviour is a refusal.");
  } else {
    console.log("\nSOURCE CHUNK(S)");
    for (const id of question.relevantChunkIds) {
      const chunk = chunks.get(id);
      if (!chunk) {
        console.log(`\n  [${id}] MISSING FROM DB — drop this candidate.`);
        continue;
      }
      const page = chunk.pageNumber === null ? "" : `, p.${chunk.pageNumber}`;
      console.log(`\n  ── ${chunk.filename}${page} ──`);
      console.log(wrap(chunk.content, 76, "  "));
    }
  }

  console.log("\n" + "─".repeat(80));
  console.log("  [a]ccept   [e]dit   [d]rop   [s]kip   [q]uit");
  process.stdout.write("  > ");
}

async function main(): Promise<void> {
  const candidates = readJsonl<Question>(CANDIDATES);
  if (candidates.length === 0) {
    console.error(
      `No candidates found at ${CANDIDATES}.\nRun: npm run eval:golden`,
    );
    process.exit(1);
  }

  const reviewed = loadReviewed();
  // Clean candidates first, flagged ones last, so the suspect tail can be
  // culled in one pass at the end rather than interrupting the good ones.
  const pending = sortForReview(candidates.filter((q) => !reviewed.has(q.id)));

  if (pending.length === 0) {
    console.log(
      `All ${candidates.length} candidate(s) already reviewed.\n` +
        `Accepted set: ${ACCEPTED}\n` +
        `To start over, delete ${REVIEWED}.`,
    );
    return;
  }

  const corpus = await loadCorpus();
  const chunks = new Map(corpus.map((c) => [c.id, c]));

  let accepted = 0;
  let dropped = 0;
  let skipped = 0;

  for (const [i, question] of pending.entries()) {
    let decided = false;
    let current = question;

    while (!decided) {
      render(current, chunks, i, pending.length);

      const key = process.stdin.isTTY ? await readKey() : await readLineFallback("");

      switch (key) {
        case "a":
          accept(current);
          markReviewed(current.id, "accept");
          accepted++;
          decided = true;
          break;
        case "e": {
          const edited = editInEditor(current);
          if (edited) {
            current = edited;
            console.log("\n  Edited. Press [a] to accept the edited version.");
            await sleep(900);
          } else {
            await sleep(1800);
          }
          break;
        }
        case "d":
          markReviewed(current.id, "drop");
          dropped++;
          decided = true;
          break;
        case "s":
          // Deliberately NOT recorded — a skip means "decide later".
          skipped++;
          decided = true;
          break;
        case "q":
          summarize(accepted, dropped, skipped, pending.length);
          return;
        default:
          break;
      }
    }
  }

  summarize(accepted, dropped, skipped, pending.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(
  accepted: number,
  dropped: number,
  skipped: number,
  total: number,
): void {
  const decided = accepted + dropped;
  const dropRate = decided === 0 ? 0 : (dropped / decided) * 100;
  const acceptedTotal = readJsonl<Question>(ACCEPTED).length;

  console.clear();
  console.log("\n── Review session ──────────────────────────────────────");
  console.log(`  accepted  ${String(accepted).padStart(3)}`);
  console.log(`  dropped   ${String(dropped).padStart(3)}  (${dropRate.toFixed(0)}% of decided)`);
  console.log(`  skipped   ${String(skipped).padStart(3)}`);
  console.log(`  remaining ${String(total - accepted - dropped - skipped).padStart(3)}`);
  console.log(`\n  ${ACCEPTED} now holds ${acceptedTotal} question(s).`);

  if (decided >= 10 && dropRate < 15) {
    console.log(
      "\n  ⚠ You dropped under 15%. docs/EVAL_HARNESS.md expects 30–40% —\n" +
        "    generated questions that reuse the passage's wording inflate every\n" +
        "    metric. Consider a stricter second pass.",
    );
  }
  console.log("\n  Validate when done:  npm run eval:validate\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
