# DocSearch Eval Harness — Build Guide

A phased build spec for adding a rigorous evaluation and regression-tracking layer to DocSearch (Next.js 15 + Supabase/pgvector + Voyage embeddings + Anthropic API).

**Goal:** turn "I built a RAG pipeline" into "I built a RAG pipeline, measured it, and improved recall@10 from X to Y — here's the chart and here's the confidence interval."

**Estimated effort:** 5–7 focused days.
**Additional API cost:** ~$0–3 on the Anthropic API with the Phase 4 caching rules — or **$0**, running generation and judging on a free-tier provider. See *Zero-cost path* below before you write any code, because it changes the provider interface in Phase 4.

---

## How to use this document

1. Move this file into your DocSearch repo at `docs/EVAL_HARNESS.md` **before** starting Claude Code. (Claude Code cannot read files from a chat session — you already know this one.)
2. Open Claude Code in the repo root.
3. Work one phase at a time. Each phase has a **Prompt** block — paste it verbatim. Do not skip ahead; later phases assume earlier files exist.
4. After each phase, check the **Acceptance** box before moving on.
5. Commit after every phase. The regression gate in Phase 7 depends on run history tied to git SHAs.

Before Phase 0, give Claude Code this context once:

> Read `docs/EVAL_HARNESS.md` in full. Then read the existing retrieval and generation code so you know the current pipeline: how chunks are stored, what the embedding call looks like, what the search query looks like, and how the answer prompt is constructed. Summarise what you found in 10 lines, listing exact file paths and function names, before writing any code. Do not start Phase 0 until I confirm.

---

## Zero-cost path

**Claude Pro does not include API access.** The subscription covers claude.ai and Claude Code; every `api.anthropic.com` call the harness makes bills separately, and API accounts generally require a payment method on file. If you don't have one, plan for the free route from the start rather than discovering it at Phase 4.

Where the money would go, per full 100-question run:

| Stage | Calls per run | Free option |
|---|---|---|
| Question embeddings | ~100 (tiny; cached forever) | Voyage free tier — but see the model note below |
| Corpus embeddings | 0 unless chunk-size experiments re-ingest | Voyage free tier |
| Reranking | ~100 | Voyage free tier |
| Answer generation | ~100 | Free-tier LLM provider |
| LLM judging | ~320 (4 judges, refusal only on unanswerable) | Free-tier LLM provider |
| Golden set generation | ~150, one time only, cached | Free-tier LLM provider |
| Storage / dashboard | — | Supabase free tier |

**The two model decisions:**

*Embeddings and rerank.* Voyage's free allocation (200M tokens) applies to the **voyage-4 generation**, not the legacy voyage-3.x models — those no longer carry a free allocation. Check your Voyage/MongoDB Atlas dashboard: if DocSearch is on voyage-3 or voyage-3-lite you may already be billing. The voyage-4 models share a single vector space, so migrating is cheap and doesn't force a full re-index. 200M tokens is far more than this harness will ever consume.

*Generation and judging.* Route both through a free-tier provider — Google AI Studio's Gemini free tier needs no credit card and doesn't expire. Design for the Flash / Flash-Lite tiers; the Pro tier is capped low enough (~50 requests/day) to be trial-only. Verify current limits at https://ai.google.dev/gemini-api/docs/rate-limits before planning, since quotas were cut in December 2025 and third-party summaries are stale.

**On the free path, requests-per-day is your binding constraint, not cost.** A full run is ~420 calls. Consequences to build in:

- Set `--concurrency 1` or 2 and add a token-bucket rate limiter with 429 backoff in the provider adapter. The runner's incremental JSONL writes already make a mid-run stall recoverable.
- The Phase 4 disk cache stops being an optimisation and becomes load-bearing: it's what lets you re-run a variant that only changed retrieval without re-spending your daily judge quota.
- Run sweeps overnight, one variant at a time.
- Sanity-check quota before a full run and fail fast with a clear message rather than dying at question 60.

