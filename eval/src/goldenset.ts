/**
 * Golden set loading, and the dev/holdout boundary.
 *
 * THE POINT OF THE HOLDOUT: docs/EVAL_HARNESS.md names test-set leakage as the
 * first trap worth naming in advance — if you tune retrieval until the questions
 * you can see score well, you have measured your tuning, not your system. The
 * holdout is the answer, and it only works if reaching it is deliberate. So
 * every default here is the DEV split, and the holdout requires an explicit flag
 * at every call site.
 *
 * WHAT THE HOLDOUT COVERS: factoid, unanswerable, and paraphrase only. Multi-hop
 * (n=7) and aggregation (n=8) stay entirely in dev — splitting them would leave
 * both sides too small to mean anything, and they are too small to tune against
 * in the first place. A holdout number is therefore a statement about
 * factoid/unanswerable/paraphrase performance, NOT about the system overall.
 */
import { existsSync, readFileSync } from "node:fs";

import type { Question } from "./types";

export const DEV_FILE = "eval/golden/questions.dev.jsonl";
export const HOLDOUT_FILE = "eval/golden/questions.holdout.jsonl";

/** Pre-split file. Kept as a constant so the splitter and its docs agree. */
export const COMBINED_FILE = "eval/golden/questions.jsonl";

/** Seed for the dev/holdout split. Recorded in both files' headers. */
export const SPLIT_SEED = 42;

/**
 * JSONL with `#` header lines.
 *
 * The split parameters have to travel WITH the data — a seed recorded only in a
 * commit message is a seed nobody can find when the numbers are questioned two
 * months later. Readers skip `#` lines; nothing else in the format changes.
 */
export function parseJsonl<T>(file: string): { header: string[]; rows: T[] } {
  const header: string[] = [];
  const rows: T[] = [];

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      header.push(trimmed.replace(/^#\s?/, ""));
      continue;
    }
    rows.push(JSON.parse(trimmed) as T);
  }
  return { header, rows };
}

export function formatHeader(lines: string[]): string {
  return lines.map((l) => (l ? `# ${l}` : "#")).join("\n") + "\n";
}

export interface LoadOptions {
  /** Load the HOLDOUT split. Must be set explicitly — never inferred. */
  holdout?: boolean;
  /** Explicit path, overriding the split. Used by the reviewer and validator. */
  file?: string;
}

export interface LoadedSet {
  questions: Question[];
  header: string[];
  file: string;
  isHoldout: boolean;
}

/**
 * Load the golden set. Defaults to DEV.
 *
 * Falls back to the pre-split combined file when the split does not exist yet,
 * so the harness still runs on a repo that has not been split — but it says so,
 * because silently reading the combined set is exactly the leakage this module
 * exists to prevent.
 */
export function loadGoldenSet(options: LoadOptions = {}): LoadedSet {
  const isHoldout = options.holdout === true;
  let file = options.file ?? (isHoldout ? HOLDOUT_FILE : DEV_FILE);

  if (!options.file && !existsSync(file)) {
    if (isHoldout) {
      throw new Error(
        `Holdout set not found: ${HOLDOUT_FILE}\n` +
          `Create it with: npx tsx scripts/split-golden-set.ts`,
      );
    }
    if (!existsSync(COMBINED_FILE)) {
      throw new Error(
        `No golden set found. Expected ${DEV_FILE} (or ${COMBINED_FILE}).\n` +
          `Run: npm run eval:golden, then npm run eval:review`,
      );
    }
    console.warn(
      `⚠ ${DEV_FILE} not found — falling back to the UNSPLIT ${COMBINED_FILE}.\n` +
        `  This set includes the holdout. Any tuning against it leaks.\n` +
        `  Split it with: npx tsx scripts/split-golden-set.ts\n`,
    );
    file = COMBINED_FILE;
  }

  const { header, rows } = parseJsonl<Question>(file);
  return { questions: rows, header, file, isHoldout };
}

/**
 * Announce a holdout read, loudly.
 *
 * A holdout is a one-shot instrument: every look at it spends a little of its
 * value, and looking repeatedly while iterating turns it back into a dev set
 * without anyone deciding to do that. The warning is the only thing standing
 * between "final measurement" and "second dev set".
 */
export function warnHoldout(loaded: LoadedSet): void {
  if (!loaded.isHoldout) return;
  console.warn(
    "\n" +
      "╔══════════════════════════════════════════════════════════════════════╗\n" +
      "║  HOLDOUT SET — THIS IS A ONE-TIME MEASUREMENT                        ║\n" +
      "╚══════════════════════════════════════════════════════════════════════╝\n" +
      `  ${loaded.questions.length} question(s) from ${loaded.file}\n` +
      "  Report this number once, at the end, alongside the dev number.\n" +
      "  Do NOT tune against it, and do not re-run it after a change — every\n" +
      "  look spends part of what makes it worth having.\n" +
      "  Covers factoid / unanswerable / paraphrase ONLY: multi-hop and\n" +
      "  aggregation are dev-only, so this is not a whole-system number.\n",
  );
}

/**
 * Paraphrase families: a factoid and every paraphrase pointing at it.
 *
 * The atomic unit of the split. A paraphrase measures whether retrieval is
 * robust to rewording THE SAME question — so if it lands in one split and its
 * parent in the other, tuning on the parent transfers directly to the holdout
 * twin. That is leakage of the most direct kind available.
 */
export function paraphraseFamilies(questions: Question[]): Map<string, Question[]> {
  const families = new Map<string, Question[]>();
  for (const q of questions) {
    const root = q.paraphraseOf ?? q.id;
    const members = families.get(root);
    if (members) members.push(q);
    else families.set(root, [q]);
  }
  return families;
}

/**
 * Throw unless the split is clean: no paraphrase family straddles it, and no id
 * appears in both halves or in neither.
 */
export function assertCleanSplit(dev: Question[], holdout: Question[]): void {
  const devIds = new Set(dev.map((q) => q.id));
  const holdoutIds = new Set(holdout.map((q) => q.id));

  const both = [...devIds].filter((id) => holdoutIds.has(id));
  if (both.length > 0) {
    throw new Error(`Split is not disjoint: ${both.length} id(s) in both halves.`);
  }

  const problems: string[] = [];

  for (const q of holdout) {
    if (q.paraphraseOf && devIds.has(q.paraphraseOf)) {
      problems.push(
        `${q.id} (holdout) paraphrases ${q.paraphraseOf} (dev) — tuning on the ` +
          `dev parent transfers straight to this holdout question`,
      );
    }
  }
  for (const q of dev) {
    if (q.paraphraseOf && holdoutIds.has(q.paraphraseOf)) {
      problems.push(`${q.id} (dev) paraphrases ${q.paraphraseOf} (holdout)`);
    }
  }

  // A parent in holdout whose child is in dev is caught above from the dev side;
  // this catches a parent whose children were dropped entirely.
  for (const q of [...dev, ...holdout]) {
    if (q.paraphraseOf && !devIds.has(q.paraphraseOf) && !holdoutIds.has(q.paraphraseOf)) {
      problems.push(`${q.id} paraphrases ${q.paraphraseOf}, which is in neither split`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `LEAKAGE — the split is not clean:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"),
    );
  }
}
