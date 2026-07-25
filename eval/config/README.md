# Variant configs

One JSON file per experiment arm, validated by `eval/src/config.ts` (`loadVariant`).
Validation is strict — an unknown key is an error, not a silently ignored typo.
The `name` field must match the filename.

## Where `baseline.json` came from

Phase 0 requires the baseline to reflect the pipeline **exactly as it is today**,
with no invented values. Each field and its source:

| Field | Value | Source |
|---|---|---|
| `embeddingModel` | `voyage-3.5` | `src/lib/embed.ts` — `MODEL` |
| `chunkStrategy.size` | `800` | `src/lib/chunk.ts` — `DEFAULT_TARGET_TOKENS` |
| `chunkStrategy.overlap` | `0.15` | `src/lib/chunk.ts` — `DEFAULT_OVERLAP_RATIO` (a *fraction*, not tokens) |
| `chunkStrategy.tableName` | `chunks` | `schema.sql` — `create table if not exists chunks` |
| `retrieval.mode` | `hybrid` | `src/lib/retrieve.ts` — `retrieve()` default `mode` |
| `retrieval.topK` | `8` | `src/lib/retrieve.ts` — `DEFAULT_LIMIT` |
| `retrieval.rrfK` | `60` | `src/lib/retrieve.ts` — `RRF_K` |
| `retrieval.searchTop` | `20` | `src/lib/retrieve.ts` — `SEARCH_TOP` |
| `generation.maxTokens` | `4096` | `src/lib/llm.ts` — `MAX_OUTPUT_TOKENS` |
| `generation.model` | `gemini-flash-latest` | `src/lib/llm.ts` — `GEMINI_MODEL`, selected because `GENERATION_PROVIDER=gemini` |

Three fields have **no existing source in the code**, and are called out rather
than passed off as read values:

- **`retrieval.rerank`: `null`** — no reranking exists in the pipeline. Null is
  the honest encoding of "this stage does not run", not a tuning choice.
- **`queryRewrite`: `"none"`** — no query rewriting exists either.
- **`generation.promptVersion`: `"v1"`** — nothing versions the prompt today.
  `v1` is introduced here to mean the current `SYSTEM_PROMPT` in
  `src/lib/answer.ts`. Any edit to that prompt must bump this, or two runs with
  different prompts will be recorded as the same arm.

## Why the generation model is Gemini, not Claude

`docs/EVAL_HARNESS.md` writes its prompts against the Anthropic API, but this
project's Anthropic key is invalid and `GENERATION_PROVIDER=gemini` is what
actually runs. We are on the spec's documented *Zero-cost path*: generation and
judging both go through the free Gemini tier.

The spec notes the methodological upside — judging with a different model family
than the generator reduces self-preference bias. On this path the generator is
Gemini, so the **judge must not also be Gemini** if we want that separation.
That choice is Phase 3's; flagged here so it is not made by accident.
