-- Raw judge output on eval_results — Phase 8 of docs/EVAL_HARNESS.md.
--
-- The four judge scores already reach the database flattened into
-- `metrics` (faithfulness, correctness, citationAccuracy, refusalAccuracy).
-- What never did is the reasoning BEHIND them: the atomic claims and their
-- labels, the correctness verdict's justification, which citation was judged
-- invalid and why.
--
-- Phase 3 added that to the JSONL run files and deliberately stopped there,
-- because nothing read it from the database. Phase 8's per-question drill-down
-- is what reads it: "faithfulness dropped" is only three clicks from "here is
-- the claim the judge marked unsupported, and here is the passage it was
-- checked against" if the verdicts are queryable.
--
-- Nullable, and absent is not "not judged": every run written before this
-- column existed has null here, and a retrieval-only run has null forever by
-- construction. The dashboard distinguishes the two by whether `metrics`
-- carries judge scores at all.

alter table eval_results
  add column if not exists judge jsonb;

comment on column eval_results.judge is
  'Raw JudgeScores from eval/src/metrics/judge.ts: per-claim faithfulness '
  'labels, correctness reasoning, per-citation validity. Null for runs '
  'predating this column and for --retrieval-only runs.';
