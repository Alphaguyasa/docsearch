# DocSearch

Ask questions about a corpus of PDFs and get answers that are **grounded and
cited** — every factual claim carries an inline `[n]` citation back to the source
chunk, and the system refuses plainly when the documents don't cover the
question instead of guessing.

Retrieval is **hybrid**: vector similarity (Voyage embeddings over pgvector) and
Postgres full-text keyword search, fused with Reciprocal Rank Fusion. Generation
is provider-agnostic (Anthropic or Google Gemini) and streamed to the browser
with the citation targets rendered before the answer text.

## What it does

- **Ingest** PDFs — via the CLI (`npm run ingest`) or drag-and-drop in the
  browser. Each PDF is extracted per page, chunked (~800 tokens, page-bounded),
  embedded with `voyage-4` (1024-dim), and stored in Postgres.
- **Search** — a question runs hybrid retrieval (vector + keyword + RRF); the top
  chunks are numbered and fed to the model, which streams a cited answer. Inline
  `[n]` chips open a panel with the source chunk's full text, title, and page.
- **Refuse** — if the retrieved chunks don't answer the question, the model
  replies "…not covered by these documents" with no citation, rather than
  answering from general knowledge.
- **Manage** — list documents with page/chunk counts and status, delete them
  (chunks cascade), and watch uploads progress from `pending` → `complete`.

## Architecture

```mermaid
flowchart TD
  subgraph Browser
    SUI[Search UI]
    DUI[Documents / Upload UI]
  end

  subgraph "Next.js API routes (src/app/api)"
    SR["/api/search"]
    UR["/api/upload"]
    PR["/api/process"]
    DR["/api/documents"]
  end

  subgraph "src/lib"
    RET[retrieve]
    ANS[answer]
    LLM[llm]
    EMB[embed]
    CHK[chunk]
    PIP[pipeline]
  end

  SUI -->|question| SR
  SR --> RET
  SR --> ANS --> LLM
  ANS -->|NDJSON stream| SUI
  RET --> EMB
  RET --> PG[(Postgres + pgvector)]

  DUI -->|PDF| UR --> STO[(Supabase Storage)]
  UR --> PG
  DUI -->|poll /api/process| PR
  PR --> STO
  PR --> PIP --> CHK
  PR --> EMB
  PR --> PG
  DUI -->|list / delete| DR --> PG

  EMB -->|REST| VOY[Voyage API]
  LLM -->|stream| GEN[Anthropic / Gemini]
```

Retrieval logic (`src/lib`) is shared by the web app and the CLI; the ingestion
pipeline (`extract → chunk → embed → insert`) lives in `src/lib/pipeline.ts` and
is used by both the CLI and the `/api/process` route, so it exists in one place.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Supabase Postgres with pgvector (+ Supabase Storage for uploaded PDFs)
- Voyage AI embeddings — `voyage-4`, output pinned to 1024 dims
- Generation behind a provider interface: Anthropic `claude-sonnet-5` **or**
  Google Gemini (`gemini-flash-latest`), selected by `GENERATION_PROVIDER`
- `unpdf` for PDF text extraction

## Setup

1. **Install:** `npm install` (Node 20+).
2. **Database:** create a Supabase project and run `schema.sql` in the SQL editor
   (creates the `documents` / `chunks` tables, the pgvector index, and the
   `match_chunks` / `keyword_chunks` search functions).
3. **Env:** copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `VOYAGE_API_KEY`
   - `GENERATION_PROVIDER` = `anthropic` or `gemini`, plus the matching key
     (`ANTHROPIC_API_KEY` or `GEMINI_API_KEY`). Only the selected provider's key
     is required.
4. **Storage:** nothing to do — the private `documents` bucket is created
   automatically on the first browser upload.
5. **Ingest some PDFs** (either path):
   - CLI: `npm run ingest -- ./path/to/pdfs` (add `--dry-run` to preview,
     `--strip-repeated` to drop running headers/footers).
   - Browser: run the app and drag PDFs onto `/documents`.
6. **Run:** `npm run dev` → http://localhost:3000. Production build:
   `npm run build`.

Other scripts: `npm run query -- "<q>"` (retrieval only), `npm run ask -- "<q>"`
(retrieve + cited answer in the terminal), `npm run ask -- --refusals` (refusal
smoke check against the dev golden set).

## Evaluation

