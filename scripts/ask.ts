/**
 * Ask CLI — exercise the full retrieve → cited-answer path from the terminal,
 * before any UI exists. Runs retrieval and generation directly (no HTTP layer).
 *
 *   npm run ask -- "<question>"     Answer one question; print sources + answer.
 *   npm run ask -- --refusals       Acceptance check: the unanswerable questions
 *                                   (u01–u05) must each refuse with the
 *                                   "not covered by these documents" phrase and
 *                                   NO citation markers. Exits non-zero on fail.
 */
import "../src/lib/loadenv"; // must precede modules that read env

import { readFileSync } from "node:fs";

import { streamAnswer, NOT_COVERED_PHRASE } from "../src/lib/answer";
import { retrieve } from "../src/lib/retrieve";
import type { RetrievedChunk } from "../src/lib/retrieve";

const CITATION_RE = /\[\d+\]/;
const REFUSAL_IDS = ["u01", "u02", "u03", "u04", "u05"];

interface EvalQuestion {
  id: string;
  question: string;
}

function printSources(chunks: RetrievedChunk[]): void {
  console.log("Sources:");
  chunks.forEach((c, i) => {
    const page = c.pageNumber === null ? "" : `, p.${c.pageNumber}`;
    console.log(`  [${i + 1}] ${c.title}${page} (${c.filename})`);
  });
  console.log();
}

/** Retrieve for `question`, stream the answer, and return the full text. */
async function ask(question: string, showSources: boolean): Promise<string> {
  const { results } = await retrieve(question);
  if (showSources) printSources(results);

  let answer = "";
  for await (const text of streamAnswer(question, results)) {
    answer += text;
    if (showSources) process.stdout.write(text);
  }
  if (showSources) process.stdout.write("\n");
  return answer;
}

function loadEvalQuestions(): EvalQuestion[] {
  const path = "evals/questions.jsonl";
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as EvalQuestion);
}

/** Acceptance: every unanswerable question refuses cleanly with no citations. */
async function runRefusals(): Promise<void> {
  const byId = new Map(loadEvalQuestions().map((q) => [q.id, q]));
  let failures = 0;

  for (const id of REFUSAL_IDS) {
    const q = byId.get(id);
    if (!q) {
      console.log(`✗ ${id}: not found in evals/questions.jsonl`);
      failures++;
      continue;
    }

    const answer = await ask(q.question, false);
    const refused = answer.toLowerCase().includes(NOT_COVERED_PHRASE);
    const cited = CITATION_RE.test(answer);

    if (refused && !cited) {
      console.log(`✓ ${id}: refused with no citations`);
    } else {
      failures++;
      const why = !refused
        ? `missing "${NOT_COVERED_PHRASE}"`
        : "contains citation marker(s)";
      console.log(`✗ ${id}: ${why}`);
      console.log(`    ${answer.replace(/\s+/g, " ").trim().slice(0, 200)}`);
    }
  }

  console.log();
  if (failures > 0) {
    console.log(`${failures} of ${REFUSAL_IDS.length} refusal checks FAILED.`);
    process.exit(1);
  }
  console.log(`All ${REFUSAL_IDS.length} refusal checks passed.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "--refusals") {
    await runRefusals();
    return;
  }

  const question = args[0];
  if (!question || question.startsWith("--")) {
    throw new Error('Usage: npm run ask -- "<question>"  |  npm run ask -- --refusals');
  }
  await ask(question, true);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
