# I measured my RAG pipeline. The measurement was the hard part.

**Phase 10 of [`EVAL_HARNESS.md`](EVAL_HARNESS.md).** Every number here is
reproducible from this repository; the command that regenerates each one is
given beside it. Total API spend across the whole project: **$0.00.**

---

## 1. The problem

A RAG demo looks fine on three hand-picked questions. Mine did. That tells you
nothing about the other ninety-seven, and it gives you no way to answer the only
question that matters when you change something: *is it better now, or does it
just feel better?* So I built an evaluation harness — a golden set, retrieval
metrics, an LLM judge, paired statistics, a regression gate, and a dashboard —
and pointed it at my own system. What follows is what it found, including the
several times it found that the measurement itself was wrong.

---

## 2. The golden set

**91 human-reviewed questions** over a corpus of **90 arXiv NLP papers, 2,134
chunks**. Split 76 dev / 15 holdout, seeded and reproducible
(`npm run eval:split`).

| Type | n | share | why |
|---|---|---|---|
| factoid | 37 | 48.7% | the corpus supplies these without limit |
| paraphrase | 11 | 14.5% | the same question, reworded — tests robustness, not knowledge |
| unanswerable | 13 | 17.1% | **the highest-signal bucket in the set** |
| aggregation | 8 | 10.5% | built deterministically from the entity index, not generated |
| multi-hop | 7 | 9.2% | see the deviation below |

`npm run eval:validate`

**Unanswerable questions are the point.** A system that answers everything looks
excellent on a set where everything is answerable. These 13 questions have no
answer in the corpus, and the correct behaviour is to decline. Without them you
cannot distinguish a good retriever from a confident fabricator.

**The review was manual and the numbers are unflattering.** 126 candidates were
reviewed one at a time against their source chunk; **35 were dropped (28%)** and
**3 were rewritten**. The build guide predicted I would rewrite a meaningful
fraction to avoid trivially lexical questions. I mostly did not — I dropped them
instead. That is a weaker form of curation than the guide intended, and it is
what happened.

> **Deviation: multi-hop is intra-document only, and 8% rather than 20%.**
> Cross-document multi-hop yielded **2 usable questions from 33 attempts, and 0
> of 33 after review**. Ninety topically unrelated papers do not contain
> cross-document joint facts in any quantity — two papers that both mention BERT
> share a topic, not a fact. No ranking function repairs that. The bucket is
> reported with its count attached and supports no per-type conclusion at n=7.

---

## 3. How the judge was validated — and why only one of four survived

This is the section I would read first in someone else's writeup, so it goes
before the results.

Four LLM judges score each answer: faithfulness, correctness, citation accuracy,
refusal. I labelled **68 results by hand** across two runs and two sampling
designs, then measured agreement. Reported separately, because a stratified
sample deliberately over-represents flagged failures and pooling the two
describes a population that never existed.

**Random sample** (`npm run eval:calibrate -- --report-only --design random`):

| judge | n | agreement | kappa | |
|---|---|---|---|---|
| correctness | 20 | 90% | **0.80** | validated |
| faithfulness | 7 | 100% | 1.00 | no negatives — unanimity, not evidence |
| citations | 19 | 95% | 0.00 | no negatives |
| refusal | 5 | 100% | 1.00 | no negatives |

**Stratified sample**, drawn to include failures
(`--report-only --design stratified`):

| judge | n | agreement | kappa | |
|---|---|---|---|---|
| correctness | 35 | 94% | **0.89** | validated |
| faithfulness | 17 | 88% | 0.00 | judge called 17 of 17 faithful |
| citations | 27 | 67% | −0.03 | disagreements run both ways — noise |
| refusal | 7 | 100% | 1.00 | no negatives |

**Only `correctness` is a validated judge.** Kappa 0.80 on a random sample and
0.89 on a stratified one, with both raters using the full range of verdicts.
Consistency across two sampling designs is what makes it quotable.

**The other three are agreement without evidence, and that is not the same
thing.** Kappa corrects for chance agreement, and chance agreement rises with
skew — when one rater says "faithful" to everything, agreeing 88% of the time is
no better than agreeing at random. `citations` is worse still: it has real
negatives and still lands at chance, and it *fails to return parseable JSON on
6 of 76 questions*, which are excluded from its aggregate rather than counted as
failures.

### Three things calibration caught, none of which were the judges

**The reviewer was shown a quarter of the evidence.** The labelling UI truncated
each passage to 600 characters; questions retrieve eight passages averaging
~2,000. Six answers were marked unfaithful whose every claim was in the
passages — one buried mid-paragraph on page 26, another split across a line
break as `"Ja- son Reifler"`. The tool now prints passages in full and offers
`/text` search during labelling.

**A "systematic 7:0 bias against the faithfulness judge" was five stale
verdicts.** Five of the seven disagreements were refusals — answers reading
*"This question is not covered by these documents"* — scored by a rubric that
had no answer for them. The judge had already stopped scoring those; the labels
file was still quoting its old opinion. Refreshing the verdicts took the
disagreement from 7:0 (p=0.016) to 92% agreement.

**A refusal is not a faithfulness judgement**, and treating it as one put a free
point into the mean for every question the system declined — which are
disproportionately the questions it did worst on. `faithfulnessScore` now
returns `null` for an answer with no claims, the same convention `recallAtK`
uses for a question with no relevant chunks.

**The tooling was wrong three times, in the direction of false confidence.** It
printed "✓ Every judge is at or above kappa 0.6" underneath three red warnings;
it called a 6-versus-4 split (p=0.75) a systematic defect; and it blamed the
model whenever disagreement ran one way, which sent me to tune a judge that was
right. All three are fixed. I mention them because a validation tool that only
ever says what you hoped is not a validation tool.