**→ [`docs/WRITEUP.md`](docs/WRITEUP.md) is the argument: what was measured, what
it found, and what it cannot tell you.** The short version:

- **91 human-reviewed questions**, 28% of candidates dropped, 17% deliberately
  unanswerable — the bucket that separates a retriever from a fabricator.
- **One of four LLM judges is validated.** `correctness` at Cohen's kappa 0.80
  (random sample) and 0.89 (stratified). The other three agree with me
  67&ndash;100% of the time on samples containing almost no negatives, which is
  agreement without evidence — and the writeup says so rather than printing four
  green numbers.
- **Three of four retrieval experiments did nothing**, and the one finding worth
  more than all of them came from the per-type breakdown: 4 of 6 questions
  retrieval got right were lost when the question was reworded.
- **Nothing shipped.** The config is unchanged, because the one arm with a real
  recall gain has never been measured on answer quality.
- **The measurement was wrong three times** — a truncated labelling UI, a
  contaminated unanswerable bucket, and a rubric with no answer for refusals.
  All three are documented, because each one initially looked like a system
  failure.

The harness is built per [`docs/EVAL_HARNESS.md`](docs/EVAL_HARNESS.md). All ten
phases are complete: scaffolding, golden set, retrieval metrics, judge
calibration, runner and caching, statistics, [eleven experiment
arms](docs/EVAL_RESULTS.md), the regression gate, the `/evals` dashboard, and CI.

