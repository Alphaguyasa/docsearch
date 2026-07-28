/**
 * Audit the unanswerable bucket against the WHOLE corpus.
 *
 *   npm run eval:audit-unanswerable -- [--holdout] [--chars 700]
 *
 * THE STANDING CHECK docs/EVAL_RESULTS.md records after the dev-split audit: an
 * unanswerable question is valid only if it is unanswerable from every document,
 * not from the one it was drafted against. Four of fifteen dev questions failed
 * that test — each drafted as absent from ONE paper and phrased with no entity
 * anchor, so another of the ninety answered it.
 *
 * RETRIEVAL ONLY, NO GENERATION, and that is deliberate. The question being
 * asked here is about the CORPUS ("does the answer exist anywhere?"), not about
 * the system ("did it answer well?"). Running the generator would produce an
 * opinion to read instead of evidence, cost quota, and — on the holdout — spend
 * part of the one measurement the split exists to protect. Printing the top
 * passages lets a human answer the corpus question directly.
 *
 * This prints; it does not judge. Deciding whether a passage answers a question
 * is the reviewer's job, which is the whole reason the dev audit found what an
 * automated check had missed.
 */
import "../src/lib/loadenv";

import { DEV_FILE, HOLDOUT_FILE, parseJsonl } from "../eval/src/goldenset";
import type { Question } from "../eval/src/types";
import { retrieve } from "../src/lib/retrieve";

interface Args {
  holdout: boolean;
  chars: number;
  top: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { holdout: false, chars: 700, top: 5 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--holdout") args.holdout = true;
    else if (argv[i] === "--chars") args.chars = Number(argv[++i]);
    else if (argv[i] === "--top") args.top = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!Number.isFinite(args.chars) || args.chars <= 0) throw new Error("--chars must be positive");
  if (!Number.isFinite(args.top) || args.top <= 0) throw new Error("--top must be positive");
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = args.holdout ? HOLDOUT_FILE : DEV_FILE;

  if (args.holdout) {
    console.log(
      "\n⚠ READING THE HOLDOUT. This is a golden-set validity check, not a\n" +
        "  measurement: retrieval only, no metrics computed, nothing tuned. The\n" +
        "  alternative is a final number measured against questions known to be\n" +
        "  mislabelled.\n",
    );
  }

  const questions = parseJsonl<Question>(file).rows.filter((q) => q.type === "unanswerable");
  console.log(`${questions.length} unanswerable question(s) in ${file}\n`);

  for (const q of questions) {
    console.log("═".repeat(78));
    console.log(`${q.id}   ${q.notes ?? ""}`);
    console.log(`\nQ: ${q.question}\n`);

    const { results } = await retrieve(q.question, { limit: args.top });
    if (results.length === 0) {
      console.log("  (nothing retrieved)\n");
      continue;
    }

    for (const [i, c] of results.entries()) {
      console.log(`  [${i + 1}] ${c.title} p.${c.pageNumber ?? "?"}`);
      console.log(`      ${c.content.slice(0, args.chars).replace(/\s+/g, " ")}\n`);
    }
  }

  console.log("═".repeat(78));
  console.log(
    "\nFor each: does any passage above answer the question?\n" +
      "  yes → the question is NOT unanswerable. Re-anchor it to its intended\n" +
      "        paper, reclassify it, or drop it.\n" +
      "  no  → it stands.\n",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
