/**
 * Push local run files to Supabase — Phase 8's backfill.
 *
 *   npm run eval:sync            # every local run
 *   npm run eval:sync -- cca8cc10 414ed084
 *
 * WHY THIS IS NEEDED RATHER THAN "just re-run". Disk is the source of truth for
 * a single run and the database is the source of truth for history, so the two
 * drift whenever a run is written with --skip-db, whenever a Supabase write
 * fails and the runner degrades to disk-only, or — as here — whenever a column
 * is added after the runs that should fill it already exist.
 *
 * The judge column landed in Phase 8. Every run before it wrote its verdicts to
 * JSONL and null to the database, so the drill-down would show an empty panel
 * for exactly the runs worth drilling into. Re-running them to fix that would
 * spend LLM quota reproducing results already on disk. This copies them.
 *
 * Idempotent: upserts on (run_id, question_id), which is the migration's unique
 * index, so running it twice changes nothing.
 */
import "../src/lib/loadenv";

import { readFileSync } from "node:fs";

import { readLocalRuns } from "../eval/src/runs";
import { createRun, finishRun, upsertResults } from "../eval/src/store";
import type { Variant } from "../eval/src/types";

interface RunHeader {
  gitSha?: string;
  variant?: Variant;
  startedAt?: string;
}

async function main(): Promise<void> {
  const refs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const all = readLocalRuns();

  const selected =
    refs.length === 0
      ? all
      : all.filter((r) => refs.some((ref) => r.runId.startsWith(ref)));

  if (selected.length === 0) {
    throw new Error(
      refs.length === 0
        ? "No local runs found."
        : `No local run matches: ${refs.join(", ")}`,
    );
  }

  let synced = 0;
  let skipped = 0;

  for (const run of selected) {
    // A run with no successful results has nothing to show and would create an
    // empty row in the dashboard's run list.
    if (!run.results.some((r) => r.error === null)) {
      skipped++;
      continue;
    }

    const header = JSON.parse(readFileSync(run.file, "utf8").split("\n")[0]) as RunHeader;

    try {
      // createRun takes a Run, but only writes the four identity fields — the
      // rest arrive via finishRun once the run has actually finished. Passing
      // the results here would be writing them twice.
      await createRun({
        runId: run.runId,
        gitSha: header.gitSha ?? "unknown",
        variant: header.variant as Variant,
        startedAt: header.startedAt ?? run.startedAt,
        finishedAt: "",
        results: [],
        aggregate: {},
      });
      await upsertResults(run.runId, run.results);
      if (run.aggregate) {
        await finishRun(
          run.runId,
          new Date().toISOString(),
          run.aggregate,
          "backfilled by scripts/sync-runs.ts",
        );
      }
      synced++;
      const judged = run.results.filter((r) => r.judge).length;
      console.log(
        `  ${run.runId.slice(0, 8)}  ${run.variantName.padEnd(14)} ` +
          `${String(run.results.length).padStart(3)} result(s)` +
          (judged > 0 ? `, ${judged} with judge output` : ""),
      );
    } catch (err) {
      console.error(
        `  ${run.runId.slice(0, 8)}  FAILED: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `\n${synced} run(s) synced` + (skipped > 0 ? `, ${skipped} skipped (no results)` : ""),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
