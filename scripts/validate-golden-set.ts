/**
 * Golden set validation — Phase 1 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:validate [-- --file eval/golden/questions.jsonl]
 *
 * Fails loudly (exit 1) if any of these hold:
 *   - an id is duplicated
 *   - a relevantChunkIds entry does not exist in the database
 *   - an answerable question has an empty relevantChunkIds
 *   - an unanswerable question has a non-null expectedAnswer
 *   - the type distribution deviates more than 25% from the composition table
 *
 * Every check exists because violating it silently corrupts a metric rather than
 * crashing: a dangling chunk id makes recall unscoreable, an unanswerable
 * question with an answer inverts the refusal metric, and a skewed distribution
 * makes the headline number a statement about whichever bucket dominates.
 */
import "../src/lib/loadenv";

import { existsSync, readFileSync } from "node:fs";

import { existingChunkIds } from "../eval/src/corpus";
import type { Question, QuestionType } from "../eval/src/types";

const DEFAULT_FILE = "eval/golden/questions.jsonl";

/** Composition table from docs/EVAL_HARNESS.md, as percentages. */
const TARGET_MIX: Record<QuestionType, number> = {
  factoid: 35,
  multihop: 20,
  aggregation: 10,
  unanswerable: 20,
  paraphrase: 15,
};

/** Relative tolerance on each bucket's share, per the spec. */
const TOLERANCE = 0.25;

const VALID_TYPES = new Set<string>(Object.keys(TARGET_MIX));
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function parseArgs(argv: string[]): { file: string; skipDb: boolean } {
  let file = DEFAULT_FILE;
  let skipDb = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("--file requires a value");
      file = value;
    } else if (argv[i] === "--skip-db") {
      skipDb = true;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return { file, skipDb };
}

async function main(): Promise<void> {
  const { file, skipDb } = parseArgs(process.argv.slice(2));

  if (!existsSync(file)) {
    throw new Error(`Golden set not found: ${file}\nRun: npm run eval:golden, then npm run eval:review`);
  }

  const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  const questions: Question[] = [];
  const errors: string[] = [];

  lines.forEach((line, i) => {
    try {
      questions.push(JSON.parse(line) as Question);
    } catch (err) {
      errors.push(`line ${i + 1}: not valid JSON — ${errorMessage(err)}`);
    }
  });

  if (questions.length === 0) {
    throw new Error(`${file} contains no parseable questions.`);
  }

  // --- Per-question invariants ---------------------------------------------
  const seen = new Set<string>();
  for (const q of questions) {
    const where = q.id ?? "(missing id)";

    if (!q.id) errors.push(`${where}: missing id`);
    else if (seen.has(q.id)) errors.push(`${q.id}: duplicate id`);
    else seen.add(q.id);

    if (!q.question?.trim()) errors.push(`${where}: empty question text`);
    if (!VALID_TYPES.has(q.type)) errors.push(`${where}: invalid type "${q.type}"`);
    if (!VALID_DIFFICULTIES.has(q.difficulty)) {
      errors.push(`${where}: invalid difficulty "${q.difficulty}"`);
    }

    if (q.type === "unanswerable") {
      if (q.expectedAnswer !== null) {
        errors.push(
          `${where}: unanswerable question has a non-null expectedAnswer ` +
            `(${JSON.stringify(q.expectedAnswer)?.slice(0, 60)})`,
        );
      }
      if (q.relevantChunkIds.length > 0) {
        errors.push(`${where}: unanswerable question lists relevantChunkIds`);
      }
    } else {
      if (!Array.isArray(q.relevantChunkIds) || q.relevantChunkIds.length === 0) {
        errors.push(`${where}: answerable question has empty relevantChunkIds`);
      }
      if (!Array.isArray(q.relevantDocIds) || q.relevantDocIds.length === 0) {
        errors.push(`${where}: answerable question has empty relevantDocIds`);
      }
    }

    if (q.type === "paraphrase" && !q.paraphraseOf) {
      errors.push(`${where}: paraphrase question has no paraphraseOf`);
    }
    if (q.paraphraseOf && !questions.some((other) => other.id === q.paraphraseOf)) {
      errors.push(`${where}: paraphraseOf "${q.paraphraseOf}" does not exist in this set`);
    }
  }

  // --- Chunk ids must resolve against the live database --------------------
  if (skipDb) {
    console.log("Skipping database chunk-id check (--skip-db).");
  } else {
    const referenced = questions.flatMap((q) => q.relevantChunkIds);
    const found = await existingChunkIds(referenced);
    for (const q of questions) {
      for (const id of q.relevantChunkIds) {
        if (!found.has(id)) {
          errors.push(`${q.id}: relevantChunkIds entry "${id}" does not exist in the DB`);
        }
      }
    }
  }

  // --- Type distribution ---------------------------------------------------
  const counts = questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});

  const distributionRows: string[] = [];
  for (const type of Object.keys(TARGET_MIX) as QuestionType[]) {
    const actualPct = ((counts[type] ?? 0) / questions.length) * 100;
    const targetPct = TARGET_MIX[type];
    const deviation = Math.abs(actualPct - targetPct) / targetPct;
    const ok = deviation <= TOLERANCE;

    distributionRows.push(
      `  ${type.padEnd(13)} ${String(counts[type] ?? 0).padStart(3)}  ` +
        `${actualPct.toFixed(1).padStart(5)}%  target ${String(targetPct).padStart(2)}%  ` +
        `dev ${(deviation * 100).toFixed(0).padStart(3)}%  ${ok ? "ok" : "OUT OF RANGE"}`,
    );

    if (!ok) {
      errors.push(
        `distribution: ${type} is ${actualPct.toFixed(1)}% of the set but the ` +
          `table targets ${targetPct}% — ${(deviation * 100).toFixed(0)}% deviation ` +
          `exceeds the ${TOLERANCE * 100}% tolerance`,
      );
    }
  }

  // --- Report --------------------------------------------------------------
  console.log(`\nValidating ${file} — ${questions.length} question(s)\n`);
  console.log("── Type distribution ───────────────────────────────────");
  for (const row of distributionRows) console.log(row);

  if (errors.length > 0) {
    console.error(`\n── FAILED: ${errors.length} problem(s) ────────────────────────`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    console.error("");
    // Set the code and return rather than process.exit(): tearing the process
    // down while the Supabase client still holds open handles trips a libuv
    // assertion on Windows and reports 127 instead of 1, which would make the
    // Phase 7/9 gate unreadable.
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ Golden set is valid (${questions.length} questions).\n`);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
