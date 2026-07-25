/**
 * Confirm the Phase 0 eval tables exist and are reachable.
 *
 *   npx tsx scripts/check-eval-tables.ts
 *
 * Uses the app's own SUPABASE_SERVICE_ROLE_KEY, so it verifies the database the
 * app actually talks to — independent of whichever account an MCP integration
 * happens to be signed into.
 */
import "../src/lib/loadenv";

import { db } from "../src/lib/db";

const TABLES = ["eval_runs", "eval_questions", "eval_results"] as const;

async function main(): Promise<void> {
  const ref = (process.env.SUPABASE_URL ?? "").match(/\/\/([a-z0-9]+)\./)?.[1] ?? "?";
  console.log(`\nProject ref from .env.local: ${ref}\n`);

  let missing = 0;
  for (const table of TABLES) {
    // A plain select, NOT `head: true`. A HEAD request against a table PostgREST
    // doesn't know about returns no error and a null count — which reads as an
    // empty table and reports a missing schema as present.
    const res = await db.from(table).select("*").limit(1);
    if (res.error) {
      missing++;
      console.log(`  ✗ ${table.padEnd(16)} ${res.error.message}`);
    } else {
      const count = await db.from(table).select("*", { count: "exact", head: true });
      console.log(`  ✓ ${table.padEnd(16)} exists (${count.count ?? 0} row(s))`);
    }
  }

  if (missing > 0) {
    console.log(
      `\n${missing} table(s) missing. Apply the migration:\n` +
        `  supabase/migrations/20260725175000_eval_harness.sql\n` +
        `into the SQL editor of project ${ref}, then re-run this check.\n`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nAll eval tables present.");

  if (!process.argv.includes("--deep")) {
    console.log("\nRun with --deep to also exercise constraints and cascade.\n");
    return;
  }

  // Existence proves the tables were created; it does not prove the CHECK
  // constraints, the unique index, or the FK cascade came with them. Exercise
  // each against a throwaway run, then delete it.
  console.log("\n── Deep check ──────────────────────────────────────────");
  const failures: string[] = [];
  let runId: string | null = null;

  try {
    const run = await db
      .from("eval_runs")
      .insert({ git_sha: "deadbeef", variant: { name: "__probe__" } })
      .select("run_id")
      .single();
    if (run.error) throw new Error(`eval_runs insert: ${run.error.message}`);
    runId = run.data.run_id as string;
    console.log("  ✓ eval_runs accepts an insert");

    const first = await db
      .from("eval_results")
      .insert({ run_id: runId, question_id: "q-probe", answer: "x" });
    if (first.error) throw new Error(`eval_results insert: ${first.error.message}`);
    console.log("  ✓ eval_results accepts an insert");

    // Unique (run_id, question_id) — makes the runner's incremental writes
    // idempotent on retry instead of duplicating rows.
    const dup = await db
      .from("eval_results")
      .insert({ run_id: runId, question_id: "q-probe", answer: "y" });
    if (dup.error) console.log("  ✓ unique (run_id, question_id) rejects duplicates");
    else failures.push("unique (run_id, question_id) did NOT reject a duplicate row");

    // CHECK: an unanswerable question may not carry an expected answer.
    const badCheck = await db.from("eval_questions").insert({
      id: "__probe_bad__",
      question: "probe",
      type: "unanswerable",
      expected_answer: "should be rejected",
      difficulty: "easy",
    });
    if (badCheck.error) {
      console.log("  ✓ CHECK rejects unanswerable + expected_answer");
    } else {
      failures.push("CHECK did NOT reject an unanswerable question with an answer");
      await db.from("eval_questions").delete().eq("id", "__probe_bad__");
    }

    // FK cascade: deleting the run must take its results with it.
    await db.from("eval_runs").delete().eq("run_id", runId);
    const orphans = await db
      .from("eval_results")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId);
    if ((orphans.count ?? 0) === 0) {
      console.log("  ✓ deleting a run cascades to its results");
      runId = null;
    } else {
      failures.push(`FK cascade left ${orphans.count} orphaned eval_results row(s)`);
    }
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
  } finally {
    if (runId) await db.from("eval_runs").delete().eq("run_id", runId);
  }

  if (failures.length > 0) {
    console.error("\n── FAILED ──────────────────────────────────────────────");
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error("");
    process.exitCode = 1;
    return;
  }
  console.log("\nSchema behaves as the migration specifies. Probe rows removed.\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
