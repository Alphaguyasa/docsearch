# Retrieval experiments: four things that didn't work, and one that did

**Phase 6 of [`EVAL_HARNESS.md`](EVAL_HARNESS.md).** Eleven experiment arms over a
2,134-chunk / 90-document corpus, measured against a 76-question human-reviewed
golden set. 760 question-runs. Total API cost: **$0.00.**

Measured at commit `6a3905e`, on the post-audit golden set. Every table here is
regenerable with `npm run eval:sweep` — see [`SWEEP.md`](SWEEP.md), its
machine-generated companion. Every number here is retrieval-only — no
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
| **searchTop** (10 → 80) | Nothing, and non-monotonic. 8× the depth, +300ms, no gain. |
| **dense vs hybrid** | Nothing, on any of 31 metrics — while changing 76/76 result sets. |
| **keyword-only** | Significantly worse than both. This is what explains the null above. |
| **Per-type breakdown** | **4 of 6 questions retrieval got right were lost when reworded.** |
| **Unanswerable audit** | **4 of 15 "unanswerable" questions were answerable.** Refusal is 100%, not 50%. |

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
- **Golden set:** 91 human-reviewed questions, split 76 dev / 15 holdout with a
  seeded, paraphrase-family-aware split. **Everything below is the dev split.
  The holdout has not been touched.**
- **Answerable questions: 63.** The other 13 are unanswerable questions that
  assert a refusal; retrieval metrics return `null` for them rather than 0, so
  they are excluded from retrieval means instead of dragging them down.

> Every arm was re-run on the post-audit set after the
> [unanswerable audit](#the-unanswerable-bucket-was-contaminated). No conclusion
> changed; magnitudes moved by ≤1.2pp. The pre-audit numbers are in this
> document's git history.

Baseline is production exactly: hybrid, topK 8, searchTop 20, rrfK 60.

### Method: paired, not independent

At n=63, the 95% confidence interval on a single arm's recall is roughly
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
| topk-3 | 34.7% | [23.8, 46.0] | 33.9% | 40.2% | 941ms |
| topk-5 | 48.6% | [36.8, 60.3] | 40.8% | 42.9% | 986ms |
| topk-10 | 55.3% | [43.2, 67.4] | 44.1% | 43.5% | 946ms |
| topk-20 | 64.0% | [52.5, 75.4] | 44.1% | 44.2% | 1006ms |
| searchtop-10 | 55.8% | [44.0, 67.6] | 43.6% | 43.6% | 858ms |
| searchtop-20 *(= mode-hybrid)* | 52.8% | [40.5, 64.7] | 42.9% | 43.4% | 950ms |
| searchtop-40 | 54.8% | [42.9, 66.5] | 45.1% | 44.3% | 999ms |
| searchtop-80 | 51.7% | [39.8, 63.4] | 44.9% | 44.6% | 1157ms |
| mode-hybrid *(= baseline)* | 52.8% | [40.5, 64.7] | 42.9% | 43.4% | 950ms |
| mode-dense | 52.4% | [40.3, 64.6] | 45.0% | 44.2% | 869ms |
| mode-keyword | 42.2% | [30.4, 54.1] | 31.7% | 30.5% | 876ms |

Look at how much those intervals overlap. That table on its own supports almost
no conclusion — which is the point of the rest of this document.

Three of those arms (`searchtop-20`, `mode-hybrid`, and the original baseline
run) are the same configuration measured independently. All three reproduce
byte-identically across all 76 questions, including per-chunk scores to six
decimal places. That is the control, and it passed three times.

---

## Experiment 1 — top-k, with searchTop fixed

Vary how many chunks are returned; hold the candidate pool at 20.

| step | recall | 95% CI | precision | latency |
|---|---|---|---|---|
| 3 → 5 | **+13.9pp** | [+6.5, +22.5] \*\*\* | −3.1pp \* | — |
| 5 → 10 | **+6.7pp** | [+1.9, +13.1] \*\*\* | −6.7pp \*\*\* | ns |
| 10 → 20 | **+8.7pp** | [+2.5, +16.1] \*\*\* | −3.9pp \*\*\* | ns |

Recall 34.7% → 48.6% → 55.3% → 64.0%. Precision 21.2% → 7.5%. nDCG@20 climbs
monotonically (32.6 → 45.2), so the extra chunks land in useful positions rather
than padding the tail.

**Every step is significant, including the last — recall never saturates.** This
is the most robust result in the report: on the widest contrast (k=3 vs k=20),
**18 of 33 tests survive Holm correction**, including recall at every cutoff,
nDCG, MRR, hit rate, and the precision decline. Nothing else here comes close.

**But this experiment cannot answer the question it appears to.** `searchTop` is
20, so at k=20 the arm returns the *entire* fused pool. 64.0% is a ceiling
imposed by the pool size, not a property of k. I verified the mechanism
directly: every arm is an **exact prefix** of the k=20 arm on all 76 questions.
This is a truncation curve. It tells you how much of a fixed candidate list to
return — all of it, on recall — not where retrieval depth stops paying.

That needed its own experiment.

## Experiment 2 — searchTop, with top-k fixed

The complement: vary the candidate pool each source contributes before fusion;
hold what's returned at 8 (production's value).

