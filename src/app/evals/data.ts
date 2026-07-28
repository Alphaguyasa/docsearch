/**
 * Server-side reads for the eval dashboard — Phase 8 of docs/EVAL_HARNESS.md.
 *
 * SUPABASE, NOT THE JSONL FILES. Disk is the source of truth for a single run
 * and the database is the source of truth for history (eval/src/store.ts), and
 * a dashboard is a history view. It also has to work on a deployment that never
 * had eval/runs/ — the directory is gitignored, so a Vercel build has none.
 *
 * Everything here is server-only: it imports the service-role client, which
 * reaches Supabase with RLS bypassed. No file in this module may be pulled into
 * a client component — the enforcement is that `db` transitively imports
 * src/lib/env.ts, whose validation throws in a browser bundle, and that every
 * page here is a server component by default.
 */
import { db } from "@/lib/db";

/** One row of the run list. */
export interface RunSummary {
  runId: string;
  gitSha: string;
  variantName: string;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
  aggregate: Record<string, number | null>;
}

export interface RunDetail extends RunSummary {
  variant: Record<string, unknown>;
}

/** A judged or unjudged result, joined to its question. */
export interface ResultRow {
  questionId: string;
  answer: string | null;
  metrics: Record<string, number | null>;
  costUsd: number | null;
  latency: Record<string, number> | null;
  error: string | null;
  question: string | null;
  type: string | null;
  expectedAnswer: string | null;
}

export interface RetrievedChunk {
  chunkId: string;
  docId: string;
  page: number;
  text: string;
  score: number;
  rank: number;
}

export interface Citation {
  chunkId: string;
  docId: string;
  page: number;
}

export interface ResultDetail extends ResultRow {
  retrieved: RetrievedChunk[];
  citations: Citation[];
  judge: JudgeScores | null;
  relevantChunkIds: string[];
  relevantDocIds: string[];
  sourcePages: number[];
  difficulty: string | null;
  notes: string | null;
}

/** Mirrors eval/src/metrics/judge.ts. Duplicated rather than imported so the
 *  app never pulls the harness (and its env validation) into a page render. */
export interface JudgeScores {
  faithfulness: {
    ok: boolean;
    value?: {
      claims: { claim: string; label: string; evidenceChunkId: string | null }[];
      score: number | null;
    };
    error?: string;
  } | null;
  correctness: {
    ok: boolean;
    value?: { verdict: string; reasoning: string; score: number };
    error?: string;
  } | null;
  citationAccuracy: {
    ok: boolean;
    value?: {
      citations: { chunkId: string | null; valid: boolean; reason: string }[];
      score: number;
    };
    error?: string;
  } | null;
  refusal: {
    ok: boolean;
    value?: { refused: boolean; score: number };
    error?: string;
  } | null;
  costUsd: number;
}

interface RunRow {
  run_id: string;
  git_sha: string;
  variant: { name?: string } & Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  aggregate: Record<string, number | null> | null;
}

function toSummary(r: RunRow): RunDetail {
  return {
    runId: r.run_id,
    gitSha: r.git_sha,
    variantName: r.variant?.name ?? "(unknown)",
    variant: r.variant ?? {},
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    notes: r.notes,
    aggregate: r.aggregate ?? {},
  };
}

/**
 * Runs that produced something, newest first.
 *
 * FINISHED RUNS ONLY. A run row is created when the run STARTS, so an
 * in-flight or crashed run has a row with no aggregate — and listing those
 * puts rows of dashes at the top of the table, which reads as "the harness is
 * broken" rather than "this one never finished". The harness's own run
 * directory is full of them: 30 of 76 local files have zero results.
 */