**Build the provider abstraction in Phase 4, not later.** Define `LLMProvider` with `complete(prompt, opts): Promise<{ text, usage, costUsd }>` and implement Anthropic and free-tier adapters behind it. Set the provider per-variant in config so `costUsd` stays comparable across runs. Retrofitting this after the judges are written is the kind of refactor that quietly breaks judge determinism.

**One methodological upside, worth putting in the writeup.** Judging with a different model family than the one generating answers reduces self-preference bias — models tend to rate their own outputs favourably. The free path gives you that separation for free. The tradeoff is that smaller judges agree with humans less, which is exactly what Phase 3's calibration measures. If faithfulness kappa comes back under 0.6 on a Flash-tier judge, tighten the atomic-claim decomposition in the prompt before concluding you need a bigger model.

---

## Architecture

```
eval/
  config/
    baseline.json            # variant definitions (one file per experiment arm)
    hybrid-rrf.json
    rerank-top50.json
  golden/
    questions.jsonl          # the golden set (source of truth, git-tracked)
    judge-calibration.jsonl  # ~25 human-labelled judgments
  src/
    types.ts                 # Question, Variant, RunResult, Metrics
    cache.ts                 # content-hash disk cache for embeddings + judge calls
    pipeline.ts              # variant-configurable retrieve() and answer()
    metrics/
      retrieval.ts           # recall@k, precision@k, MRR, nDCG@k
      judge.ts               # LLM-as-judge: faithfulness, relevance, citations
      stats.ts               # paired bootstrap, confidence intervals
    runner.ts                # CLI entry point
    report.ts                # console table + JSON/markdown export
  runs/                      # gitignored; JSONL results per run
scripts/
  generate-golden-set.ts
  compare-runs.ts
app/evals/                   # dashboard route (Phase 8)
.github/workflows/eval.yml   # CI gate (Phase 9)
```

Results are written **both** to `eval/runs/<run_id>.jsonl` (fast local diffing) and to Supabase (dashboard + history). Disk is the source of truth for a single run; Supabase is the source of truth for history.

---

## Phase 0 — Scaffolding and data model

**Goal:** types, config loading, run storage. No metrics yet.

**Prompt:**

> Set up the eval harness skeleton per the Architecture section of `docs/EVAL_HARNESS.md`.
>
> 1. Create the `eval/` directory structure. Add `eval/runs/` to `.gitignore`.
> 2. In `eval/src/types.ts` define and export these TypeScript types:
>    - `Question`: `id`, `question`, `type` (`'factoid' | 'multihop' | 'aggregation' | 'unanswerable' | 'paraphrase'`), `expectedAnswer` (string | null), `relevantChunkIds` (string[]), `relevantDocIds` (string[]), `sourcePages` (number[]), `difficulty` (`'easy' | 'medium' | 'hard'`), `notes` (string, optional), `paraphraseOf` (string | null).
>    - `Variant`: `name`, `description`, `embeddingModel`, `chunkStrategy` (`{ size: number, overlap: number, tableName: string }`), `retrieval` (`{ mode: 'dense' | 'hybrid', topK: number, rrfK?: number, rerank?: { model: string, topN: number } | null }`), `queryRewrite` (`'none' | 'hyde' | 'decompose'`), `generation` (`{ model: string, promptVersion: string, maxTokens: number }`).
>    - `RetrievedChunk`: `chunkId`, `docId`, `page`, `text`, `score`, `rank`.
>    - `QuestionResult`: `questionId`, `retrieved` (RetrievedChunk[]), `answer` (string), `citations` (`{ chunkId: string, docId: string, page: number }[]`), `metrics` (Record<string, number>), `costUsd` (number), `latency` (`{ embedMs, searchMs, rerankMs, generateMs, totalMs }`), `error` (string | null).
>    - `Run`: `runId`, `gitSha`, `variant` (Variant), `startedAt`, `finishedAt`, `results` (QuestionResult[]), `aggregate` (Record<string, number>).
> 3. Create `eval/src/config.ts` with `loadVariant(name: string): Variant` that reads `eval/config/<name>.json`, validates it with zod, and throws a clear error on any missing field. Add zod if it isn't already a dependency.
> 4. Create `eval/config/baseline.json` reflecting the pipeline's **current** settings exactly as they are in the codebase today. Do not invent values — read them from the existing code and tell me which file each value came from.
> 5. Write a Supabase migration creating three tables: `eval_runs` (run_id uuid pk, git_sha text, variant jsonb, started_at timestamptz, finished_at timestamptz, aggregate jsonb, notes text), `eval_questions` (mirrors the Question type, id text pk), and `eval_results` (id bigserial pk, run_id uuid fk cascade, question_id text, retrieved jsonb, answer text, citations jsonb, metrics jsonb, cost_usd numeric, latency jsonb, error text). Index `eval_results(run_id)` and `eval_results(question_id)`. Enable RLS with service-role-only write policies.
> 6. Add npm scripts: `eval:run`, `eval:compare`, `eval:golden`.
>
> Do not implement metrics, the runner, or golden set generation yet.

