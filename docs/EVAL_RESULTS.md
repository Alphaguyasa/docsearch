# Retrieval experiments: four things that didn't work, and one that did

**Phase 6 of [`EVAL_HARNESS.md`](EVAL_HARNESS.md).** Eleven experiment arms over a
2,134-chunk / 90-document corpus, measured against a 77-question human-reviewed
golden set. 847 question-runs. Total API cost: **$0.00.**

Measured at commit `7ec8446`. Every number here is retrieval-only — no
generation, no LLM judging. See [What this does not measure](#what-this-does-not-measure)
before quoting anything.

---

## The short version

I tuned four retrieval knobs. Three did nothing, and the one that worked isn't
a knob you'd want to turn far. Then the per-question-type breakdown found a
failure mode worth more than all four experiments put together.

| Experiment | Result |
|---|---|
| **top-k** (3 → 20) | Every step significant. Recall never saturates. |
| **searchTop** (10 → 80) | Nothing, and non-monotonic. 8× the depth, +461ms, no gain. |
| **dense vs hybrid** | Nothing, on any of 31 metrics — while changing 77/77 result sets. |
| **keyword-only** | Significantly worse than both. This is what explains the null above. |
| **Per-type breakdown** | **4 of 6 questions retrieval got right were lost when reworded.** |

The thesis all five support: **the candidate pool is not the constraint, and
neither is how it's fused. Retrieval finds the right chunk or it doesn't, and
whether it does depends on question wording far more than on any parameter I
varied.**

---

## Setup

- **Corpus:** 90 documents, 2,134 chunks, 800-token target with 15% overlap.
- **Embeddings:** `voyage-4`, 1024 dimensions.
- **Retrieval:** Postgres + pgvector, hybrid = vector + full-text fused with
  Reciprocal Rank Fusion (k=60).
- **Golden set:** 92 human-reviewed questions, split 77 dev / 15 holdout with a
  seeded, paraphrase-family-aware split. **Everything below is the dev split.
  The holdout has not been touched.**
- **Answerable questions: 62.** The other 15 are unanswerable questions that
  assert a refusal; retrieval metrics return `null` for them rather than 0, so
  they are excluded from retrieval means instead of dragging them down.

Baseline is production exactly: hybrid, topK 8, searchTop 20, rrfK 60.

### Method: paired, not independent

At n=62, the 95% confidence interval on a single arm's recall is roughly
**±12 percentage points**. Every arm below overlaps every other arm on that
basis. Reporting one mean per variant and declaring a winner would be
meaningless.

So every comparison here is **paired**: both arms answer the same questions,
joined on question id, and the bootstrap resamples the *per-question
differences*. Question difficulty is the dominant variance term in a set this
small and both arms feel it identically, so differencing cancels it. That takes
the minimum detectable effect from ~25pp down to ~10–14pp depending on how
correlated the arms are.

10,000 resamples, seeded (mulberry32, seed 42), so every p-value here is
reproducible.

---

## Arm summary

Recall over everything each arm returned, with 95% bootstrap CIs:

| arm | recall | 95% CI | nDCG@10 | MRR | search p50 |
|---|---|---|---|---|---|
| topk-3 | 33.7% | [22.6, 45.1] | 32.8% | 39.2% | 969ms |
| topk-5 | 47.8% | [35.8, 59.6] | 39.8% | 42.0% | 929ms |
| topk-10 | 54.6% | [42.7, 66.6] | 43.2% | 42.6% | 975ms |
| topk-20 | 63.4% | [51.8, 74.9] | 43.2% | 43.3% | 930ms |
| searchtop-10 | 55.1% | [43.0, 66.9] | 42.7% | 42.7% | 936ms |
| searchtop-20 | 52.0% | [39.6, 64.2] | 42.0% | 42.5% | 1016ms |
| searchtop-40 | 54.0% | [41.8, 65.8] | 44.2% | 43.4% | 1070ms |
| searchtop-80 | 50.9% | [38.9, 62.7] | 44.0% | 43.7% | 1523ms |
| mode-hybrid *(= baseline)* | 52.0% | [40.0, 63.6] | 42.0% | 42.5% | 1067ms |
| mode-dense | 51.7% | [39.4, 63.7] | 44.1% | 43.3% | 1110ms |
| mode-keyword | 41.3% | [29.4, 52.9] | 31.2% | 30.2% | 832ms |

Look at how much those intervals overlap. That table on its own supports almost
no conclusion — which is the point of the rest of this document.

Three of those arms (`searchtop-20`, `mode-hybrid`, and the original baseline
run) are the same configuration measured independently. All three reproduce
byte-identically across all 77 questions, including per-chunk scores to six
decimal places. That is the control, and it passed three times.

---

## Experiment 1 — top-k, with searchTop fixed

Vary how many chunks are returned; hold the candidate pool at 20.

| step | recall | 95% CI | precision | latency |
|---|---|---|---|---|
| 3 → 5 | **+14.1pp** | [+6.7, +22.8] \*\*\* | −2.9pp (ns) | — |
| 5 → 10 | **+6.8pp** | [+1.9, +13.1] \*\*\* | −6.6pp \*\*\* | +52ms \* |
| 10 → 20 | **+8.8pp** | [+2.4, +16.3] \*\*\* | −3.9pp \*\*\* | +38ms (ns) |

Recall 33.7% → 47.8% → 54.6% → 63.4%. Precision 21.0% → 7.6%. nDCG@20 climbs
monotonically (31.5 → 44.3), so the extra chunks land in useful positions rather
than padding the tail.

**Every step is significant, including the last — recall never saturates.** This
is the most robust result in the report: on the widest contrast (k=3 vs k=20),
**18 of 33 tests survive Holm correction**, including recall at every cutoff,
nDCG, MRR, hit rate, and the precision decline. Nothing else here comes close.

**But this experiment cannot answer the question it appears to.** `searchTop` is
20, so at k=20 the arm returns the *entire* fused pool. 63.4% is a ceiling
imposed by the pool size, not a property of k. I verified the mechanism
directly: every arm is an **exact prefix** of the k=20 arm on all 77 questions.
This is a truncation curve. It tells you how much of a fixed candidate list to
return — all of it, on recall — not where retrieval depth stops paying.

That needed its own experiment.

## Experiment 2 — searchTop, with top-k fixed

The complement: vary the candidate pool each source contributes before fusion;
hold what's returned at 8 (production's value).

