# Experiments

One variable at a time, measured against the hybrid baseline with the retrieval
eval harness (`npm run eval`, hybrid mode, top-10, 35 answerable questions). Each
run is a file in `evals/results/`. Nothing here is tuned into the code — these
are measurements only.

## Experiment 1 — RRF `k` (fusion constant)

**Variable:** the `k` in Reciprocal Rank Fusion, `score += 1 / (k + rank)`
(`RRF_K` in `src/lib/retrieve.ts`). Baseline is `k = 60`; swept to `20` and
`120`. Only that constant changed between runs; the corpus, embeddings, and
per-arm searches were identical.

### recall@5 and MRR, by difficulty

| Difficulty | n | R@5 (k=20) | R@5 (k=60) | R@5 (k=120) | MRR (k=20) | MRR (k=60) | MRR (k=120) |
|---|---|---|---|---|---|---|---|
| **overall** | 35 | 100.0% | 100.0% | 100.0% | 0.930 | 0.930 | 0.930 |
| easy | 10 | 100.0% | 100.0% | 100.0% | 1.000 | 1.000 | 1.000 |
| medium | 18 | 100.0% | 100.0% | 100.0% | 0.900 | 0.900 | 0.900 |
| hard | 7 | 100.0% | 100.0% | 100.0% | 0.905 | 0.905 | 0.905 |

Source files: `*-hybrid.json` (k=60, baseline), `*-hybrid-rrf20.json`,
`*-hybrid-rrf120.json`.

### What the numbers suggest

Changing `k` across a 6× range made **no difference**: recall@5 and MRR are
identical to three decimals at every difficulty, and **not one question changed
rank** — the four questions that aren't already rank 1 (q11 at #2, q22 at #2,
q21 at #3, q25 at #5) sit at exactly those ranks under all three `k` values.

Two things explain the flat result. First, **recall@5 is already saturated at
100%** — every answerable question surfaces a relevant chunk within the top 5,
so there is no coverage headroom for `k` to recover. Second, **`k` only rescales
each hit's `1/(k+rank)` contribution; it does not reorder chunks that both arms
agree on.** On this small, clean corpus the vector and keyword arms largely
agree, so the fused ordering is stable and MRR doesn't move. `k` mostly governs
how sharply top ranks are favored over the tail, and here the tail never decides
an outcome.

**Which questions changed outcome:** none.

This is a null result *for this gold set*, not a statement that `k` is globally
irrelevant. With a larger or noisier corpus, more disagreement between the two
arms, or a lower baseline recall, `k` would have room to matter — this eval
simply cannot distinguish the three settings. Per the brief, nothing is tuned on
the basis of this result.

> One run detail: the k=60 baseline had a single question (q12) fall back to
> keyword-only after a Voyage rate-limit hit (`degraded=1`); it still landed at
> rank 1. The k=20 and k=120 runs were clean (`degraded=0`). The identical
> metrics across all three confirm the outcome is robust to that fallback.