**Acceptance:** `npm run eval:run -- --variant baseline` exits with "not implemented" rather than a type error. Migration applies cleanly. `eval/config/baseline.json` matches your live pipeline settings.

---

## Phase 1 — The golden set

This is the phase people skip, and it's the phase that determines whether every number afterward means anything. Budget a full day, most of it on review rather than code.

**Target composition (~100 questions):**

| Type | Count | Why it's there |
|---|---|---|
| Factoid | 35 | Baseline retrieval competence |
| Multi-hop | 20 | Needs 2+ chunks, often across documents — where naive top-k fails |
| Aggregation | 10 | "How many…", "list all…" — exposes recall ceilings |
| **Unanswerable** | 20 | Answer is not in the corpus. Measures whether the system refuses or hallucinates. **Do not cut this bucket.** |
| Paraphrase pairs | 15 | Same intent as an existing factoid, different wording. Measures embedding robustness. |

Unanswerable questions are the highest-signal and least-common thing in a portfolio eval set. Two sub-flavours: (a) plausible-but-absent — topic fits the corpus, fact isn't there; (b) adversarially near-miss — the corpus contains a *similar* fact that a careless system will confidently substitute.

**Prompt:**

> Implement `scripts/generate-golden-set.ts`, a CLI that bootstraps golden-set candidates from the ingested corpus.
>
> Behaviour:
> - Sample N chunks stratified across distinct documents (flag `--per-doc`, default 3) so no single document dominates.
> - For each sampled chunk, call the Anthropic API with `claude-haiku-4-5-20251001` (verify this model ID against https://docs.claude.com/en/docs/about-claude/models before hardcoding; put it in a constant either way) asking for a question answerable *only* from that chunk, plus the expected answer. Require strict JSON output, no markdown fences, and parse defensively.
> - For multi-hop, sample 2 chunks from *different* documents that share a named entity, and ask for a question requiring both.
> - For unanswerable, pass a chunk and ask for a question on the same topic whose answer is deliberately absent from the passage — and separately generate near-miss variants that perturb a specific number, date, or name.
> - Pre-populate `relevantChunkIds`, `relevantDocIds`, and `sourcePages` from the sampled chunks. For unanswerable, set `relevantChunkIds: []` and `expectedAnswer: null`.
> - Write to `eval/golden/questions.candidate.jsonl`, one JSON object per line, ids like `q-0001`.
> - Cache every generation call by SHA-256 of (model + prompt) into `eval/.cache/` so re-runs cost nothing.
>
> Then build a review tool: `scripts/review-golden-set.ts`, a terminal UI that shows one candidate at a time with its source chunk text and accepts keypresses — `a` accept, `e` edit in `$EDITOR`, `d` drop, `s` skip. Accepted items append to `eval/golden/questions.jsonl`. It must be resumable: track reviewed ids in `eval/golden/.reviewed` and never re-show them.
>
> Finally add `scripts/validate-golden-set.ts` that fails loudly if: any id is duplicated, any `relevantChunkIds` entry doesn't exist in the DB, an answerable question has an empty `relevantChunkIds`, an unanswerable question has a non-null `expectedAnswer`, or the type distribution deviates more than 25% from the table in `docs/EVAL_HARNESS.md`.

**Your manual work after this runs:** review every single candidate. Generated questions are frequently trivially lexical ("What does the document say about X?" where X appears verbatim) — those inflate every metric and teach you nothing. Rewrite them to use different vocabulary than the source chunk. Expect to drop 30–40%.

**Acceptance:** `eval/golden/questions.jsonl` has ≥90 human-reviewed rows, validation passes, and you personally rewrote or dropped a meaningful fraction.

---

## Phase 2 — Retrieval metrics

**Goal:** score a ranked chunk list against ground truth. Pure functions, fully unit-tested, no API calls.

**Prompt:**

> Implement `eval/src/metrics/retrieval.ts` as pure functions over `(retrieved: RetrievedChunk[], question: Question)`:
>
> - `recallAtK(retrieved, relevantIds, k)` — fraction of relevant chunks appearing in the top k. Return `null` (not 0) when `relevantIds` is empty, so unanswerable questions are excluded from retrieval averages rather than dragging them down.
> - `precisionAtK`, `mrr` (reciprocal rank of the first relevant chunk, 0 if none), `ndcgAtK` with binary gains and log2 discount, `hitRateAtK` (1 if any relevant chunk in top k).
> - `docLevelRecallAtK` — same as recall but matching on `docId`. Chunk-level recall punishes near-miss chunks from the correct document; reporting both separates "wrong document" from "wrong part of the right document," and that distinction drives different fixes.
> - Compute all of these at k = 1, 3, 5, 10, 20 and return a flat `Record<string, number | null>` with keys like `recall@10`.
>
> Write Vitest unit tests covering: no relevant chunks retrieved, all retrieved, relevant chunk at exactly position k, empty relevant set, k larger than the retrieved list. Assert nDCG equals 1.0 when all relevant chunks occupy the top positions.
>
> No network calls in this file.

**Acceptance:** `npx vitest run eval/src/metrics` passes with ≥95% line coverage on that file.

---

## Phase 3 — LLM judge, and calibrating it

An unvalidated LLM judge is a random number generator with good manners. The calibration step below is what makes this section credible in an interview.

**Prompt:**

> Implement `eval/src/metrics/judge.ts` using `claude-haiku-4-5-20251001` (constant, verified against current docs) with `temperature: 0` and strict JSON output.
>
> Four judges, each a separate call:
>
> 1. **Faithfulness** — input: the generated answer + the retrieved chunks that were actually in the prompt. Instruct the model to decompose the answer into atomic factual claims and label each `supported` / `unsupported` / `contradicted` by the provided context alone, ignoring its own knowledge. Return `{ claims: [{ claim, label, evidenceChunkId }], score }` where score = supported / total.
> 2. **Answer correctness** — input: question, generated answer, `expectedAnswer`. Return `{ verdict: 'correct' | 'partial' | 'incorrect', reasoning, score }` (1 / 0.5 / 0). Instruct it to judge semantic equivalence, not wording.
> 3. **Citation accuracy** — for each citation the answer emits, check that the cited chunk actually supports the sentence it is attached to. Return `{ citations: [{ chunkId, valid: boolean, reason }], score }`. This catches the common failure where retrieval is fine, the answer is fine, and the page numbers are wrong — which destroys user trust faster than a wrong answer.
> 4. **Refusal correctness** — only for `type === 'unanswerable'`. Score 1 if the answer declines or states the information isn't in the corpus, 0 if it asserts a substantive answer. Return `{ refused: boolean, score }`.
>
> Requirements: every judge call goes through the Phase 4 cache interface (define the interface now, implement in Phase 4); retry up to 3 times with exponential backoff on JSON parse failure or 429/529, and mark the result `error` rather than throwing after that; never let one bad question kill a run.
>
> Then implement `scripts/calibrate-judge.ts`: sample 25 results from a completed run, present each to me in the terminal for manual labelling, save my labels to `eval/golden/judge-calibration.jsonl`, and report per-judge agreement (raw agreement % plus Cohen's kappa) between my labels and the model's. Print a warning if kappa < 0.6.

**Acceptance:** Judges return valid JSON on 25/25 calibration samples. You have a kappa number for each judge. If faithfulness kappa is below 0.6, tighten the prompt — usually by making the atomic-claim decomposition more explicit — and re-measure.

> **Report the kappa in your writeup.** Almost nobody does this, and it's the difference between "I used an LLM judge" and "I validated my LLM judge."

---

## Phase 4 — Runner, caching, cost and latency instrumentation

**Goal:** end-to-end execution of one variant over the full golden set, at near-zero marginal cost on re-runs.

**Prompt:**

> Implement the runner and caching layer.
>
> `eval/src/cache.ts`: disk cache in `eval/.cache/<namespace>/<sha256>.json`, keyed by SHA-256 of a canonical JSON of all inputs that affect the output (model, prompt, params). Expose `cached<T>(namespace, keyObj, fn: () => Promise<T>): Promise<T>`. Add `--no-cache` to bypass and `eval:cache:clear`. Gitignore `eval/.cache/`. This is the single biggest cost lever: question embeddings and judge calls are identical across variants that don't change them, so a re-run should be ~free.
>
> `eval/src/pipeline.ts`: a `runPipeline(question: string, variant: Variant)` that reuses the app's existing retrieval and generation code paths — **import them, do not reimplement**. If the current code has settings hardcoded, refactor it to accept a config object and have the app pass its defaults, so the eval harness and production can never drift apart. Flag any place where this refactor is risky before doing it.
>
> Support in the pipeline: dense retrieval (existing), hybrid retrieval (pgvector cosine + Postgres full-text `ts_rank`, fused with Reciprocal Rank Fusion, `score = Σ 1/(rrfK + rank_i)`, rrfK default 60), optional reranking via the Voyage rerank endpoint over the top-N candidates, and query rewriting modes `none` / `hyde` / `decompose`.
>
> Instrument every stage with `performance.now()` into the `latency` object. Track token usage from every API response and compute `costUsd` per question from a `PRICING` constant map (embed, rerank, generate, judge broken out separately). Do not guess prices — read them from https://claude.com/pricing and Voyage's pricing page and put the source URL in a comment.
>
> `eval/src/runner.ts`: CLI with `--variant`, `--subset <n>`, `--types <list>`, `--concurrency` (default 4), `--no-cache`, `--notes`. Run questions with bounded concurrency, show a progress bar, catch per-question errors into `QuestionResult.error` and continue, write JSONL to `eval/runs/<runId>.jsonl` incrementally as results arrive (so a crash at question 87 doesn't lose the first 86), then upsert the run and results to Supabase and print an aggregate summary table.
>
> Aggregates: mean of each retrieval metric over answerable questions only; mean faithfulness, correctness, citation accuracy; refusal accuracy over unanswerable only; total and per-question cost; p50/p95 latency per stage; error count.

**Acceptance:** `npm run eval:run -- --variant baseline` completes all ~100 questions, prints the summary, writes JSONL and Supabase rows. A second identical run costs approximately $0 and finishes in seconds. Note your baseline numbers — this is the "before" in your story.

---

## Phase 5 — Statistics, so you don't fool yourself

At n=100, a recall@10 of 0.61 has a 95% CI of roughly ±0.10. Two variants differing by 3 points are indistinguishable. Reporting a single mean per variant and declaring a winner is the most common mistake in amateur eval work, and the fastest way to lose credibility with someone who knows evals.

The fix is **paired** comparison: both variants answer the same questions, so you bootstrap the per-question *differences*, which cancels question difficulty and gives a far tighter interval than comparing two independent means.

**Prompt:**

> Implement `eval/src/metrics/stats.ts`:
>
> - `bootstrapCI(values: number[], iters = 10000, alpha = 0.05)` → `{ mean, lo, hi }` via percentile bootstrap, using a seeded PRNG (mulberry32) so results are reproducible. Take the seed from a CLI flag defaulting to 42.
> - `pairedBootstrap(a: number[], b: number[], iters = 10000)` → `{ meanDiff, lo, hi, pValue }`. Resample indices, take the mean of `a[i] - b[i]`, and derive a two-sided p-value from the proportion of bootstrap means crossing zero. Throw if the arrays differ in length or if question ids don't align — the caller must pass values joined on question id, in the same order.
> - `mcNemar(aCorrect: boolean[], bCorrect: boolean[])` for binary outcomes like hit-rate and refusal correctness.
> - `minDetectableEffect(n, baselineRate)` — so the report can state honestly what size of improvement this golden set can and cannot detect.
>
> Then `scripts/compare-runs.ts <runA> <runB>`: load both runs from Supabase (or local JSONL with `--local`), inner-join results on `questionId`, and print a table with metric, mean A, mean B, delta, 95% paired CI, p-value, and a significance marker. Add a `--regressions` flag that lists the individual questions where B is worse than A, sorted by delta, with the question text — this is your debugging workflow, not just a report.
>
> Unit-test the stats functions against known inputs: identical arrays must give meanDiff 0 with a CI straddling zero; a constant offset must give a CI excluding zero.

**Acceptance:** `npm run eval:compare -- baseline baseline` reports zero delta with CIs containing zero. You can state the minimum detectable effect for your golden set size.

---

## Phase 6 — Run the experiments

Now the harness earns its keep. Each experiment is one config file and one command. Run them in this order — cheapest and highest-expected-value first — and **log every result even when it's negative**, because "reranking cost 400ms and bought 1.5 points, within noise, so I didn't ship it" is a stronger interview answer than a list of wins.

| # | Experiment | Configs | What you're testing |
|---|---|---|---|
| 1 | top-k sweep | k = 3, 5, 10, 20 | Recall/precision tradeoff and where recall saturates |
| 2 | Chunk size | 256/512/1024 tokens, overlap 0/10/20% | Requires re-ingestion per arm — batch these together |
| 3 | Dense vs hybrid | `mode: dense` vs `hybrid` | Usually the biggest single win, especially for names, IDs, and rare terms |
| 4 | Reranking | rerank over top 50 → 10 | Precision gain vs added latency and cost |
| 5 | Query rewriting | none / HyDE / decompose | Should help multi-hop most — break the metrics out by question type |
| 6 | Embedding model | lite vs full | Is the bigger model worth the cost on *your* corpus |
| 7 | Prompt variants | citation format, refusal instruction strength | Watch refusal accuracy and faithfulness move in opposite directions |

**Prompt:**

> Create config files in `eval/config/` for experiments 1–7 in the table in `docs/EVAL_HARNESS.md`. For chunk-size experiments, add `--reingest` support to the runner that ingests the corpus into a variant-specific table named from the chunk strategy, skipping if that table already exists and is populated.
>
> Then write `scripts/sweep.ts` that takes a list of config names, runs each sequentially, and emits a combined markdown report to `eval/runs/sweep-<timestamp>.md` containing: a summary table of all variants with 95% CIs, paired comparisons of each variant against baseline, a per-question-type breakdown, and a cost/latency table. Print total sweep cost at the end.

**Acceptance:** A markdown report you could paste into a blog post, containing at least one negative or null result you can explain.

---

## Phase 7 — Regression gate

**Prompt:**

> Add `--gate <baselineRunId>` to the runner. After a run completes, compare against the baseline run and exit non-zero if any guarded metric regresses beyond its threshold, where a regression counts only if the paired 95% CI excludes zero — a raw drop inside the noise band must not fail the build.
>
> Read thresholds from `eval/config/gate.json`, defaulting to: `recall@10` −0.03, `faithfulness` −0.05, `citationAccuracy` −0.05, `refusalAccuracy` −0.05, `p95TotalMs` +25%, `costPerQuery` +20%.
>
> Print a clear pass/fail summary naming which metric failed, by how much, with the CI, and listing the 5 worst-regressed questions.

**Acceptance:** Deliberately degrade a prompt, run with `--gate`, and watch it fail with a useful message.

---

## Phase 8 — Dashboard

**Prompt:**

> Build `/evals` in the existing Next.js app, styled consistently with the rest of DocSearch (server components for data fetching, client components only where interactivity requires it).
>
> - `/evals` — table of runs: date, git SHA (linked to GitHub), variant name, headline metrics, cost. Sortable.
> - `/evals/[runId]` — aggregate metrics with error bars, per-question-type breakdown, latency waterfall by stage, and a searchable per-question table with a status indicator, filterable to failures only.
> - `/evals/[runId]/q/[questionId]` — the drill-down that makes this genuinely useful: question, ground-truth chunks, retrieved chunks in rank order with relevant ones highlighted, generated answer with citations, and each judge's verdict and reasoning.
> - `/evals/compare?a=&b=` — the paired comparison table plus a per-question delta view.
>
> Charts with Recharts. Protect the route: read-only and behind auth if the app has auth, otherwise gate on an env flag so it isn't publicly exposed by default.

**Acceptance:** You can go from "faithfulness dropped" to looking at the exact chunks that caused it in under three clicks.

---

## Phase 9 — CI

**Prompt:**

> Add `.github/workflows/eval.yml`. On pull requests touching retrieval, prompt, or ingestion paths, run a 30-question stratified smoke subset (seeded, so it's the same 30 every time) against the current baseline with `--gate`, then post or update a single sticky PR comment with a metrics delta table and pass/fail. Also add a manual `workflow_dispatch` for the full 100-question set.
>
> Keep secrets in GitHub Actions secrets. Cache `eval/.cache/` keyed on the golden set hash so CI runs are cheap. Fail the job on gate failure, but make it non-blocking for PRs labelled `eval-exempt`.

**Acceptance:** A PR that worsens the prompt gets a red check and a comment showing exactly which metric moved.

---

## Phase 10 — The writeup

This is the part that gets you hired. The code is evidence; the writeup is the argument. Put it in the repo README and as a blog post.

Structure:

1. **The problem in one paragraph** — RAG demos look fine on three hand-picked questions; you can't improve what you can't measure.
2. **How the golden set was built** — composition table, why unanswerable questions are 20% of it, that you hand-reviewed every one and dropped ~35%.
3. **How the judge was validated** — kappa per judge against your own labels. Lead with this; it's your credibility.
4. **Baseline numbers** — with confidence intervals, not bare means.
5. **Experiments** — one chart per experiment, deltas with CIs, and at least one thing that didn't work.
6. **What shipped and why** — final config, the improvement, the cost and latency it bought.
7. **Limitations, stated plainly** — n=100 means you can't detect effects under ~5 points; the golden set is model-generated then human-reviewed, which biases toward answerable-by-construction questions; the judge shares a model family with the generator.

That last section is counterintuitively the strongest one. Volunteering the limits of your own measurement is the clearest possible signal that you understand it.

---

## Cost control checklist

- [ ] Every embedding, rerank, generation, and judge call goes through the disk cache
- [ ] Judging uses the cheapest adequate model on whichever provider you chose — never a frontier tier
- [ ] Embeddings are on a model that still has a free allocation (see *Zero-cost path*)
- [ ] Rate limiter and 429 backoff in place if you're on a free tier
- [ ] CI runs 30 questions, not 100
- [ ] Golden set generation cached — never regenerate to tweak a downstream format
- [ ] `--subset 10` while developing the harness itself; full runs only when a phase is done
- [ ] Chunk-size experiments reuse ingested tables instead of re-embedding the corpus per run
- [ ] Print cumulative spend at the end of every run

## Traps worth naming in advance

- **Test-set leakage.** If you generate questions from chunk X and tune retrieval until chunk X ranks first, you've overfit. Hold out 20 questions from the start, touch them only at the very end, and report both numbers.
- **Metrics that only move up.** If every experiment improves everything, your golden set is too easy. Add harder multi-hop and aggregation questions until something breaks.
- **Judge drift.** Re-run calibration whenever you change a judge prompt. A judge that silently got more lenient looks exactly like a system that got better.
- **Averaging over unanswerable questions.** Retrieval metrics on questions with no relevant chunks are meaningless — that's why the metric functions return `null` rather than 0.