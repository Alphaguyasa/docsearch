# Retrieval evaluation

This harness measures how well `retrieve()` finds the right passage for a
question, against a fixed gold set. It only *calls* retrieval — it never changes
it — so a run is a faithful snapshot of the current index and ranking.

## Running

```bash
npm run eval -- --mode hybrid          # vector + keyword + RRF (default)
npm run eval -- --mode vector          # embeddings only
npm run eval -- --mode keyword         # full-text only (no embeddings)
npm run eval -- --mode hybrid --delay 21000   # pace requests (see below)
```

Each run prints a per-question rank, the metric tables, and the miss list, and
writes the full result set to `evals/results/<timestamp>-<mode>.json`.

> **Voyage free-tier rate limit.** `vector` and `hybrid` embed every query, and
> the free tier allows ~3 embeddings/minute. Without `--delay` a full run hits
> `429`s: `vector` errors out, and `hybrid` silently degrades to keyword-only —
> which quietly *understates* hybrid quality. Pace it with `--delay 21000`
> (~21s between questions). `keyword` uses no embeddings and needs no delay. Any
> question that ran degraded is counted and warned about in the output.

## The gold set

`evals/questions.jsonl` — 40 questions, one JSON object per line:

```json
{ "id", "question", "expected_doc", "expected_pages", "difficulty", "notes" }
```

Five entries have `"expected_doc": null` with empty `expected_pages`. These are
**unanswerable** questions that exist to test *refusal*, not retrieval. They are
excluded from every retrieval metric and listed in their own section of the
output. (Refusal itself is checked by `npm run ask -- --refusals`.)

The remaining answerable questions are graded by `difficulty` — `easy`,
`medium`, `hard` — so ranking quality can be read separately for lookups vs.
questions that need inference or span pages.

## What counts as a hit

A retrieved chunk is **relevant** when it is from the question's `expected_doc`
**and** its page is in `expected_pages`. A question is a **hit at rank _k_** if a
relevant chunk appears at or above position _k_ in the ranked results. Only the
top 10 results are examined.

## Metrics

All metrics are computed over answerable questions only, and reported **overall
and per difficulty**.

- **recall@1** — fraction of questions whose *first* result is already relevant.
  This is the "one-shot" quality: if a downstream reader only looked at the top
  chunk, how often would it be right?
- **recall@5** — fraction with a relevant chunk somewhere in the top 5.
- **recall@10** — fraction with a relevant chunk somewhere in the top 10. With a
  10-result cutoff this is the ceiling: `1 − recall@10` is the pure **coverage**
  failure rate — questions where the right passage never surfaced at all.
- **MRR** (mean reciprocal rank, over the top 10) — the average of `1/rank` of
  the first relevant chunk (0 when there is no hit in the top 10). It rewards
  putting the right chunk *higher*, not just *somewhere*: a first hit at rank 1
  contributes 1.0, at rank 2 → 0.5, at rank 5 → 0.2. MRR is the single number
  that best summarizes ranking quality.

## Reading a recall@1 → recall@5 gap

The shape of the recall curve tells you *where* to spend effort.

- **Large gap (low recall@1, high recall@5)** — e.g. R@1 60%, R@5 95%. The right
  chunk *is* being retrieved, it's just not ranked first. This is a **ranking /
  re-ranking** problem, not a coverage problem: the candidate set is good but the
  scorer orders it poorly. MRR will be middling. Fixes live in scoring — fusion
  weights, a re-ranker, better query embeddings — not in retrieving *more*.
- **Small gap, high recall@1** — e.g. R@1 90%, R@5 94%. Ranking is already
  strong; there is little headroom from re-ranking. Remaining errors are mostly
  the hard tail.
- **Small gap, but low recall@10** — e.g. R@1 55%, R@5 60%, R@10 62%. Adding
  depth barely helps because the relevant chunk **isn't in the candidate set at
  all**. This is a **coverage** problem: chunking, embedding quality, index
  recall, or query formulation. Re-ranking cannot fix what was never retrieved.

Rule of thumb: **recall@10 caps what re-ranking can buy you; the recall@1→@5 gap
is how much of that headroom is a ranking problem.** Improve coverage first when
recall@10 is low; improve ranking when recall@10 is high but recall@1 lags.

Compare `keyword`, `vector`, and `hybrid` on the same gold set to see which arm
contributes the coverage and which the ranking — and check the miss list, which
prints each unretrieved question alongside what actually came back, so failures
are diagnosable rather than just counted.

## Results files

`evals/results/<timestamp>-<mode>.json` contains: run metadata and counts,
`overall` and `byDifficulty` metrics, the `misses` list (with the top-3 chunks
actually returned for each), full `perQuestion` detail (rank + hit flags), and
the excluded `unanswerable` list. Keep them in git to track retrieval quality
across changes.
