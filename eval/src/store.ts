/**
 * Supabase persistence for runs.
 *
 * Disk (eval/runs/<runId>.jsonl) is the source of truth for a SINGLE run;
 * these tables are the source of truth for HISTORY. So a Supabase failure must
 * never lose a run: the runner writes JSONL incrementally as results arrive and
 * only then upserts here, and every function in this file reports failure
 * without throwing away what is already on disk.
 */
import { db } from "../../src/lib/db";
import { fetchByIds } from "../../src/lib/paginate";

import type { Question, QuestionResult, Run } from "./types";

/** Results per upsert. Well under the URL and payload limits. */
const RESULT_BATCH = 50;

export async function createRun(run: Run): Promise<void> {
  const res = await db.from("eval_runs").upsert(
    {
      run_id: run.runId,
      git_sha: run.gitSha,
      variant: run.variant,
      started_at: run.startedAt,
    },
    { onConflict: "run_id" },
  );
  if (res.error) throw new Error(`eval_runs insert failed: ${res.error.message}`);
}

export async function finishRun(
  runId: string,
  finishedAt: string,
  aggregate: Record<string, number | null>,
  notes: string | null,
): Promise<void> {
  const res = await db
    .from("eval_runs")
    .update({ finished_at: finishedAt, aggregate, notes })
    .eq("run_id", runId);
  if (res.error) throw new Error(`eval_runs update failed: ${res.error.message}`);
}

export async function upsertResults(
  runId: string,
  results: QuestionResult[],
): Promise<void> {
  for (let i = 0; i < results.length; i += RESULT_BATCH) {
    const rows = results.slice(i, i + RESULT_BATCH).map((r) => ({
      run_id: runId,
      question_id: r.questionId,
      retrieved: r.retrieved,
      answer: r.answer,
      citations: r.citations,
      metrics: r.metrics,
      // Raw judge output — the claims, verdicts and reasoning behind the four
      // flattened scores. Phase 8's drill-down reads it; without it, "why did
      // faithfulness drop" is only answerable from the JSONL on someone's disk.
      judge: r.judge ?? null,
      cost_usd: r.costUsd,
      latency: r.latency,
      error: r.error,
    }));

    // Upsert on (run_id, question_id) — the migration's unique index — so a
    // resumed or retried run updates rather than duplicating.
    const res = await db
      .from("eval_results")
      .upsert(rows, { onConflict: "run_id,question_id" });
    if (res.error) {
      throw new Error(
        `eval_results upsert failed at ${i}..${i + rows.length - 1}: ${res.error.message}`,
      );
    }
  }
}

/**
 * Mirror the golden set into eval_questions so the dashboard can join result
 * rows to question text.
 *
 * The table's CHECK constraints duplicate two of the validator's invariants, so
 * a golden set that would fail validation is also rejected here — that is the
 * point, not a redundancy to route around.
 */
export async function syncQuestions(questions: Question[]): Promise<void> {
  // Parents before children: paraphrase_of is a self-referencing FK, so a
  // paraphrase written before its parent is rejected.
  const ordered = [...questions].sort((a, b) => {
    if (a.paraphraseOf && !b.paraphraseOf) return 1;
    if (!a.paraphraseOf && b.paraphraseOf) return -1;
    return 0;
  });

  // A `--subset` or `--types` run syncs only the questions it will execute, so
  // a paraphrase's parent may not be in the batch at all — and the FK rejects
  // the whole upsert, taking Supabase persistence down with it. The link is
  // dropped for those rows rather than the run losing its database record:
  // this table is a queryable MIRROR for the dashboard, and the golden set
  // files remain the source of truth for paraphrase pairing.
  const present = new Set(ordered.map((q) => q.id));

  for (let i = 0; i < ordered.length; i += RESULT_BATCH) {
    const rows = ordered.slice(i, i + RESULT_BATCH).map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      expected_answer: q.expectedAnswer,
      relevant_chunk_ids: q.relevantChunkIds,
      relevant_doc_ids: q.relevantDocIds,
      source_pages: q.sourcePages,
      difficulty: q.difficulty,
      notes: q.notes ?? null,
      paraphrase_of:
        q.paraphraseOf && present.has(q.paraphraseOf) ? q.paraphraseOf : null,
    }));
    const res = await db.from("eval_questions").upsert(rows, { onConflict: "id" });
    if (res.error) {
      throw new Error(`eval_questions upsert failed: ${res.error.message}`);
    }
  }
}

/** Which of `ids` already exist, so a resumed run can skip finished questions. */
export async function existingResultIds(
  runId: string,
  questionIds: string[],
): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();
  const rows = await fetchByIds<{ question_id: string }>(
    "eval_results",
    questionIds,
    (batch) =>
      db
        .from("eval_results")
        .select("question_id")
        .eq("run_id", runId)
        .in("question_id", batch)
        .returns<{ question_id: string }[]>(),
  );
  return new Set(rows.map((r) => r.question_id));
}