| step | recall | 95% CI | latency |
|---|---|---|---|
| 10 → 20 | −3.0pp | [−8.6, +1.0] ns | +141ms \*\*\* |
| 20 → 40 | +2.0pp | [−2.9, +8.0] ns | ns |
| 40 → 80 | −3.1pp | [−9.5, +3.2] ns | **+142ms \*\*\*** |
| **10 → 80** | **−4.1pp** | **[−13.9, +5.3] ns** | **+300ms \*\*\*** |

An eight-fold increase in retrieval depth buys nothing measurable and costs
300ms. The curve isn't flat, it's **non-monotonic** — 55.8, 52.8, 54.8, 51.7 —
which is what noise looks like.

> **The latency figures moved between measurement rounds and the recall figures
> did not.** An earlier round put 40→80 at +461ms; re-running every arm on the
> post-audit set put it at +142ms. Same configs, same corpus. That is the
> caveat further down demonstrating itself: a paired latency delta is a fact
> about two *runs*, not about two variants. The stable statement is the p50
> column in the arm summary, where searchtop-80 is consistently the slowest arm.

Not because the deeper pool is ignored: the returned top-8 **changes on most
questions** between adjacent arms. Retrieval churns heavily and quality
doesn't move. Deeper fusion reorders the head slightly better while dropping
relevant chunks out of the tail of the 8, and the two cancel.

