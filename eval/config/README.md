# Variant configs

One JSON file per experiment arm, validated by `eval/src/config.ts` (`loadVariant`).
Validation is strict — an unknown key is an error, not a silently ignored typo.
The `name` field must match the filename.

## Where `baseline.json` came from

Phase 0 requires the baseline to reflect the pipeline **exactly as it is today**,
with no invented values. Each field and its source:

| Field | Value | Source |
|---|---|---|
| `embeddingModel` | `voyage-4` | `src/lib/embed.ts` — `MODEL` |
| `chunkStrategy.size` | `800` | `src/lib/chunk.ts` — `DEFAULT_TARGET_TOKENS` |
| `chunkStrategy.overlap` | `0.15` | `src/lib/chunk.ts` — `DEFAULT_OVERLAP_RATIO` (a *fraction*, not tokens) |
| `chunkStrategy.tableName` | `chunks` | `schema.sql` — `create table if not exists chunks` |
| `retrieval.mode` | `hybrid` | `src/lib/retrieve.ts` — `retrieve()` default `mode` |
| `retrieval.topK` | `8` | `src/lib/retrieve.ts` — `DEFAULT_LIMIT` |
| `retrieval.rrfK` | `60` | `src/lib/retrieve.ts` — `RRF_K` |
| `retrieval.searchTop` | `20` | `src/lib/retrieve.ts` — `SEARCH_TOP` |
| `generation.maxTokens` | `4096` | `src/lib/llm.ts` — `MAX_OUTPUT_TOKENS` |
| `generation.model` | `gemini-flash-lite-latest` | **DELIBERATE DEVIATION from production** — see below |

Three fields have **no existing source in the code**, and are called out rather
than passed off as read values:

- **`retrieval.rerank`: `null`** — no reranking exists in the pipeline. Null is
  the honest encoding of "this stage does not run", not a tuning choice.
- **`queryRewrite`: `"none"`** — no query rewriting exists either.
- **`generation.promptVersion`: `"v1"`** — nothing versions the prompt today.
  `v1` is introduced here to mean the current `SYSTEM_PROMPT` in
  `src/lib/answer.ts`. Any edit to that prompt must bump this, or two runs with
  different prompts will be recorded as the same arm.

## The one place baseline deliberately differs from production

**`generation.model` is `gemini-flash-lite-latest`; production runs
`gemini-flash-latest`.** Every other field mirrors production exactly.

Production's model allows **20 requests per day** on the free tier — quota
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, measured on this project's
key, not recalled. A 77-question dev-set run needs roughly 300 generation and
judge calls. Baseline pinned to the production model cannot complete a single
run: an attempt lost 2 of 6 questions to the daily wall partway through a
*subset*. `eval/src/provider.ts` moved the harness's own calls to Flash-Lite for
exactly this reason months earlier; baseline now matches.

**What this does and does not invalidate:**

- ✅ **Retrieval experiments remain valid as production measurements.** Retrieval
  runs entirely before generation and shares no code path with it. `mode`,
  `topK`, `rrfK`, `searchTop`, `rerank`, `chunkStrategy`, and `embeddingModel`
  are byte-identical to production, so top-k sweeps, dense-vs-hybrid, reranking,
  chunk-size, and embedding-model arms measure the system users actually get.
  Run these with `--retrieval-only`, which skips generation altogether and so
  cannot be affected by the model at all.
- ❌ **Generation-quality numbers describe Flash-Lite, not production.**
  `faithfulness`, `correctness`, `citationAccuracy`, `refusalAccuracy`, and
  `generateMs` are all measured on a different model from the one serving users.
  Say so wherever they are quoted. Experiment 7 (prompt variants) is comparable
  *between its own arms* but not to production in absolute terms.

To measure production's generator directly, set `generation.model` to
`gemini-flash-latest` in a dedicated arm and keep it under ~20 questions
(`--subset 15`), or move to a billed key.

## Why the embedding model is voyage-4

Verified against docs.voyageai.com, not recalled: `voyage-4` defaults to 1024
dimensions and is covered by the 200M-token free allocation (shared with
`voyage-4-large`, `voyage-4-lite`, `voyage-context-4`, `voyage-code-3`).
`voyage-3.5`, the previous pin, is **not** in that allocation and bills from the
first token — at ~2M tokens for a 200-paper corpus, and again for every
chunk-size experiment arm, that was a real cost for no benefit.

The schema stays `vector(1024)`; only the model string changed.

**Changing this field is a full re-index.** Different embedding generations
occupy different vector spaces, so a table holding both makes cosine distance
meaningless between rows — retrieval degrades with no error and no obvious
symptom. Every chunk embedded with voyage-3.5 was deleted before the switch;
if you change the model again, do the same.

## Why the generation model is Gemini, not Claude

`docs/EVAL_HARNESS.md` writes its prompts against the Anthropic API, but this
project's Anthropic key is invalid and `GENERATION_PROVIDER=gemini` is what
actually runs. We are on the spec's documented *Zero-cost path*: generation and
judging both go through the free Gemini tier.

The spec notes the methodological upside — judging with a different model family
than the generator reduces self-preference bias. On this path the generator is
Gemini, so the **judge must not also be Gemini** if we want that separation.
That choice is Phase 3's; flagged here so it is not made by accident.
