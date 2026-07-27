/**
 * Statistics for comparing runs. PURE FUNCTIONS ONLY — no I/O, no network.
 *
 * WHY THIS FILE EXISTS, from docs/EVAL_HARNESS.md Phase 5: at n=77 a recall@10
 * of 0.61 carries a 95% interval of roughly ±0.11. Two variants three points
 * apart are indistinguishable, and reporting a single mean per variant and
 * declaring a winner is the fastest way to produce confident nonsense. Every
 * number this harness reports about a DIFFERENCE has to come with an interval.
 *
 * PAIRED, NOT INDEPENDENT. Both variants answer the same questions, so the unit
 * of analysis is the per-question difference, not the two means. Question
 * difficulty is the dominant source of variance in a golden set this small —
 * some questions are simply harder than others, and both arms feel that
 * identically. Differencing cancels it. The interval on the paired difference
 * is dramatically tighter than the interval on either mean, which is why a
 * comparison can be conclusive even when neither arm's own CI is.
 *
 * SEEDED. Every resampling function takes a seed (default 42) and uses
 * mulberry32, so a p-value is reproducible. An unseeded bootstrap gives a
 * slightly different answer each run, which is a terrible property for a number
 * that decides whether you ship a change.
 */

/** Default PRNG seed. The Phase 5 CLI exposes this as `--seed`. */
export const DEFAULT_SEED = 42;

/**
 * mulberry32 — small, fast, seeded PRNG with good distribution for resampling.
 *
 * Not cryptographic and not trying to be. What matters here is that the same
 * seed yields the same sequence on every machine, which `Math.random()` cannot
 * promise.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Nearest-rank quantile of an ALREADY-SORTED array.
 *
 * Same rule as `percentile` in eval/src/aggregate.ts, deliberately — two
 * different quantile conventions in one harness is a reconciliation problem
 * nobody wants at the point where a number is being questioned.
 */
function sortedQuantile(sorted: number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export interface CI {
  mean: number;
  lo: number;
  hi: number;
}

/**
 * Percentile bootstrap confidence interval for the mean of `values`.
 *
 * Resample n values with replacement, take the mean, repeat `iters` times, and
 * read the alpha/2 and 1-alpha/2 quantiles off the resulting distribution. No
 * normality assumption, which matters because most metrics here are bounded in
 * [0,1] and pile up at the ends — recall@20 is frequently exactly 1.0, and a
 * normal-theory interval would happily report an upper bound above 1.
 *
 * n=1 degenerates to lo = hi = the single value. That is the honest answer: one
 * observation carries no information about spread, and the alternative is to
 * invent some.
 */
export function bootstrapCI(
  values: number[],
  iters = 10000,
  alpha = 0.05,
  seed = DEFAULT_SEED,
): CI {
  if (values.length === 0) {
    throw new Error("bootstrapCI: no values — nothing to resample");
  }
  if (!(alpha > 0 && alpha < 1)) {
    throw new Error(`bootstrapCI: alpha must be in (0,1), got ${alpha}`);
  }
  if (iters < 1) throw new Error(`bootstrapCI: iters must be >= 1, got ${iters}`);

  const rand = mulberry32(seed);
  const n = values.length;
  const means = new Array<number>(iters);

  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[(rand() * n) | 0];
    means[i] = sum / n;
  }

  means.sort((x, y) => x - y);
  return {
    mean: mean(values),
    lo: sortedQuantile(means, alpha / 2),
    hi: sortedQuantile(means, 1 - alpha / 2),
  };
}

export interface PairedResult {
  /** Number of paired observations. */
  n: number;
  /** Mean of a[i] - b[i]. */
  meanDiff: number;
  lo: number;
  hi: number;
  /** Two-sided, from the proportion of bootstrap means on the far side of 0. */
  pValue: number;
  /** How many pairs differ at all. A comparison of ties is not evidence. */
  discordant: number;
}

export interface PairedOptions {
  seed?: number;
  alpha?: number;
  /**
   * Question ids for each vector. Supplying both makes the alignment contract
   * checkable instead of assumed — see the throw in `pairedBootstrap`.
   */
  idsA?: string[];
  idsB?: string[];
}

