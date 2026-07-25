-- Eval harness storage — Phase 0 of docs/EVAL_HARNESS.md.
--
-- Disk (eval/runs/<run_id>.jsonl) is the source of truth for a SINGLE run;
-- these tables are the source of truth for HISTORY (dashboard, regression gate).
--
-- Run this in the Supabase SQL editor, same as schema.sql. This is the first
-- file under supabase/migrations/ — schema.sql remains the base schema and is
-- not superseded by it.

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

create table if not exists eval_runs (
  run_id      uuid primary key default gen_random_uuid(),
  -- Which commit produced these numbers. The Phase 7 gate compares runs across
  -- SHAs, so a run without one cannot be placed in history.
  git_sha     text        not null,
  -- The full resolved Variant, stored verbatim: a config file can be edited
  -- after the fact, so the run must carry its own settings to stay meaningful.
  variant     jsonb       not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  aggregate   jsonb,
  notes       text
);

create index if not exists eval_runs_started_at_idx on eval_runs (started_at desc);


-- ---------------------------------------------------------------------------
-- Golden set
-- ---------------------------------------------------------------------------
-- Mirrors the Question type in eval/src/types.ts. eval/golden/questions.jsonl
-- stays the git-tracked source of truth; this table is a queryable copy so the
-- dashboard can join results to question text.

create table if not exists eval_questions (
  id                 text primary key,
  question           text not null,
  type               text not null
                       check (type in ('factoid', 'multihop', 'aggregation',
                                       'unanswerable', 'paraphrase')),
  -- Null exactly when the question is unanswerable.
  expected_answer    text,
  relevant_chunk_ids jsonb not null default '[]'::jsonb,
  relevant_doc_ids   jsonb not null default '[]'::jsonb,
  source_pages       jsonb not null default '[]'::jsonb,
  difficulty         text not null
                       check (difficulty in ('easy', 'medium', 'hard')),
  notes              text,
  paraphrase_of      text references eval_questions (id) on delete set null,
  created_at         timestamptz not null default now(),

  -- The two invariants Phase 1's validator also enforces, kept here so a bad
  -- row cannot reach the database by any path.
  constraint eval_questions_unanswerable_has_no_answer
    check (type <> 'unanswerable' or expected_answer is null),
  constraint eval_questions_answerable_has_ground_truth
    check (type = 'unanswerable' or jsonb_array_length(relevant_doc_ids) > 0)
);


-- ---------------------------------------------------------------------------
-- Per-question results
-- ---------------------------------------------------------------------------

create table if not exists eval_results (
  id          bigserial primary key,
  run_id      uuid not null references eval_runs (run_id) on delete cascade,
  -- Intentionally NOT a foreign key to eval_questions: a run must stay readable
  -- after the golden set is revised, and Phase 5 joins runs on question_id.
  question_id text not null,
  retrieved   jsonb,
  answer      text,
  citations   jsonb,
  metrics     jsonb,
  cost_usd    numeric(10, 6),
  latency     jsonb,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists eval_results_run_id_idx      on eval_results (run_id);
create index if not exists eval_results_question_id_idx on eval_results (question_id);

-- A run holds at most one result per question; makes the runner's incremental
-- writes idempotent on retry (upsert on this key rather than duplicating rows).
create unique index if not exists eval_results_run_question_idx
  on eval_results (run_id, question_id);


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Same posture as schema.sql: the harness and the app both connect with the
-- service role key, which BYPASSES RLS entirely. Enabling RLS with no
-- permissive policy means anon/authenticated clients read and write nothing —
-- so if the anon key ever reaches client code, eval data is not exposed.
--
-- The policies below are therefore belt-and-braces: they make the intended
-- grant explicit and self-documenting rather than adding capability the service
-- role does not already have. Phase 8's dashboard is read-only and server-side;
-- if it is ever moved to a browser client, add a considered read policy here.

alter table eval_runs      enable row level security;
alter table eval_questions enable row level security;
alter table eval_results   enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    -- Idempotent: drop before create so re-running the migration is safe.
    drop policy if exists eval_runs_service_role      on eval_runs;
    drop policy if exists eval_questions_service_role on eval_questions;
    drop policy if exists eval_results_service_role   on eval_results;

    create policy eval_runs_service_role on eval_runs
      for all to service_role using (true) with check (true);
    create policy eval_questions_service_role on eval_questions
      for all to service_role using (true) with check (true);
    create policy eval_results_service_role on eval_results
      for all to service_role using (true) with check (true);
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- Sanity checks — run after the first eval run
-- ---------------------------------------------------------------------------
-- select count(*) from eval_runs;
-- select count(*) from eval_results where error is not null;   -- expect 0
-- select question_id, count(*) from eval_results group by 1 having count(*) > 1;