---

## 4. Baseline

Full pipeline, 76 dev questions, **0 errors, $0** (`npm run eval:run -- --variant baseline`):

| metric | @1 | @5 | @10 |
|---|---|---|---|
| recall | 20.9% | 48.6% | 52.8% |
| hit rate | — | — | 61.9% |
| nDCG | — | — | 42.9% |
| doc recall | — | — | 69.0% |

MRR 43.4%. Median latency 1,190 ms.

| judged | value | trust |
|---|---|---|
| correctness | 52.4% | validated judge (kappa 0.86 pooled) |
| faithfulness | 100.0% | pinned — see below |
| citation accuracy | 92.8% | unvalidated, 6 judge failures excluded |
| refusal accuracy | 100.0% | 13 of 13, no failures to learn from |

**At n=63 answerable questions the 95% interval on a single arm's recall is
±12.3pp.** Two arms differing by less than about 25 points are indistinguishable
unpaired. That is the single most important number in this document, and it is
why every comparison below is paired.

---

## 5. What the experiments found

Eleven arms, 760 question-runs, $0 — full detail in
[`EVAL_RESULTS.md`](EVAL_RESULTS.md), regenerable table in
[`SWEEP.md`](SWEEP.md).

| experiment | Δ recall@20 vs hybrid | verdict |
|---|---|---|
| **top-k 3 → 20** | +11.2pp [+4.6, +19.3] | the only knob that moved anything |
| dense vs hybrid | −0.3pp [−8.4, +7.7] | **nothing**, on any of 31 quality metrics |
| keyword-only | −10.5pp [−20.3, −1.4] | significantly worse — which explains the null above |
| searchTop 10 → 80 | −1.1pp [−9.2, +6.9] | **nothing**, and non-monotonic, at 8× the depth |

**Three of four did nothing.** Dense and hybrid retrieval changed 76 of 76
result sets and moved no metric — the reordering is real and irrelevant.
Widening the candidate pool eightfold bought nothing but latency.

**The finding worth more than all four:** the per-question-type breakdown showed
**4 of 6 questions retrieval got right were lost when the question was
reworded**. The constraint is not the size of the candidate pool or how it is
fused. It is whether the query's wording happens to match the chunk.

**And the finding that was nearly a disaster:** the first judged run reported
refusal accuracy of 50%. Auditing it showed 4 of 15 "unanswerable" questions
were answerable from the corpus — each drafted as absent from *one* paper and
phrased with no entity anchor, so other documents answered them. The system was
right and the golden set was wrong. True refusal accuracy: **100%**.

---

## 6. What shipped

**Nothing.** The production config is unchanged: hybrid retrieval, topK 8,
searchTop 20, RRF k=60.

That is the honest outcome and I am not going to dress it up. `topk-20` is the
one arm with a real recall gain, and I did not ship it because I cannot yet show
it improves *answers*: there is no judged run at topK 20, and correctness is the
only judge I trust. Recall@10 (52.8%) and correctness (52.4%) track each other
almost exactly — the system answers when retrieval finds the chunk and declines
when it does not, and **24 of 63 answerable questions get a refusal**. Shipping
a wider top-k on the strength of a retrieval metric alone would be exactly the
mistake this harness exists to prevent.

What shipped instead is the ability to tell: a regression gate
(`--gate`) that fails a build only when a drop clears its threshold *and* the
paired 95% CI excludes zero, wired into CI on a 30-question smoke subset, and a
dashboard that goes from "faithfulness dropped" to the exact chunk in two
clicks.

---

## 7. Limitations, stated plainly

- **n=63 answerable questions cannot detect effects under ~10–14 points**
  paired, ~25 unpaired. Every "no effect" here means "not detectable at this
  sample size", never "no difference".
- **Three of four judges are unvalidated.** Faithfulness at 100.0% across all 39
  non-refusal answers has no variance and therefore no ability to detect a
  regression — a green faithfulness gate is not evidence. Citations fails to
  parse on 8% of questions and agrees with me at chance.
- **The golden set is model-generated then human-reviewed**, which biases it
  toward questions that are answerable by construction. I dropped 28% and
  rewrote 3.
- **The judge shares a provider with the generator** (both Gemini), which is the
  self-preference bias the design tried to avoid and did not.
- **The multi-hop bucket is n=7 and intra-document only.** It supports no
  conclusion.
- **The holdout has never been touched** — 15 questions, held for a final
  measurement. It also contains 5 unanswerable questions drafted the same way as
  the 4 that turned out contaminated in dev, so **1–2 of them are probably
  answerable too**. Measuring it before fixing that would bake the flaw into the
  one number meant to be clean.
- **Latency and cost comparisons describe the runs as executed**, cache state
  included. Two runs retrieving byte-identical chunks once differed by 39
  seconds because one ran cold.
- **One run's recall differed from another's by 1.6pp on identical settings**,
  because hybrid retrieval lost one of its two sources on a single question. The
  harness records that as `degraded` and the comparison tool surfaces it — which
  is the only reason I know rather than guess.

---

## Reproducing any of it

```bash
npm run eval:validate                          # golden set composition
npm run eval:run     -- --variant baseline     # the baseline table
npm run eval:compare -- <runA> <runB> --local  # any paired comparison
npm run eval:calibrate -- --report-only        # the kappa tables
npm run eval:sweep   -- <variants...> --reuse  # the experiment table
```

Runs are cached by content hash, so re-running an arm that has already executed
costs nothing.
