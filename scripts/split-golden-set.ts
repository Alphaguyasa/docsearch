/**
 * Split the golden set into dev and holdout — Phase 1 close-out.
 *
 *   npx tsx scripts/split-golden-set.ts [--dry-run] [--seed 42]
 *
 * Seeded and reproducible: the same seed over the same input always produces the
 * same split, and the seed is written into both files' headers so a number can
 * always be traced back to the split that produced it.
 *
 * THE SPLIT RULE, and why it is not a uniform sample:
 *
 *   - The holdout is drawn ONLY from factoid, unanswerable, and paraphrase.
 *   - Multi-hop (n=7) and aggregation (n=8) stay entirely in dev. Splitting them
 *     would leave both halves too small to support any conclusion, and they are
 *     too small to tune against in the first place.
 *   - Paraphrase families are atomic. A paraphrase and its parent factoid never
 *     straddle the split — a paraphrase exists to test robustness to rewording
 *     THE SAME question, so tuning on the parent would transfer directly to the
 *     holdout twin.
 *
 * The consequence is stated wherever the holdout is read: a holdout number is a
 * statement about factoid/unanswerable/paraphrase performance, not about the
 * system as a whole.
 */
import { existsSync, writeFileSync } from "node:fs";

import { mulberry32, shuffle } from "../eval/src/entities";
import {
  assertCleanSplit,
  COMBINED_FILE,
  DEV_FILE,
  formatHeader,
  HOLDOUT_FILE,
  paraphraseFamilies,
  parseJsonl,
  SPLIT_SEED,
} from "../eval/src/goldenset";
import type { Question, QuestionType } from "../eval/src/types";

/** Types the holdout may draw from, and how many of each. */
const HOLDOUT_TARGET: Partial<Record<QuestionType, number>> = {
  factoid: 7,
  unanswerable: 5,
  paraphrase: 3,
};

/** Types that stay entirely in dev, with the reason recorded for the header. */
const DEV_ONLY: Record<string, string> = {
  multihop: "n=7 — too small to split, too small to tune against",
  aggregation: "n=8 — too small to split, too small to tune against",
};

function counts(questions: Question[]): Record<string, number> {
  return questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});
}