The judge calibration is in
[the writeup](docs/WRITEUP.md#3-how-the-judge-was-validated--and-why-only-one-of-four-survived),
reported per sampling design, because pooling a random sample with a stratified
one describes a population that never existed. Regenerate either half with
`npm run eval:calibrate -- --report-only --design random|stratified`.

Baseline, full pipeline on the 76-question dev split, 0 errors, $0
(`npm run eval:run -- --variant baseline`):

| Metric | @1 | @5 | @10 |
|---|---|---|---|
| recall | 20.9% | 48.6% | 52.8% |
| hit rate | — | — | 61.9% |
| nDCG | — | — | 42.9% |
| doc recall | — | — | 69.0% |

MRR 43.4%, median latency 1,190 ms. `correctness` 52.4% — the only judged
number with a validated judge behind it, and it tracks recall@10 almost exactly:
the system answers when retrieval finds the chunk and declines when it does not.
**24 of 63 answerable questions get a refusal.**

> **On reproducibility, precisely.** Retrieval is deterministic given the corpus
> and the cache, but two `baseline` runs on these 76 questions reported 51.2% and
> 52.8%. The difference is one question where hybrid retrieval lost one of its
> two sources and fused only the survivor. The runner records that as `degraded`
> and `eval:compare` prints it, which is why this is a footnote rather than an
> unexplained 1.6pp. The table above is the run with none.

> An earlier ad-hoc eval (35 questions over a 26-chunk corpus) reported
> recall@5 = 100%. Those numbers are deleted, not carried forward: they came from
> a corpus roughly 1% the size of the current one and were saturated — every
> setting scored 100%, so they could not distinguish anything and would be
> actively misleading beside the new harness. Recoverable from git history if
> ever needed.

### The golden set

91 human-reviewed questions over a 2,134-chunk / 90-document corpus, split into
two files that are **never** used interchangeably:

| File | Questions | Purpose |
|---|---|---|
| `eval/golden/questions.dev.jsonl` | 76 | Tune against this. The default everywhere. |
| `eval/golden/questions.holdout.jsonl` | 15 | Touched once, at the end. Requires `--holdout`. |

> **Dev was 77 until a 2026-07-27 audit of the unanswerable bucket.** 4 of its 15
> unanswerable questions turned out to be answerable from the corpus: each had
> been drafted as absent from *one* paper and phrased generically, so other
> documents answered them. Two were re-anchored to their intended paper, one was
> reclassified as a factoid, one was removed. Refusal accuracy went from an
> apparent 50% to a true 100%. See [`docs/EVAL_RESULTS.md`](docs/EVAL_RESULTS.md).
> The same drafting flaw likely affects 1–2 of the holdout's 5 unanswerable
> questions, which have been left untouched rather than spending the holdout.

The split is seeded (seed 42) and reproducible via `npm run eval:split`; the seed
and rule are written into both files' `#` headers so any number can be traced
back to the split that produced it.

**Split rule, and why it is not a uniform sample:**

- The holdout draws **only** from factoid (7), unanswerable (5), and paraphrase
  (3).
- **Multi-hop (n=7) and aggregation (n=8) stay entirely in dev.** Both are far
  too small to survive a split — a 20% share would put one or two questions on
  each side, where a single item moves the score by tens of points — and too
  small to meaningfully tune against in the first place.
- **Paraphrase families are atomic.** A paraphrase and its parent factoid never
  straddle the split. A paraphrase exists to test robustness to rewording *the
  same question*, so tuning on the parent would transfer straight to its holdout
  twin — the most direct leakage available. The splitter asserts this and fails
  loudly rather than writing a leaky split.

**Consequence, stated plainly: the holdout measures factoid / unanswerable /
paraphrase performance, not whole-system performance.** It says nothing about
multi-hop or aggregation, which are dev-only. Report it as such.

Every script and runner defaults to dev. Reading the holdout requires an explicit
`--holdout` flag and prints a warning that it is a one-time measurement — a
holdout re-run after every change is just a second dev set with a misleading
name.

### Comparing runs

```bash
npm run eval:compare -- <runA> <runB> [--local] [--regressions] [--metric recall@10]
```

Each argument is a run id or a variant name (which resolves to that variant's
most recent run that actually has results). Runs load from Supabase by default,
or from `eval/runs/*.jsonl` with `--local`.

The comparison is **paired**: both runs answered the same questions, so it joins
on question id and bootstraps the per-question *differences* rather than
comparing two means. Question difficulty is the dominant source of variance at
n=76 and both arms feel it identically, so differencing cancels it. Every row
carries a 95% confidence interval and a p-value; `--regressions` lists the
individual questions a change made worse, with their text, which is the actual
debugging workflow.

**What this golden set can and cannot detect.** At n=63 answerable questions and
a baseline recall@10 of 51.2%, the 95% interval on a single arm's mean is
±12.3pp, and the smallest difference two *independent* arms could resolve at 80%
power is about 25pp. Pairing shrinks that substantially — by a factor of √(1−ρ), and two
arms of the same pipeline correlate strongly — but the honest headline is that
**this set cannot distinguish variants that differ by a few points.** Any such
result is inconclusive, not negative. The tool prints these figures on every
comparison so the limitation travels with the numbers instead of being something
a reader has to know to ask about.

One consequence worth naming: cost and latency rows compare the runs *as
executed*, cache state and rate-limiter pacing included. A cold run against a
cached one shows a large, statistically significant latency difference while
retrieving byte-identical chunks. That is a true fact about the two runs and
says nothing about the variants.

## Deploying (Vercel)

Prerequisites: a Supabase project with `schema.sql` applied, and your API keys.
The app reads all secrets from environment variables — nothing is baked into the
build.

Using the Vercel CLI (no GitHub repo required):

```bash
npm i -g vercel && vercel login
vercel link                                  # create/link the project
# Add each secret (you'll be prompted for the value):
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add VOYAGE_API_KEY production
vercel env add GENERATION_PROVIDER production   # anthropic | gemini
vercel env add GEMINI_API_KEY production        # or ANTHROPIC_API_KEY
vercel env add APP_PASSWORD production           # strongly recommended (see below)
vercel --prod                                    # build + deploy
```

Or via GitHub: create a repo, push, import it in the Vercel dashboard, set the
same variables under **Settings → Environment Variables**, and deploy.

- **Set `APP_PASSWORD`.** Without it the deployment is open to anyone with the
  URL, and uploads/searches cost embedding and LLM tokens. With it set, the whole
  app requires HTTP Basic auth (any username, that password).
- The private `documents` Storage bucket is created automatically on the first
  upload — no manual step.
- The Voyage free tier (3 embeddings/min) throttles ingestion and hybrid search;
  hybrid degrades to keyword-only when the limit is hit.

## Limitations

- **The golden set is small, and small in specific places.** 76 dev questions.
  At n≈76 a recall@10 of 0.6 carries a 95% CI of roughly ±0.11, so differences
  under ~5 points are not distinguishable and must be reported as null results,
  not wins. Worse per bucket: multi-hop is n=7 and aggregation n=8, where a
  single question moves the score by 12–14 points — neither supports a per-type
  conclusion, and Phase 6's per-type breakdown should say so rather than print a
  number that looks like evidence.
- **The holdout is 15 questions and covers three types.** It is enough to catch a
  gross overfit, not to estimate anything precisely: a 15-question score has a
  CI wide enough to swallow most plausible differences. Treat it as a sanity
  check on the dev number, not as an independent measurement.
- **Voyage free tier is 3 embeddings/min.** Large ingests and vector/hybrid evals
  must be paced (`--delay`), and in the web app a query that hits the limit
  **degrades to keyword-only** rather than failing.
- **Upload size and processing model.** `/api/upload` buffers the whole file in
  the serverless function (capped at 15 MB, and subject to platform request-body
  limits). Processing is one document per `/api/process` call, client-triggered
  and polled — there is no cron, so if the tab closes mid-batch the remaining
  `pending` documents wait until something calls `/api/process` again. Claiming a
  pending row (select-then-update) is not atomic, so concurrent triggers could
  double-process; fine for single-user, not for scale.
- **No OCR.** Pages with too little extractable text are treated as scanned and
  skipped.
- **Retrieval is RRF-only.** Fixed ~800-token page-bounded chunks; no semantic
  chunking and no re-ranking stage.
- **Single-tenant.** The server uses the Supabase service-role key; RLS is enabled
  with no policies and there is no auth or per-user isolation.
- **Refusal is prompt-enforced, not guaranteed.** It's held to account by the
  refusal harness, but a model can still deviate.
- **The multi-hop bucket is intra-document only, and is 8% of the set, not 20%.**
  `docs/EVAL_HARNESS.md` originally specified multi-hop questions spanning two
  *different* documents, at 20% of the golden set. Measured on this corpus —
  90 topically unrelated arXiv NLP papers — cross-document multi-hop yielded
  **2 questions from 33 generation attempts, and 0 of 33 end-to-end after human
  review**; same-document pairs yielded 12 from 51, of which 7 survived. The
  targets were retargeted to measurement: multi-hop 20% → **8%**, factoid
  35% → **47%** to absorb the difference.

  This is a property of *corpus construction*, not of the generator. Pairs are
  ranked by IDF-weighted entity salience and the model declines them correctly:
  two papers that both mention `BERT` or `ICASSP` share a topic, not a joint
  fact. An arbitrary sample of unrelated papers contains almost no cross-document
  joint facts; a corpus of *related* documents would behave differently.

  All 7 accepted multi-hop questions therefore pair two sections of one paper
  (≥5 chunks apart, typically a method and its results). These are genuine
  two-chunk questions, but a same-document question can often be answered from
  one well-chosen chunk, so the bucket tests multi-chunk assembly **less severely
  than the original design intended**. `multihopKind` is retained on every
  question and reported, but no cross-doc share is enforced — a target the corpus
  cannot supply at any attempt count is a permanently red check, not a standard.
  **At n=7 this bucket cannot support a per-type conclusion**; report it
  descriptively with the count attached.
- **Aggregation questions are generated deterministically, not by an LLM.** Their
  ground truth is the entity document-frequency index, so "how many papers
  mention X" is exact and reproducible — but it measures retrieval against the
  *extractor's* notion of which chunks mention X, not a human's. Asking a model
  instead returned null 4 times in 10 and produced unverified answers for the
  rest.
- **Golden set review: 126 candidates, 92 accepted, 34 dropped (27%).** Slightly
  under the 30–40% drop rate `docs/EVAL_HARNESS.md` expects. Per bucket:
  factoid 43/49 (88%), unanswerable 20/28 (71%), paraphrase 14/20 (70%),
  multi-hop 7/14 (50%), aggregation 8/15 (53%).

  **The first review pass dropped all 28 unanswerable questions — a tooling bug,
  not a judgment.** The review UI displayed every candidate beside its source
  chunk, which framed the reviewer's implicit question as *"is this answerable
  here?"* — a test an unanswerable question fails by definition. The entire
  highest-signal bucket was rejected in one pass, and the run still looked
  successful: 70 questions accepted, no error, no warning. The UI now renders
  unanswerable candidates differently — no source chunk, an explicit banner, and
  a **live retrieval of the top 3 corpus matches** shown as evidence *against*
  the candidate, so "nothing in the corpus answers this" is checked rather than
  assumed. Re-reviewed, the same 28 questions were accepted at 71%.

  This is worth reporting rather than quietly fixing: eval tooling can silently
  destroy the most valuable part of a test set, and the failure is invisible in
  every summary statistic. The bucket that measures whether the system refuses or
  hallucinates was the one the tooling was worst at presenting.
