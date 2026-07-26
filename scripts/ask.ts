/**
 * Ask CLI — exercise the full retrieve → cited-answer path from the terminal,
 * before any UI exists. Runs retrieval and generation directly (no HTTP layer).
 *
 *   npm run ask -- "<question>"     Answer one question; print sources + answer.
 *   npm run ask -- --refusals       Acceptance check: every `unanswerable`
 *                                   question in the DEV golden set must refuse
 *                                   with the "not covered by these documents"
 *                                   phrase and NO citation markers. Exits
 *                                   non-zero on failure.
 *   npm run ask -- --refusals --limit 5    Check only the first N.
 *
 * This is a fast smoke test, not the real measurement — the eval harness's
 * refusal judge (eval/src/metrics/judge.ts) scores this properly. It reads the
 * DEV split only: the holdout is a one-time measurement and must not be spent
 * on a smoke test.
 */
import "../src/lib/loadenv"; // must precede modules that read env

import { streamAnswer, NOT_COVERED_PHRASE } from "../src/lib/answer";
import { loadGoldenSet } from "../eval/src/goldenset";
import { retrieve } from "../src/lib/retrieve";
import type { RetrievedChunk } from "../src/lib/retrieve";

const CITATION_RE = /\[\d+\]/;

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

/** Acceptance: every unanswerable question refuses cleanly with no citations. */
async function runRefusals(limit: number | undefined): Promise<void> {
  // DEV only, always. A holdout question spent here is a holdout question you
  // can no longer report honestly at the end.
  const loaded = loadGoldenSet();
  const unanswerable = loaded.questions.filter((q) => q.type === "unanswerable");

  if (unanswerable.length === 0) {
    throw new Error(
      `No unanswerable questions in ${loaded.file}. ` +
        `Run: npm run eval:golden, then npm run eval:review`,
    );
  }

  const checking = limit === undefined ? unanswerable : unanswerable.slice(0, limit);
  console.log(
    `Checking ${checking.length} of ${unanswerable.length} unanswerable ` +
      `question(s) from ${loaded.file}\n`,
  );

  let failures = 0;

  for (const q of checking) {
    const id = q.id;
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
    console.log(`${failures} of ${checking.length} refusal checks FAILED.`);
    process.exit(1);
  }
  console.log(`All ${checking.length} refusal checks passed.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "--refusals") {
    const at = args.indexOf("--limit");
    const limit = at === -1 ? undefined : Number(args[at + 1]);
    if (at !== -1 && (!Number.isFinite(limit) || limit! <= 0)) {
      throw new Error("--limit must be a positive number");
    }
    await runRefusals(limit);
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
