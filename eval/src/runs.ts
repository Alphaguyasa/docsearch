/**
 * Reading runs back off disk.
 *
 * Shared by scripts/compare-runs.ts and scripts/sweep.ts. It lives here rather
 * than in either script because two independent JSONL parsers is how two tools
 * end up disagreeing about what a run contains — and the disagreement would
 * surface as differing numbers in a report, not as an error.
 *
 * Disk is the source of truth for a single run (see eval/src/store.ts), so
 * everything needed to analyse one run is here. The Supabase read path stays in
 * compare-runs.ts, which is the only tool that needs run HISTORY.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { QuestionResult } from "./types";

export const RUNS_DIR = "eval/runs";

export interface LoadedRun {
  runId: string;
  variantName: string;
  startedAt: string;
  /** Where it came from, so a report is traceable to its inputs. */
  source: string;
  results: QuestionResult[];
}

export interface LocalRun extends LoadedRun {
  file: string;
}

/**
 * A run is a usable analysis target only if something in it succeeded.
 *
 * A crashed run leaves a header line and no results. Comparing against one
 * silently reports every metric as missing rather than saying the run is empty,
 * which is why resolution filters on this rather than just taking the newest.
 */
export function usable(results: QuestionResult[]): boolean {
  return results.some((r) => r.error === null);
}

/**
 * Parse every run file in RUNS_DIR.
 *
 * Tolerant by design, in both directions the runner can fail: a file whose
 * header never finished writing is skipped, and a partial final line from a
 * crash mid-append is dropped while everything before it is kept. That
 * tolerance is the whole point of writing results incrementally — a run that
 * died at question 87 should still yield 86 usable results.
 */
export function readLocalRuns(dir = RUNS_DIR): LocalRun[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    throw new Error(`No runs directory at ${dir}. Run npm run eval:run first.`);
  }

  const runs: LocalRun[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const lines = readFileSync(full, "utf8").split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    let header: {
      type?: string;
      runId?: string;
      variant?: { name?: string };
      startedAt?: string;
    };
    try {
      header = JSON.parse(lines[0]);
    } catch {
      continue;
    }
    if (header.type !== "run" || !header.runId) continue;

    const results: QuestionResult[] = [];
    for (const line of lines.slice(1)) {
      try {
        const row = JSON.parse(line);
        if (row.type === "result") results.push(row as QuestionResult);
      } catch {
        // Partial trailing line from an interrupted append. Keep what parsed.
      }
    }

    runs.push({
      runId: header.runId,
      variantName: header.variant?.name ?? "(unknown)",
      startedAt: header.startedAt ?? "",
      source: full,
      file: full,
      results,
    });
  }
  return runs;
}

/**
 * Resolve a reference to one run: a run id (full or unique prefix), or a
 * variant name, which takes that variant's most recent USABLE run.
 */
export function resolveLocal(ref: string, runs: LocalRun[]): LoadedRun {
  const byId = runs.find((r) => r.runId === ref || r.runId.startsWith(ref));
  if (byId) {
    if (!usable(byId.results)) {
      throw new Error(
        `Run ${byId.runId} has no successful results (${byId.file}). ` +
          `Nothing to compare.`,
      );
    }
    return byId;
  }

  const candidates = runs
    .filter((r) => r.variantName === ref && usable(r.results))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (candidates.length === 0) {
    const known = [...new Set(runs.map((r) => r.variantName))].sort();
    throw new Error(
      `No usable local run found for "${ref}".\n` +
        `  Not a run id in ${RUNS_DIR}, and no run of that variant has results.\n` +
        `  Variants on disk: ${known.join(", ") || "(none)"}`,
    );
  }
  return candidates[0];
}

/** How many questions in this run lost one of hybrid retrieval's two sources. */
export function degradedCount(run: LoadedRun): number {
  return run.results.filter((r) => r.degraded === true).length;
}