/**
 * Paired percentile bootstrap on `a[i] - b[i]`.
 *
 * THE CALLER MUST JOIN ON QUESTION ID FIRST. Position i in both arrays has to
 * be the same question, or the differences are meaningless — and meaningless in
 * a way that produces a normal-looking table rather than an error. Pass `idsA`
 * and `idsB` and this function will verify it; the check is cheap and the
 * failure it prevents is silent. Length mismatch always throws.
 *
 * DIRECTION: `meanDiff` is mean(a - b). Callers that want a delta reading as
 * "after minus before" pass the after-vector first.
 *
 * P-VALUE: the proportion of bootstrap means at or beyond zero, doubled for a
 * two-sided test. Computed as (count + 1) / (iters + 1) rather than
 * count / iters, so the smallest reportable value is bounded by the resampling
 * resolution instead of collapsing to exactly 0 — 10,000 resamples cannot
 * evidence p = 0, and printing it would claim more than was measured.
 */
export function pairedBootstrap(
  a: number[],
  b: number[],
  iters = 10000,
  opts: PairedOptions = {},
): PairedResult {
  const { seed = DEFAULT_SEED, alpha = 0.05, idsA, idsB } = opts;

  if (a.length !== b.length) {
    throw new Error(
      `pairedBootstrap: arrays differ in length (${a.length} vs ${b.length}). ` +
        `Join on question id before calling.`,
    );
  }
  if (a.length === 0) {
    throw new Error("pairedBootstrap: no paired observations — nothing to compare");
  }
  if (idsA && idsB) {
    if (idsA.length !== a.length || idsB.length !== b.length) {
      throw new Error(
        `pairedBootstrap: id arrays do not match value arrays ` +
          `(${idsA.length}/${a.length}, ${idsB.length}/${b.length}).`,
      );
    }
    for (let i = 0; i < idsA.length; i++) {
      if (idsA[i] !== idsB[i]) {
        throw new Error(
          `pairedBootstrap: question ids do not align at index ${i} ` +
            `("${idsA[i]}" vs "${idsB[i]}"). The caller must pass values joined ` +
            `on question id, in the same order.`,
        );
      }
    }
  }

  const n = a.length;
  const diffs = new Array<number>(n);
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    diffs[i] = a[i] - b[i];
    if (diffs[i] !== 0) discordant++;
  }

  const rand = mulberry32(seed);
  const means = new Array<number>(iters);
  let atOrBelowZero = 0;
  let atOrAboveZero = 0;

  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += diffs[(rand() * n) | 0];
    const m = sum / n;
    means[i] = m;
    if (m <= 0) atOrBelowZero++;
    if (m >= 0) atOrAboveZero++;
  }

  means.sort((x, y) => x - y);

  const pLow = (atOrBelowZero + 1) / (iters + 1);
  const pHigh = (atOrAboveZero + 1) / (iters + 1);
  const pValue = Math.min(1, 2 * Math.min(pLow, pHigh));

  return {
    n,
    meanDiff: mean(diffs),
    lo: sortedQuantile(means, alpha / 2),
    hi: sortedQuantile(means, 1 - alpha / 2),
    pValue,
    discordant,
  };
}

export interface McNemarResult {
  /** Pairs where A is correct and B is not. */
  b01: number;
  /** Pairs where B is correct and A is not. */
  b10: number;
  /** Discordant pairs, b01 + b10. The only pairs carrying information. */
  n: number;
  /** Chi-square with Yates' continuity correction. Reported for familiarity. */
  statistic: number;
  /** Two-sided EXACT binomial p-value — see below. */
  pValue: number;
}

/**
 * McNemar's test for paired binary outcomes — hit@k, refusal correctness.
 *
 * Concordant pairs (both right, both wrong) carry no information about which
 * variant is better and drop out entirely. Only the disagreements count, and
 * under the null they split 50/50, so this is a binomial sign test on b01 vs
 * b10. That is also why a comparison can be significant on 12 discordant pairs
 * out of 77: the 65 ties were never evidence either way.
 *
 * EXACT, not chi-square. The asymptotic version needs roughly b01 + b10 >= 25
 * to be trustworthy, and discordant counts here are routinely under 10, where
 * it reports p-values that are too small. The exact binomial tail has no such
 * floor. `statistic` still carries the continuity-corrected chi-square because
 * readers expect to see it, but `pValue` is the exact one.
 */