function summarise(questions: Question[]): string {
  const c = counts(questions);
  return (Object.keys(c) as string[])
    .sort()
    .map((t) => `${t} ${c[t]}`)
    .join(", ");
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const seedArg = process.argv.indexOf("--seed");
  const seed = seedArg === -1 ? SPLIT_SEED : Number(process.argv[seedArg + 1]);
  if (!Number.isFinite(seed)) throw new Error("--seed must be a number");

  if (!existsSync(COMBINED_FILE)) {
    throw new Error(`Nothing to split: ${COMBINED_FILE} not found.`);
  }

  const { rows: all } = parseJsonl<Question>(COMBINED_FILE);
  if (all.length === 0) throw new Error(`${COMBINED_FILE} is empty.`);

  const rand = mulberry32(seed);
  const families = paraphraseFamilies(all);

  // Any family touching a dev-only type is pinned to dev outright.
  const eligible: Question[][] = [];
  const pinned: Question[][] = [];
  for (const members of families.values()) {
    if (members.some((q) => DEV_ONLY[q.type] !== undefined)) pinned.push(members);
    else eligible.push(members);
  }

  // Families carrying a paraphrase are selected FIRST. They are the constrained
  // resource: each supplies exactly one factoid alongside its paraphrase, so
  // choosing them first fixes part of the factoid quota, and choosing standalone
  // factoids first would overshoot it.
  const shuffled = shuffle(eligible, rand);
  const withParaphrase = shuffled.filter((m) => m.some((q) => q.type === "paraphrase"));
  const withoutParaphrase = shuffled.filter((m) => !m.some((q) => q.type === "paraphrase"));

  const holdout: Question[] = [];
  const taken = new Set<Question[]>();
  const need: Record<string, number> = { ...HOLDOUT_TARGET } as Record<string, number>;

  const wouldOvershoot = (members: Question[]): boolean =>
    Object.entries(counts(members)).some(([type, n]) => (need[type] ?? 0) < n);

  const take = (members: Question[]): void => {
    taken.add(members);
    holdout.push(...members);
    for (const [type, n] of Object.entries(counts(members))) need[type] -= n;
  };

  for (const members of withParaphrase) {
    if ((need.paraphrase ?? 0) <= 0) break;
    if (wouldOvershoot(members)) continue;
    take(members);
  }
  for (const members of withoutParaphrase) {
    if (Object.values(need).every((n) => n <= 0)) break;
    if (wouldOvershoot(members)) continue;
    // Only take a family that still contributes something needed.
    if (Object.entries(counts(members)).every(([type]) => (need[type] ?? 0) <= 0)) continue;
    take(members);
  }

  const holdoutIds = new Set(holdout.map((q) => q.id));
  const dev = all.filter((q) => !holdoutIds.has(q.id));

  // Fail loudly rather than writing a leaky split.
  assertCleanSplit(dev, holdout);

  const shortfall = Object.entries(need).filter(([, n]) => n > 0);
  if (shortfall.length > 0) {
    throw new Error(
      `Could not fill the holdout: short by ` +
        shortfall.map(([t, n]) => `${n} ${t}`).join(", ") +
        `. Not enough eligible families — lower HOLDOUT_TARGET or accept a ` +
        `smaller holdout, but do NOT split a paraphrase family to make it fit.`,
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const ruleLines = [
    `Holdout drawn ONLY from: ${Object.keys(HOLDOUT_TARGET).join(", ")}.`,
    ...Object.entries(DEV_ONLY).map(([type, why]) => `${type} is dev-only — ${why}.`),
    "Paraphrase families are atomic: a paraphrase and its parent never straddle",
    "the split, which would leak tuning from the parent to the holdout twin.",
  ];

  const devHeader = formatHeader([
    "DocSearch golden set — DEV split. Tune against this one.",
    `Generated ${stamp} by scripts/split-golden-set.ts (seed ${seed}).`,
    `Source: ${COMBINED_FILE} (${all.length} questions).`,
    `Counts: ${summarise(dev)}.`,
    "",
    ...ruleLines,
  ]);

  const holdoutHeader = formatHeader([
    "DocSearch golden set — HOLDOUT split. ONE-TIME MEASUREMENT.",
    `Generated ${stamp} by scripts/split-golden-set.ts (seed ${seed}).`,
    `Source: ${COMBINED_FILE} (${all.length} questions).`,
    `Counts: ${summarise(holdout)}.`,
    "",
    "Do NOT tune against this file and do not re-run it after a change.",
    "Report it once, at the end, beside the dev number.",
    "It covers factoid / unanswerable / paraphrase only, so it is NOT a",
    "whole-system number — see the rule below.",
    "",
    ...ruleLines,
  ]);

  console.log(`Split ${all.length} question(s) with seed ${seed}:\n`);
  console.log(`  dev      ${String(dev.length).padStart(3)}  ${summarise(dev)}`);
  console.log(`  holdout  ${String(holdout.length).padStart(3)}  ${summarise(holdout)}`);
  console.log(`\n  holdout ids: ${holdout.map((q) => q.id).sort().join(", ")}`);
  console.log(`\n  ✓ no paraphrase family straddles the split`);

  if (dryRun) {
    console.log("\n(dry run — nothing written)");
    return;
  }

  writeFileSync(DEV_FILE, devHeader + dev.map((q) => JSON.stringify(q)).join("\n") + "\n");
  writeFileSync(
    HOLDOUT_FILE,
    holdoutHeader + holdout.map((q) => JSON.stringify(q)).join("\n") + "\n",
  );

  console.log(`\nWrote ${DEV_FILE} and ${HOLDOUT_FILE}.`);
  console.log(
    `\n${COMBINED_FILE} is now superseded — delete it so nothing reads the\n` +
      `unsplit set by accident. The two halves reproduce it exactly.`,
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