| step | recall | 95% CI | latency |
|---|---|---|---|
| 10 → 20 | −3.1pp | [−8.7, +1.1] ns | +16ms ns |
| 20 → 40 | +2.0pp | [−3.0, +7.4] ns | −9ms ns |
| 40 → 80 | −3.1pp | [−9.6, +3.2] ns | **+461ms \*\*\*** |
| **10 → 80** | **−4.2pp** | **[−14.3, +5.4] ns** | **+467ms \*\*\*** |

An eight-fold increase in retrieval depth buys nothing measurable and costs
461ms at p50. The curve isn't flat, it's **non-monotonic** — 55.1, 52.0, 54.0,
50.9 — which is what noise looks like.

Not because the deeper pool is ignored: the returned top-8 **changes on 51–61 of
77 questions** between adjacent arms. Retrieval churns heavily and quality
doesn't move. Deeper fusion reorders the head slightly better while dropping
relevant chunks out of the tail of the 8, and the two cancel.

**Three results in this experiment came back significant and none survive
multiple-comparison correction.** Of 33 tests in the widest contrast (10→80),
**exactly one clears Holm — the 467ms latency penalty.** The only effect this
sweep establishes is its own cost. See
[Statistical discipline](#statistical-discipline).

**Actionable:** leave `SEARCH_TOP` at 20. Nothing argues for moving it in either
direction — 10 is no faster in wall-clock terms (ns) and 80 is materially slower
for nothing.

## Experiment 3 — dense vs hybrid vs keyword

The guide predicts hybrid is "usually the biggest single win, especially for
names, IDs, and rare terms." On this corpus it is not a win at all.

**Dense vs hybrid: no significant difference on any of 31 metrics, and 0 of 33
tests survive Holm.** This is the cleanest null in the report.

| metric | hybrid | dense | delta | 95% CI |
|---|---|---|---|---|
| recall@1 | 19.7% | 25.9% | +6.2pp | [−1.3, +14.3] ns |
| recall@10 | 52.0% | 51.7% | −0.4pp | [−8.4, +7.8] ns |
| nDCG@10 | 42.0% | 44.1% | +2.2pp | [−3.9, +8.3] ns |
| latency | 1184ms | 1225ms | +41ms | ns |

And the returned top-8 differs on **77 of 77 questions**. Fusion reorders every
single result list and moves nothing measurable.

That result is ambiguous on its own — fusing two comparable signals and fusing a
strong signal into a weak one look identical from this comparison, and they
imply opposite things about whether the keyword arm should exist. So I added a
keyword-only arm. (This required widening the harness's `RetrievalMode`, a
documented deviation from the spec, which defines `dense | hybrid` only.)

**Keyword-only is worse than both — but the two comparisons are not equally
well established.** Holm-adjusted over the 33 tests in each:

| comparison | raw | survives Holm |
|---|---|---|
| keyword → hybrid | precision@5 +5.8pp \*\*\*, nDCG@5 +12.6pp \*\*, hitRate@5 +16.1pp \*\*, nDCG@10 +10.7pp \*\*, recall@5 +12.4pp \*\* | **5 quality metrics** (precision@5 adj 0.019, nDCG@5 and hitRate@5 adj 0.037, nDCG@10 and @20 adj 0.046) |
| keyword → dense | MRR +13.2pp \*, nDCG@10 +12.9pp \*, recall@1 +12.9pp \* | **none** — only the latency difference clears |

The effect sizes are near-identical across both comparisons (+12–15pp), so the
difference in survival is about *consistency*, not magnitude: the
keyword-vs-hybrid differences vary less per question, because hybrid contains
the keyword arm and the two are more correlated. Same effect, tighter interval,
smaller p.

**What that means in practice:** keyword-only being weaker than hybrid is
established under family-wise error control. Keyword-only being weaker than
*dense* is supported by 13 metrics moving +12–15pp in the same direction, and
by the hybrid comparison replicating it, but does not survive correction on its
own.

**Mechanism: vector similarity is doing all the work.** Lexical search is a
~11pp weaker signal, and hybrid blends it into the stronger one to land
indistinguishable from dense alone. A detail that confirms the arm really is
doing what it claims: the keyword run recorded **0 embedding cache hits and 0
misses** — it never embeds the query at all.

The +6.2pp dense advantage at rank 1 hints fusion may be mildly *harmful* at the
head. It sits below the 11.9pp detectable threshold and is **not claimed** —
but it's the most consistent signal in the whole set of experiments, and it
points against the inherited assumption.

**Actionable, cautiously:** hybrid costs a second Postgres query and buys nothing
this golden set can see. That is not the same as "remove it." The honest
position is *unjustified rather than disproven*, and resolving the rank-1
question needs roughly 230 answerable questions against today's 62.

---

## Where the system actually fails

The four experiments above vary parameters. This section varies nothing and
found more.

### Recall by question type

| type | n | keyword | dense | hybrid | ceiling |
|---|---|---|---|---|---|
| factoid | 36 | 47.2% | 63.9% | 63.9% | 100% |
| multihop | 7 | 85.7% | 92.9% | 92.9% | 100% |
| paraphrase | 11 | 18.2% | 18.2% | 18.2% | 100% |
| aggregation | 8 | 7.6% | 6.6% | 9.3% | **31.4%** |

**Read the aggregation row against its ceiling, not against 100%.** Aggregation
questions average 35 relevant chunks (max 79), so returning 8 chunks caps recall
at 31.4% *however good retrieval is*. The observed ~8% is genuinely poor — about
a quarter of what's achievable — but the metric is partly measuring topK rather
than retrieval quality for this bucket. Recall is the wrong instrument for
"how many papers mention X"; that question needs aggregation over the corpus,
not top-k retrieval, and the harness should probably score it differently.

The three paraphrase columns being identical is **arithmetic coincidence, not
per-question agreement** — the modes disagree on individual questions and happen
to sum to 2/11 each. I nearly reported it as a finding.

### The finding: retrieval is not robust to rewording

Paraphrase questions target the *same chunk* as a parent factoid, with the same
relevant-set size of 1. So parent and paraphrase are directly comparable, and
every dev-split paraphrase has its parent in the dev split too.

Of the 11 pairs, **retrieval found the target for 6 parents — and kept it for
only 2 when the question was reworded.**

| parent | paraphrase | |
|---|---|---|
| q-0032 ✅ | q-0107 ❌ | lost on rewording |
| q-0021 ✅ | q-0110 ❌ | lost on rewording |
| q-0017 ✅ | q-0111 ❌ | lost on rewording |
| q-0002 ✅ | q-0112 ❌ | lost on rewording |
| q-0020 ✅ | q-0113 ✅ | |
| q-0025 ✅ | q-0117 ✅ | |
| *(5 pairs where the parent also failed)* | | |

**Four of six successes lost to rewording.** Exact McNemar over the 4 discordant
pairs gives p=0.125 — *not significant*, and n=11 pairs is small. But the effect
is large, the comparison is clean, and this is precisely what the paraphrase
bucket was built to detect.

It also reframes every experiment above. Retrieval's problem on this corpus is
not how many candidates it considers or how it fuses them — it's that a semantic
match found under one phrasing evaporates under another. **None of the four
parameters I swept can fix that.** Query rewriting and reranking attack it
directly; both are still unrun.

---

## What this golden set cannot detect

Stated up front rather than left for a reader to ask about:

- **95% CI half-width on one arm's mean: ±12.4pp** at n=62.
- **Minimum detectable effect, unpaired:** 25.1pp at 80% power, α=0.05.
- **Minimum detectable effect, paired:** 10–14pp depending on arm correlation
  (ρ ranged 0.67 to 0.84).

**Any difference smaller than roughly 10pp is inconclusive here, not absent.**
Where a result above is reported as null, the honest claim is "no effect large
enough for this set to see," not "no effect."

**One caveat on reading that threshold too literally.** Two of the three
significant top-k steps (+6.8pp and +8.8pp) are *below* the 10.1pp paired MDE
for those arms, and were still resolved. That is not a contradiction: the MDE is
a planning figure from a normal approximation on proportion variance, while the
paired bootstrap works directly on the observed distribution of per-question
differences. When arms are highly correlated (ρ=0.84 for the top-k sweep) most
questions differ by exactly zero and the difference distribution is far tighter
than the approximation assumes. The MDE is the right number for "how big an
effect should I plan to need"; the CI is the right number for "did I find one."

---

## Statistical discipline

**Three results in the searchTop sweep came back marked significant and I
discarded all three** — recall@5 at 10→20 (p=0.001), recall@5 at 20→40
(p=0.034), precision@10 at 20→40 (p=0.011). That sweep ran 4 comparisons × 7
metrics = 28 tests at α=0.05, where ~1.4 false positives are expected by chance.
Only the first survives a Bonferroni threshold (~0.0018), and it is contradicted
by the widest contrast in the same experiment: 10→80 recall@5 is +6.2pp, ns.
**A real effect does not vanish when you increase the contrast.**

The keyword results look superficially similar — several marginal p-values — but
are treated as real, and the distinction matters:

| | searchTop sweep | keyword arm |
|---|---|---|
| Directions | inconsistent, sign flips | all metrics agree |
| Magnitude | scattered 1–4pp | consistent 10–15pp |
| Effect vs MDE | below | at or above |
| Widest contrast | effect disappears | effect strongest |
| Independent replication | — | holds vs *both* dense and hybrid |
| Survives Holm | no | vs hybrid yes, vs dense no |

### Holm–Bonferroni, applied

`compare-runs` now reports a Holm-adjusted p-value for every metric in a
comparison and marks which survive. The whole report, corrected:

| comparison | survives Holm | of |
|---|---|---|
| topk-3 → topk-20 | **18** | 33 |
| keyword → hybrid | **6** (5 quality + latency) | 33 |
| keyword → dense | 1 (latency only) | 33 |
| searchtop-10 → searchtop-80 | 1 (latency only) | 33 |
| hybrid → dense | **0** | 33 |

That table is the report in one glance, and it is more honest than the prose
around it. The top-k result is overwhelming. The keyword result is real against
hybrid and merely suggestive against dense. Everything else establishes nothing
except its own latency cost.

**Holm is conservative here and the numbers should be read with that in mind.**
`recall@1 … recall@20` are one metric at five cutoffs, not five independent
hypotheses; `mrr` and `mrr@20` are frequently the same number. Holm assumes the
worst about that dependence, so failing it means "not established by this test
alone," not "refuted." A result that fails Holm while moving consistently across
related metrics and strengthening with contrast — which is exactly the
keyword-vs-dense case — is still worth believing. That judgment remains human,
and the tool prints a note saying so rather than letting a ✓ column imply
otherwise.

---

## Limitations

1. **No generation or judging in any number here.** All arms ran
   `--retrieval-only`. Faithfulness, correctness, citation accuracy and refusal
   accuracy are **not measured** in this report.
2. **The LLM judge is built but has never been calibrated.** There is no kappa
   against human labels. Any judged number this project produces today is an
   unvalidated model opinion and should not be quoted. That is the single
   biggest gap in the project and is blocked on a free-tier daily quota.
3. **n=62 answerable questions.** Small. See the power section.
4. **Dev split only.** The 15-question holdout is untouched and stays that way
   until a final measurement.
5. **Aggregation recall is ceiling-limited** at 31.4% and is arguably the wrong
   metric for that question type entirely.
6. **Paraphrase evidence is n=11 pairs**, p=0.125. Suggestive, not established.
7. **Latency comparisons are between runs, not between variants.** Cost and
   latency reflect cache state and rate-limiter pacing as executed. Two runs
   retrieving byte-identical chunks showed a 39-second mean latency difference
   purely because one ran cold. Compare these only between runs with matched
   cache state, and prefer p50 over mean — one paced wait dominates a mean of 77.
8. **Holm is conservative under correlated metrics**, and the decision to
   believe a result that fails it remains a human judgment. See above.

---

## Not run, and why

| Experiment | Status |
|---|---|
| Chunk size (256/512/1024) | Needs re-ingestion and a table per arm. Low expected value given four results saying retrieval-stage knobs don't move quality. |
| Reranking | Needs a rerank API. **Highest expected value remaining** — it attacks ordering, which is what these results implicate. |
| Query rewriting (HyDE / decompose) | Needs LLM quota. Directly targets the paraphrase-robustness failure above. |
| Embedding model (lite vs full) | Needs re-embedding the corpus. |
| Prompt variants | Needs generation + a *calibrated* judge. Blocked on Phase 3. |

The two unrun experiments that matter — reranking and query rewriting — are
exactly the two this report's findings point at. That is not a coincidence: the
sweeps were cheap because they changed nothing downstream of retrieval, and the
things that would actually help all cost API calls.

---

## Deviations from the spec

- **`scripts/sweep.ts` writes to `eval/runs/` by default, as the guide
  specifies — but that directory is gitignored**, so a report meant to be
  committed needs `--out docs/...`. The tool prints a note saying so rather than
  leaving it to be discovered via `git status`. *This* report predates the sweep
  runner and was hand-assembled; that hand-assembly is what produced the two
  errors corrected above, and is the reason the tool now prints a recall ceiling
  next to every per-type score.
- **`RetrievalMode` was widened** from `dense | hybrid` to include `keyword`,
  for the reason given in Experiment 3. See `eval/src/types.ts`.
- **Phase 4's acceptance was restated** from "all ~100 questions" to "the full
  dev split (77 questions)" — the original predated the dev/holdout split.

---

## Appendix: reproducing this

```bash
# One arm, or one pair
npm run eval:run     -- --variant mode-dense --retrieval-only
npm run eval:compare -- mode-hybrid mode-dense --local --regressions

# The whole report, regenerated from runs already on disk
npm run eval:sweep -- mode-hybrid mode-dense mode-keyword \
  topk-3 topk-5 topk-10 topk-20 searchtop-10 searchtop-40 searchtop-80 \
  --baseline mode-hybrid --reuse --metric recall@20 --out docs/SWEEP.md
```

`--reuse` reports on each variant's most recent usable run without executing
anything, which is how a report is regenerated after a layout change.

Every arm is one config file in `eval/config/`. Runs are cached by content hash,
so re-running an arm that has already executed costs nothing and takes seconds.
All 11 arms in this report re-run for **$0**.