export async function listRuns(limit = 100): Promise<RunDetail[]> {
  const { data, error } = await db
    .from("eval_runs")
    .select("run_id,git_sha,variant,started_at,finished_at,notes,aggregate")
    .not("finished_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit)
    .returns<RunRow[]>();

  if (error) throw new Error(`Failed to load runs: ${error.message}`);
  return (data ?? []).map(toSummary);
}

export async function getRun(runId: string): Promise<RunDetail | null> {
  const { data, error } = await db
    .from("eval_runs")
    .select("run_id,git_sha,variant,started_at,finished_at,notes,aggregate")
    .eq("run_id", runId)
    .maybeSingle<RunRow>();

  if (error) throw new Error(`Failed to load run: ${error.message}`);
  return data ? toSummary(data) : null;
}

interface ResultRowRaw {
  question_id: string;
  answer: string | null;
  metrics: Record<string, number | null> | null;
  cost_usd: number | null;
  latency: Record<string, number> | null;
  error: string | null;
}

interface QuestionRowRaw {
  id: string;
  question: string;
  type: string;
  expected_answer: string | null;
  relevant_chunk_ids: string[] | null;
  relevant_doc_ids: string[] | null;
  source_pages: number[] | null;
  difficulty: string | null;
  notes: string | null;
}

/**
 * Every result in a run, joined to question text.
 *
 * TWO QUERIES AND A CLIENT-SIDE JOIN, not a PostgREST embed. eval_results has
 * no foreign key to eval_questions — deliberately, per the migration, so a run
 * stays readable after the golden set is revised — and without the constraint
 * PostgREST cannot infer the relationship. That is also why a question can come
 * back null here: q-0087 was deleted from the golden set by the unanswerable
 * audit, and runs that included it still reference it.
 */
export async function listResults(runId: string): Promise<ResultRow[]> {
  const { data, error } = await db
    .from("eval_results")
    .select("question_id,answer,metrics,cost_usd,latency,error")
    .eq("run_id", runId)
    .order("question_id")
    .returns<ResultRowRaw[]>();
  if (error) throw new Error(`Failed to load results: ${error.message}`);

  const rows = data ?? [];
  const questions = await questionsById(rows.map((r) => r.question_id));

  return rows.map((r) => {
    const q = questions.get(r.question_id);
    return {
      questionId: r.question_id,
      answer: r.answer,
      metrics: r.metrics ?? {},
      costUsd: r.cost_usd,
      latency: r.latency,
      error: r.error,
      question: q?.question ?? null,
      type: q?.type ?? null,
      expectedAnswer: q?.expected_answer ?? null,
    };
  });
}

async function questionsById(ids: string[]): Promise<Map<string, QuestionRowRaw>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("eval_questions")
    .select(
      "id,question,type,expected_answer,relevant_chunk_ids,relevant_doc_ids,source_pages,difficulty,notes",
    )
    .in("id", [...new Set(ids)])
    .returns<QuestionRowRaw[]>();
  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  return new Map((data ?? []).map((q) => [q.id, q]));
}

/** One result with everything the drill-down shows. */
export async function getResult(
  runId: string,
  questionId: string,
): Promise<ResultDetail | null> {
  const { data, error } = await db
    .from("eval_results")
    .select("question_id,answer,metrics,cost_usd,latency,error,retrieved,citations,judge")
    .eq("run_id", runId)
    .eq("question_id", questionId)
    .maybeSingle<
      ResultRowRaw & {
        retrieved: RetrievedChunk[] | null;
        citations: Citation[] | null;
        judge: JudgeScores | null;
      }
    >();

  if (error) throw new Error(`Failed to load result: ${error.message}`);
  if (!data) return null;

  const q = (await questionsById([questionId])).get(questionId);

  return {
    questionId: data.question_id,
    answer: data.answer,
    metrics: data.metrics ?? {},
    costUsd: data.cost_usd,
    latency: data.latency,
    error: data.error,
    retrieved: data.retrieved ?? [],
    citations: data.citations ?? [],
    judge: data.judge,
    question: q?.question ?? null,
    type: q?.type ?? null,
    expectedAnswer: q?.expected_answer ?? null,
    relevantChunkIds: q?.relevant_chunk_ids ?? [],
    relevantDocIds: q?.relevant_doc_ids ?? [],
    sourcePages: q?.source_pages ?? [],
    difficulty: q?.difficulty ?? null,
    notes: q?.notes ?? null,
  };
}
