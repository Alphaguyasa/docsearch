# Sweep report — 2026-07-27T11:03:49.776Z

10 arms · 760 question-runs · $0 · commit `6a3905e`

Baseline: `mode-hybrid` · primary metric: `recall@20` · seed 42 · 10000 resamples · α=0.05 · **retrieval-only** (no generation, no judging)

## Arms

| variant | n | recall@20 | 95% CI | nDCG@10 | MRR |
|---|---|---|---|---|---|
| `mode-hybrid` | 63 | 52.8% | [40.5%, 64.7%] | 42.9% | 43.4% |
| `mode-dense` | 63 | 52.4% | [40.3%, 64.6%] | 45.0% | 44.2% |
| `mode-keyword` | 63 | 42.2% | [30.4%, 54.1%] | 31.7% | 30.5% |
| `topk-3` | 63 | 34.7% | [23.8%, 46.0%] | 33.9% | 40.2% |
| `topk-5` | 63 | 48.6% | [36.8%, 60.3%] | 40.8% | 42.9% |
| `topk-10` | 63 | 55.3% | [43.2%, 67.4%] | 44.1% | 43.5% |
| `topk-20` | 63 | 64.0% | [52.5%, 75.4%] | 44.1% | 44.2% |
| `searchtop-10` | 63 | 55.8% | [44.0%, 67.6%] | 43.6% | 43.6% |
| `searchtop-40` | 63 | 54.8% | [42.9%, 66.5%] | 45.1% | 44.3% |
| `searchtop-80` | 63 | 51.7% | [39.8%, 63.4%] | 44.9% | 44.6% |

Those intervals are on individual means and overlap heavily. They support almost no conclusion on their own — which is why the next section is paired.

## Paired against `mode-hybrid`

| variant | Δ recall@20 | 95% CI | p | Holm adj. | survives Holm |
|---|---|---|---|---|---|
| `mode-dense` | −0.3pp | [−8.4pp, +7.7pp] | 0.928 | 1.00 | **1** of 33 |
| `mode-keyword` | −10.5pp | [−20.3pp, −1.4pp] | 0.025 | 0.325 | **10** of 33 |
| `topk-3` | −18.0pp | [−27.2pp, −9.8pp] | <0.001 | 0.007 | **17** of 33 |
| `topk-5` | −4.2pp | [−9.1pp, −0.2pp] | 0.001 | 0.043 | **6** of 33 |
| `topk-10` | +2.6pp | [+0.1pp, +6.6pp] | 0.012 | 0.360 | **2** of 33 |
| `topk-20` | +11.2pp | [+4.6pp, +19.3pp] | <0.001 | 0.007 | **5** of 33 |
| `searchtop-10` | +3.0pp | [−1.0pp, +8.6pp] | 0.246 | 1.00 | **3** of 33 |
| `searchtop-40` | +2.0pp | [−2.9pp, +8.0pp] | 0.361 | 1.00 | **0** of 33 |
| `searchtop-80` | −1.1pp | [−9.2pp, +6.9pp] | 0.862 | 1.00 | **1** of 33 |

"Survives Holm" counts every metric in that comparison whose Holm-adjusted p clears α, not just the primary. Testing ~33 metrics at α=0.05 expects ~1.7 false positives by chance, so an uncorrected p is weak evidence on its own.

**Holm is conservative on this metric set.** `recall@1`…`recall@20` are one metric at five cutoffs, not five independent hypotheses. Failing Holm means "not established by this test alone", not "refuted".

## By question type — `recall@20`

| type | n | ceiling @k=8 | `mode-hybrid` | `mode-dense` | `mode-keyword` | `topk-3` | `topk-5` | `topk-10` | `topk-20` | `searchtop-10` | `searchtop-40` | `searchtop-80` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factoid | 37 | 100.0% | 64.9% | 64.9% | 48.6% | 43.2% | 59.5% | 64.9% | 75.7% | 67.6% | 67.6% | 62.2% |
| multihop | 7 | 100.0% | 92.9% | 92.9% | 85.7% | 64.3% | 85.7% | 100.0% | 100.0% | 92.9% | 92.9% | 92.9% |
| aggregation | 8 | 31.4% | 9.3% | 6.6% | 7.6% | 4.8% | 7.7% | 10.8% | 16.4% | 8.1% | 12.5% | 13.4% |
| paraphrase | 11 | 100.0% | 18.2% | 18.2% | 18.2% | 9.1% | 18.2% | 27.3% | 36.4% | 27.3% | 18.2% | 18.2% |
| unanswerable | 13 | — | — | — | — | — | — | — | — | — | — | — |

**Read each row against its ceiling, not against 100%.** A type whose questions have more relevant chunks than the arm returns cannot reach 100% recall however good retrieval is, so a low score there is partly a statement about topK rather than about retrieval quality.

> The ceiling column is anchored to `mode-hybrid` (topK=8). These arms use different topK values (3, 5, 8, 10, 20), so arms returning more chunks have a proportionally higher ceiling on any type whose relevant set exceeds their topK. Compare within a topK, not across.

## Cost and latency

| variant | cost | per question | total p50 | total p95 |
|---|---|---|---|---|
| `mode-hybrid` | $0 | $0 | 950ms | 2507ms |
| `mode-dense` | $0 | $0 | 869ms | 1087ms |
| `mode-keyword` | $0 | $0 | 876ms | 1096ms |
| `topk-3` | $0 | $0 | 941ms | 1277ms |
| `topk-5` | $0 | $0 | 986ms | 1289ms |
| `topk-10` | $0 | $0 | 946ms | 1236ms |
| `topk-20` | $0 | $0 | 1006ms | 1593ms |
| `searchtop-10` | $0 | $0 | 858ms | 1328ms |
| `searchtop-40` | $0 | $0 | 999ms | 1470ms |
| `searchtop-80` | $0 | $0 | 1157ms | 1603ms |

Cost and latency describe the runs **as executed**, including cache state and rate-limiter pacing. A cold arm against a cached one differs enormously on both while retrieving identical chunks. Compare these only between arms run under the same cache state.

## What this golden set can detect

- 95% CI half-width on one arm's mean: **±12.3pp**
- Minimum detectable effect, unpaired: **24.9pp** (80% power)
- Minimum detectable effect, paired: **11.7pp** (ρ=0.78, measured against `mode-dense`)

A difference smaller than the paired figure is **inconclusive here, not absent**. The MDE is a planning figure from a normal approximation; the CIs above come from the observed difference distribution and can resolve smaller effects when arms are highly correlated. The MDE answers "how big an effect should I plan to need"; the CI answers "did I find one".

---

Generated by `scripts/sweep.ts`. Reproduce any row with `npm run eval:compare -- mode-hybrid <variant> --local`.