**Three results in this experiment came back significant and none survive
multiple-comparison correction.** Of 33 tests in the widest contrast (10→80),
**exactly one clears Holm — the latency penalty.** The only effect this sweep
establishes is its own cost. See
[Statistical discipline](#statistical-discipline).

**Actionable:** leave `SEARCH_TOP` at 20. Nothing argues for moving it in either
direction — 10 is no faster in wall-clock terms (ns) and 80 is materially slower
for nothing.

## Experiment 3 — dense vs hybrid vs keyword

The guide predicts hybrid is "usually the biggest single win, especially for
names, IDs, and rare terms." On this corpus it is not a win at all.

**Dense vs hybrid: no significant difference on any of 31 quality metrics, and
1 of 33 tests survives Holm — a latency difference, not a quality one.** This is
the cleanest null in the report.

| metric | hybrid | dense | delta | 95% CI |
|---|---|---|---|---|
| recall@1 | 20.9% | 27.1% | +6.1pp | [−1.6, +14.1] ns |
| recall@20 | 52.8% | 52.4% | −0.3pp | [−8.4, +7.7] ns |
| nDCG@10 | 42.9% | 45.0% | +2.1pp | [−3.8, +8.2] ns |
| latency p50 | 950ms | 869ms | — | ns |

And the returned top-8 differs on **76 of 76 questions**. Fusion reorders every
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
| keyword → hybrid | precision@5 +5.7pp \*\*\*, MRR +12.9pp \*\*, nDCG@10 +11.2pp \*\*\*, recall@20 +10.5pp \* | **10 of 33**, including precision@5 (adj 0.007), nDCG@10 (adj 0.012), MRR (adj 0.034) |
| keyword → dense | recall@1 +14.3pp \*\*, MRR +13.8pp \*, nDCG@10 +13.3pp \* | **none** |

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
| factoid | 37 | 48.6% | 64.9% | 64.9% | 100% |
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

## The unanswerable bucket was contaminated

The first judged run reported **refusal accuracy of 50%** — the system answering
questions it was supposed to decline. That would have been the worst finding in
the project. It was not a system failure at all.

**Two artifacts, stacked.** The 50% came from a 30-question subset that happened
to contain 3 of the 4 bad items; the full bucket read 73.3%. And every one of
those 4 "failures" was the system answering **correctly**, from text I verified
verbatim in the retrieved chunks:

| question | labelled | what is actually in the corpus |
|---|---|---|
| q-0086 | absent | Porter Stemmer, truecasing, stop-word removal |
| q-0087 | near-miss | *"EMNLP, pages 1532–1543"*, in reference lists |
| q-0090 | absent | *"Franka Emika Panda… 7-DoF fixed-arm manipulator with a parallel-jaw gripper"* |
| q-0100 | absent | *"only qualified… if they went through several societal… research works"* |

**On the 11 genuinely unanswerable questions, the system refused 11 out of 11.**
The metric was measuring the golden set, not the system.

### Root cause: generic phrasing in a 90-document corpus

Every one of the four was drafted as absent from **one** paper — the notes say
so — and then phrased with no entity anchor: *"the text"*, *"the models"*,
*"the user study"*, *"the benchmark statements"*. Absence was never verified
against the other 89 documents. In a corpus of NLP papers, generic methodology
questions are answered somewhere almost by definition.

The failure rate splits cleanly by subtype, and the split is the diagnosis:

| subtype | defective | rate |
|---|---|---|
| `absent` | 3 of 8 | 37.5% |
| `near-miss` | 1 of 7 | 14% |

`near-miss` holds up better because it is anchored to a specific paper's
specific detail. `absent` questions were the vulnerable design.

One of the four is a different bug worth separating: **q-0090's content is in
the very paper it was drafted against**, verbatim on page 7. That was not
cross-document rescue, just a wrong claim about the source.

### The fix

- **q-0086, q-0100** — anchored to the paper each was drafted against, which
  restores the drafter's original intent and removes the cross-document rescue.
- **q-0090** — reclassified as the factoid it always was, with ground truth read
  from the document rather than taken from model output. Now retrieved at rank 1.
- **q-0087** — removed. Asking for a bibliographic page range is not a
  meaningful retrieval test in either direction.

**After the fix: refusal accuracy is 100% on all 13 unanswerable questions.**

The judge was never at fault. It scored those four 0 because the system answered
where ground truth said refuse — doing exactly what it was told, against ground
truth that was wrong. This is independent of judge calibration.

### The standing check this implies

An unanswerable question is only valid if it is unanswerable from the **whole
corpus**, not from the document it was drafted against. The cheap screen is the
one that caught this: run the unanswerable bucket end-to-end and inspect
anything the system answers with well-grounded citations. A grounded answer to a
question marked unanswerable is a golden-set defect until proven otherwise.

**The holdout has 5 unanswerable questions drafted the same way**, so roughly
1–2 are probably contaminated too. Checking means running the holdout, which
spends it. Left untouched deliberately.

---

## What this golden set cannot detect

Stated up front rather than left for a reader to ask about:

- **95% CI half-width on one arm's mean: ±12.3pp** at n=63.
- **Minimum detectable effect, unpaired:** 24.9pp at 80% power, α=0.05.
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
| keyword → hybrid | **10** | 33 |
| keyword → dense | **0** | 33 |
| searchtop-10 → searchtop-80 | 1 (latency only) | 33 |
| hybrid → dense | 1 (latency only) | 33 |

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
3. **n=63 answerable questions.** Small. See the power section.
4. **Dev split only.** The 15-question holdout is untouched and stays that way
   until a final measurement.
5. **Aggregation recall is ceiling-limited** at 31.4% and is arguably the wrong
   metric for that question type entirely.
6. **Paraphrase evidence is n=11 pairs**, p=0.125. Suggestive, not established.
7. **Latency comparisons are between runs, not between variants.** Cost and
   latency reflect cache state and rate-limiter pacing as executed. Two runs
   retrieving byte-identical chunks showed a 39-second mean latency difference
   purely because one ran cold. Compare these only between runs with matched
   cache state, and prefer p50 over mean — one paced wait dominates a mean of 76.
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