export function mcNemar(aCorrect: boolean[], bCorrect: boolean[]): McNemarResult {
  if (aCorrect.length !== bCorrect.length) {
    throw new Error(
      `mcNemar: arrays differ in length (${aCorrect.length} vs ${bCorrect.length}). ` +
        `Join on question id before calling.`,
    );
  }

  let b01 = 0;
  let b10 = 0;
  for (let i = 0; i < aCorrect.length; i++) {
    if (aCorrect[i] && !bCorrect[i]) b01++;
    else if (!aCorrect[i] && bCorrect[i]) b10++;
  }

  const n = b01 + b10;
  // No disagreement at all: the variants are indistinguishable on this metric,
  // and p=1 states that. Dividing by n would produce NaN and read as an error.
  if (n === 0) return { b01, b10, n, statistic: 0, pValue: 1 };

  const statistic = (Math.abs(b01 - b10) - 1) ** 2 / n;

  // Two-sided exact: 2 * P(X <= min(b01,b10)) under Binomial(n, 0.5), capped.
  const k = Math.min(b01, b10);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);

  return { b01, b10, n, statistic, pValue: Math.min(1, 2 * tail) };
}

/** log C(n, k), via log-gamma so n=100 does not overflow a double. */
function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Lanczos approximation, g=7, n=9. Accurate to ~15 significant figures.
 *
 * DOMAIN: x >= 1 only. The single caller is `logChoose`, which passes n+1, k+1
 * and n-k+1 for integer 0 <= k <= n, so x is always an integer >= 1. The usual
 * reflection formula for x < 0.5 is deliberately absent rather than carried as
 * a branch no call site can reach and no test can honestly cover.
 */
function logGamma(x: number): number {
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const z = x - 1;
  let a = g[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation).
 *
 * Relative error below 1.15e-9 across the whole range — far beyond what a
 * power calculation needs, and it avoids hard-coding z for 0.05/0.80 so the
 * alpha and power arguments actually do something.
 */
export function zQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`zQuantile: p must be in (0,1), got ${p}`);

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

export interface MdeOptions {
  alpha?: number;
  power?: number;
  /**
   * Correlation between the two arms' per-question scores. Unknown before you
   * have a paired run; measurable from one. Supply it and `mdePaired` is
   * populated with the figure that actually applies to this harness.
   */
  correlation?: number;
}

export interface Mde {
  n: number;
  baselineRate: number;
  alpha: number;
  power: number;
  /** Half-width of the 95% CI on ONE arm's mean. The "±0.10" figure. */
  ciHalfWidth: number;
  /** Smallest detectable difference, two INDEPENDENT groups. Conservative. */
  mde: number;
  /** Same, for a paired design at the given correlation. Null without one. */
  mdePaired: number | null;
}

/**
 * What size of improvement can this golden set actually detect?
 *
 * Worth stating in the writeup before any result, because it reframes every
 * null finding in the report. "Reranking bought 1.5 points" is not a
 * disappointing result when the set cannot resolve anything below 11 — it is an
 * uninformative one, and the distinction is the difference between "this
 * doesn't work" and "I couldn't tell".
 *
 * `mde` uses the two-independent-proportions formula, which is the conservative
 * bound. Real comparisons here are paired and therefore tighter — by a factor
 * of sqrt(1 - rho), and rho between two arms of the same pipeline on the same
 * questions is typically high. Pass `correlation` to get that number too.
 */
export function minDetectableEffect(
  n: number,
  baselineRate: number,
  opts: MdeOptions = {},
): Mde {
  const { alpha = 0.05, power = 0.8, correlation } = opts;

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`minDetectableEffect: n must be positive, got ${n}`);
  }
  if (!(baselineRate >= 0 && baselineRate <= 1)) {
    throw new Error(
      `minDetectableEffect: baselineRate must be in [0,1], got ${baselineRate}`,
    );
  }
  if (correlation !== undefined && !(correlation >= -1 && correlation <= 1)) {
    throw new Error(
      `minDetectableEffect: correlation must be in [-1,1], got ${correlation}`,
    );
  }

  const zAlpha = zQuantile(1 - alpha / 2);
  const zBeta = zQuantile(power);
  const variance = baselineRate * (1 - baselineRate);

  return {
    n,
    baselineRate,
    alpha,
    power,
    ciHalfWidth: zAlpha * Math.sqrt(variance / n),
    mde: (zAlpha + zBeta) * Math.sqrt((2 * variance) / n),
    mdePaired:
      correlation === undefined
        ? null
        : (zAlpha + zBeta) * Math.sqrt((2 * variance * (1 - correlation)) / n),
  };
}

/**
 * Pearson correlation between two paired vectors, for feeding `minDetectableEffect`.
 *
 * Returns 0 when either vector is constant — undefined in the usual formula,
 * and 0 is the conservative substitution here since it makes the paired MDE
 * collapse to the unpaired one rather than overstating precision.
 */
export function correlation(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `correlation: arrays differ in length (${a.length} vs ${b.length})`,
    );
  }
  if (a.length === 0) return 0;

  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}
