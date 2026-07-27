/**
 * One-off correction of calibration labels that were settled against the source.
 *
 *   npx tsx scripts/adjudicate-calibration.ts [--dry-run]
 *
 * WHY THIS EXISTS AND WHY IT IS NOT `--relabel`. Relabelling asks a reviewer to
 * judge again; this records that a dispute was resolved by reading the corpus.
 * The six faithfulness labels below were marked "unfaithful" against answers
 * whose every claim is in the retrieved passages — most of them near-verbatim,
 * one buried mid-paragraph on page 26, one with a surname split across a line
 * break as "Ja- son Reifler". The reviewer was scanning eight passages and
 * ~16,000 characters by eye, which is a task that produces exactly this error.
 *
 * These corrections are NOT calibration data. They were made knowing what the
 * judge said, so counting them would score the judge against labels derived
 * from its own output. Each carries its evidence and is excluded from the kappa
 * by report() in scripts/calibrate-judge.ts. The real number comes from a fresh
 * unanchored sample.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const LABELS_FILE = "eval/golden/judge-calibration.jsonl";

/** questionId -> where in the corpus the claim was found. */
const EVIDENCE: Record<string, string> = {
  "q-0004":
    'passage [1] p.26: "In the end, the time-aware inconsistency loss drops from 4.0 to 2.5." ' +
    "The answer restates the passage almost word for word.",
  "q-0005":
    'passage [1] p.20: "every experiment was run on a standard computer with 32 GB of primary ' +
    'memory and an Intel Core i7-8700 processor running at 3.20 GHz on Microsoft Windows 10 ' +
    '64-bit." Verbatim.',
  "q-0006":
    'passage [1] p.6, reference list: "Jin Woo Kim, Andrew Guess, Brendan Nyhan, and Ja- son ' +
    'Reifler. 2021. The distorting prism of social media..." The surname is split across a line ' +
    "break, which is why it reads as absent.",
  "q-0018":
    'passage [1] p.9: "Task 12 asks ChatGPT to recognize the javascript one-liner that opens a ' +
    'popup browser window."',
  "q-0022":
    'passage [1] p.20: "affordance reasoning and extraction [96] can used few-shot KGC models to ' +
    'generate affordance for unseen entities with pre-trained LMs or similarity-matching with ' +
    'seen entities in the background KG."',
  "q-0012":
    'passage [3] p.4: "The new created dataset was cleaned and formed a corpus of 41,070 pairwise ' +
    'sentences." passage [7] p.3: "We use WikiSection for training and evaluating our model."',
};

interface Label {
  questionId: string;
  human: Record<string, string | null>;
  adjudicated?: {
    field: string;
    from: string | null;
    to: string | null;
    evidence: string;
    at: string;
  }[];
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(LABELS_FILE)) throw new Error(`${LABELS_FILE} does not exist.`);
  const labels = readFileSync(LABELS_FILE, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Label);

  const at = new Date().toISOString();
  let changed = 0;

  for (const label of labels) {
    const evidence = EVIDENCE[label.questionId];
    if (!evidence) continue;

    const from = label.human.faithful;
    if (from === "faithful") {
      console.log(`  ${label.questionId}  already "faithful" — nothing to correct`);
      continue;
    }
    if (label.adjudicated?.some((a) => a.field === "faithful")) {
      console.log(`  ${label.questionId}  already adjudicated — left alone`);
      continue;
    }

    console.log(`  ${label.questionId}  ${from} -> faithful`);
    console.log(`      ${evidence.slice(0, 100)}...`);

    label.human.faithful = "faithful";
    label.adjudicated = [
      ...(label.adjudicated ?? []),
      { field: "faithful", from, to: "faithful", evidence, at },
    ];
    changed++;
  }

  if (dryRun) {
    console.log(`\n--dry-run: ${changed} label(s) would change. Nothing written.`);
    return;
  }

  writeFileSync(LABELS_FILE, labels.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(
    `\n${changed} label(s) corrected in ${LABELS_FILE}, each with its evidence.\n` +
      `They are excluded from the kappa: a label corrected after the model's\n` +
      `verdict was known cannot measure agreement with that verdict.`,
  );
}

main();
