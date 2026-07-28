import { describe, expect, it } from "vitest";

import {
  bootstrapCI,
  correlation,
  DEFAULT_SEED,
  holmBonferroni,
  mcNemar,
  minDetectableEffect,
  mulberry32,
  pairedBootstrap,
  zQuantile,
} from "./stats";

/** Deterministic pseudo-data, so a failure is always the code's fault. */
function series<T = number>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(series(20, () => a())).toEqual(series(20, () => b()));
  });

  it("gives different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(series(20, () => a())).not.toEqual(series(20, () => b()));
  });

  it("stays in [0,1)", () => {
    const rand = mulberry32(DEFAULT_SEED);
    for (let i = 0; i < 5000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("bootstrapCI", () => {
  it("brackets the sample mean", () => {
    const values = series(60, (i) => (i % 4) / 3);
    const ci = bootstrapCI(values, 2000);
    expect(ci.mean).toBeCloseTo(0.5, 10);
    expect(ci.lo).toBeLessThan(ci.mean);
    expect(ci.hi).toBeGreaterThan(ci.mean);
  });

  it("is reproducible across calls with the same seed", () => {
    const values = series(40, (i) => (i * 7) % 11);
    expect(bootstrapCI(values, 1000, 0.05, 7)).toEqual(
      bootstrapCI(values, 1000, 0.05, 7),
    );
  });

  it("moves with the seed", () => {
    const values = series(40, (i) => (i * 7) % 11);
    const a = bootstrapCI(values, 1000, 0.05, 1);
    const b = bootstrapCI(values, 1000, 0.05, 2);
    expect(a.mean).toBe(b.mean);
    expect([a.lo, a.hi]).not.toEqual([b.lo, b.hi]);
  });

  it("collapses to a point for constant data", () => {
    const ci = bootstrapCI(series(30, () => 0.7), 500);
    expect(ci.mean).toBeCloseTo(0.7, 10);
    expect(ci.lo).toBeCloseTo(0.7, 10);
    expect(ci.hi).toBeCloseTo(0.7, 10);
  });

  it("reports no spread for a single observation rather than inventing some", () => {
    const ci = bootstrapCI([0.4], 100);
    expect(ci).toEqual({ mean: 0.4, lo: 0.4, hi: 0.4 });
  });

  it("widens as alpha shrinks", () => {
    const values = series(50, (i) => (i % 5) / 4);
    const wide = bootstrapCI(values, 3000, 0.01);
    const narrow = bootstrapCI(values, 3000, 0.2);
    expect(wide.hi - wide.lo).toBeGreaterThan(narrow.hi - narrow.lo);
  });

  it("rejects empty input, bad alpha and bad iters", () => {
    expect(() => bootstrapCI([])).toThrow(/nothing to resample/);
    expect(() => bootstrapCI([1], 100, 0)).toThrow(/alpha/);
    expect(() => bootstrapCI([1], 100, 1)).toThrow(/alpha/);
    expect(() => bootstrapCI([1], 0)).toThrow(/iters/);
  });
});

describe("pairedBootstrap", () => {
  // The two acceptance cases named in docs/EVAL_HARNESS.md Phase 5.
  it("gives meanDiff 0 and a CI straddling zero for identical arrays", () => {
    const values = series(77, (i) => ((i * 13) % 9) / 8);
    const result = pairedBootstrap(values, [...values]);

    expect(result.n).toBe(77);
    expect(result.meanDiff).toBe(0);
    expect(result.lo).toBe(0);
    expect(result.hi).toBe(0);
    expect(result.lo).toBeLessThanOrEqual(0);
    expect(result.hi).toBeGreaterThanOrEqual(0);
    expect(result.discordant).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it("gives a CI excluding zero for a constant offset", () => {
    const base = series(50, (i) => ((i * 13) % 9) / 8);
    const shifted = base.map((v) => v + 0.1);
    const result = pairedBootstrap(shifted, base);

    expect(result.meanDiff).toBeCloseTo(0.1, 10);
    expect(result.lo).toBeGreaterThan(0);
    expect(result.hi).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.discordant).toBe(50);
  });

  it("signs the difference as a-minus-b", () => {
    const base = series(30, (i) => i / 30);
    const worse = base.map((v) => v - 0.05);
    expect(pairedBootstrap(worse, base).meanDiff).toBeCloseTo(-0.05, 10);
    expect(pairedBootstrap(base, worse).meanDiff).toBeCloseTo(0.05, 10);
  });

  it("finds noise around zero inconclusive", () => {
    // Alternating +/-0.02: a real difference of exactly zero, with spread.
    const base = series(60, (i) => 0.5 + (i % 2 === 0 ? 0.02 : -0.02));
    const other = series(60, (i) => 0.5 + (i % 2 === 0 ? -0.02 : 0.02));
    const result = pairedBootstrap(base, other);

    expect(result.lo).toBeLessThan(0);
    expect(result.hi).toBeGreaterThan(0);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it("never reports a p-value of exactly zero", () => {
    const base = series(40, () => 0);
    const shifted = series(40, () => 1);
    const result = pairedBootstrap(shifted, base, 1000);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeCloseTo(2 / 1001, 10);
  });

  it("counts only pairs that actually differ", () => {
    const a = [0, 1, 1, 0, 1];
    const b = [0, 1, 0, 0, 0];
    expect(pairedBootstrap(a, b).discordant).toBe(2);
  });

  it("is reproducible for a seed and varies across seeds", () => {
    const a = series(40, (i) => (i % 7) / 6);
    const b = series(40, (i) => (i % 5) / 4);
    expect(pairedBootstrap(a, b, 1000, { seed: 3 })).toEqual(
      pairedBootstrap(a, b, 1000, { seed: 3 }),
    );
    expect(pairedBootstrap(a, b, 1000, { seed: 3 }).lo).not.toBe(
      pairedBootstrap(a, b, 1000, { seed: 4 }).lo,
    );
  });

  it("throws on length mismatch", () => {
    expect(() => pairedBootstrap([1, 2, 3], [1, 2])).toThrow(/differ in length/);
  });

  it("throws on empty input", () => {
    expect(() => pairedBootstrap([], [])).toThrow(/no paired observations/);
  });

  it("throws when question ids do not align", () => {
    expect(() =>
      pairedBootstrap([1, 2], [1, 2], 100, {
        idsA: ["q1", "q2"],
        idsB: ["q1", "q3"],
      }),
    ).toThrow(/do not align at index 1/);
  });

  it("throws when id arrays do not match the value arrays", () => {
    expect(() =>
      pairedBootstrap([1, 2], [1, 2], 100, { idsA: ["q1"], idsB: ["q1", "q2"] }),
    ).toThrow(/do not match value arrays/);
  });

  it("accepts aligned ids", () => {
    const ids = ["q1", "q2", "q3"];
    expect(() =>
      pairedBootstrap([1, 2, 3], [1, 2, 3], 100, { idsA: ids, idsB: [...ids] }),
    ).not.toThrow();
  });

  it("honours alpha", () => {
    const a = series(50, (i) => (i % 6) / 5);
    const b = series(50, (i) => (i % 4) / 3);
    const wide = pairedBootstrap(a, b, 3000, { alpha: 0.01 });
    const narrow = pairedBootstrap(a, b, 3000, { alpha: 0.2 });
    expect(wide.hi - wide.lo).toBeGreaterThan(narrow.hi - narrow.lo);
  });
});

describe("mcNemar", () => {
  it("returns p=1 when the arms never disagree", () => {
    const a = [true, false, true, true];
    const result = mcNemar(a, [...a]);
    expect(result).toEqual({ b01: 0, b10: 0, n: 0, statistic: 0, pValue: 1 });
  });

  it("counts discordant pairs in the right direction", () => {
    const a = [true, true, false, false, true];
    const b = [true, false, true, false, false];
    const result = mcNemar(a, b);
    expect(result.b01).toBe(2); // a right, b wrong: indices 1 and 4
    expect(result.b10).toBe(1); // b right, a wrong: index 2
    expect(result.n).toBe(3);
  });

  it("matches the exact binomial for a clean 0-vs-5 split", () => {
    // n=5, k=0 → 2 * C(5,0) * 0.5^5 = 2 * 1/32 = 0.0625
    const a = series(5, () => false);
    const b = series(5, () => true);
    expect(mcNemar(a, b).pValue).toBeCloseTo(0.0625, 10);
  });

  it("matches the exact binomial for a 1-vs-9 split", () => {
    // n=10, k=1 → 2 * (C(10,0)+C(10,1)) * 0.5^10 = 2 * 11/1024
    const a = [true, ...series(9, () => false)];
    const b = [false, ...series(9, () => true)];
    expect(mcNemar(a, b).pValue).toBeCloseTo((2 * 11) / 1024, 10);
  });

  it("stays a probability on a large even split", () => {
    const a = series(100, (i) => i < 50);
    const b = series(100, (i) => i >= 50);
    const result = mcNemar(a, b);
    expect(result.n).toBe(100);
    expect(result.pValue).toBeLessThanOrEqual(1);
    expect(result.pValue).toBeGreaterThan(0.9);
  });

  it("reports the continuity-corrected chi-square alongside", () => {
    const a = [true, true, true, false];
    const b = [false, false, false, false];
    // b01=3, b10=0 → (|3-0|-1)^2 / 3 = 4/3
    expect(mcNemar(a, b).statistic).toBeCloseTo(4 / 3, 10);
  });

  it("throws on length mismatch", () => {
    expect(() => mcNemar([true], [true, false])).toThrow(/differ in length/);
  });
});

describe("holmBonferroni", () => {
  it("leaves a single test unchanged", () => {
    const [only] = holmBonferroni([0.04]);
    expect(only.adjusted).toBeCloseTo(0.04, 10);
    expect(only.reject).toBe(true);
  });

  it("matches a worked example", () => {
    // m=5. Scaled: .01*5=.05, .02*4=.08, .03*3=.09, .04*2=.08, .05*1=.05.
    // Running max enforces monotonicity: .05, .08, .09, .09, .09.
    const out = holmBonferroni([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(out.map((r) => Number(r.adjusted.toFixed(4)))).toEqual([
      0.05, 0.08, 0.09, 0.09, 0.09,
    ]);
    expect(out.map((r) => r.reject)).toEqual([true, false, false, false, false]);
  });

  it("returns results in INPUT order, not sorted order", () => {
    const out = holmBonferroni([0.9, 0.001, 0.5]);
    expect(out.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(out[0].pValue).toBe(0.9);
    expect(out[1].pValue).toBe(0.001);
    expect(out[1].reject).toBe(true);
    expect(out[0].reject).toBe(false);
  });

  it("keeps adjusted p-values monotone in rank", () => {
    const out = holmBonferroni([0.001, 0.5, 0.02, 0.9, 0.03]);
    const byRank = [...out].sort((a, b) => a.pValue - b.pValue);
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i].adjusted).toBeGreaterThanOrEqual(byRank[i - 1].adjusted);
    }
  });

  it("blocks a test whose own scaled value would have passed", () => {
    // m=3. Scaled: .001*3=.003 ok, .03*2=.06 FAILS, .04*1=.04 which alone
    // would pass — but an earlier failure blocks it. This is the step-down
    // rule doing work, and it is why the running maximum is load-bearing.
    const out = holmBonferroni([0.001, 0.03, 0.04]);
    expect(out.map((r) => r.reject)).toEqual([true, false, false]);
    expect(out[2].adjusted).toBeCloseTo(0.06, 10);
  });

  it("rejects exactly when the adjusted value clears alpha", () => {
    const out = holmBonferroni([0.001, 0.03, 0.04, 0.9], 0.05);
    for (const r of out) expect(r.reject).toBe(r.adjusted <= 0.05);
  });

  it("rejects nothing when every test is weak", () => {
    expect(holmBonferroni([0.2, 0.4, 0.6]).some((r) => r.reject)).toBe(false);
  });

  it("is uniformly more powerful than plain Bonferroni", () => {
    const ps = [0.004, 0.02, 0.03];
    const holm = holmBonferroni(ps, 0.05);
    const bonferroni = ps.map((p) => Math.min(1, p * ps.length) <= 0.05);
    holm.forEach((r, i) => {
      if (bonferroni[i]) expect(r.reject).toBe(true);
    });
    // And strictly better here: Bonferroni rejects one, Holm rejects all three.
    expect(bonferroni.filter(Boolean).length).toBe(1);
    expect(holm.filter((r) => r.reject).length).toBe(3);
  });

  it("caps adjusted p-values at 1", () => {
    expect(holmBonferroni([0.5, 0.6, 0.7]).every((r) => r.adjusted <= 1)).toBe(true);
  });

  it("handles an empty family", () => {
    expect(holmBonferroni([])).toEqual([]);
  });

  it("rejects an invalid alpha", () => {
    expect(() => holmBonferroni([0.01], 0)).toThrow(/alpha/);
    expect(() => holmBonferroni([0.01], 1)).toThrow(/alpha/);
  });
});

describe("zQuantile", () => {
  it("matches known normal quantiles", () => {
    expect(zQuantile(0.5)).toBeCloseTo(0, 9);
    expect(zQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(zQuantile(0.8)).toBeCloseTo(0.8416212, 5);
    expect(zQuantile(0.999)).toBeCloseTo(3.090232, 4);
    expect(zQuantile(0.001)).toBeCloseTo(-3.090232, 4);
  });

  it("is symmetric about the median", () => {
    expect(zQuantile(0.3)).toBeCloseTo(-zQuantile(0.7), 8);
  });

  it("rejects probabilities outside (0,1)", () => {
    expect(() => zQuantile(0)).toThrow(/must be in/);
    expect(() => zQuantile(1)).toThrow(/must be in/);
  });
});

describe("minDetectableEffect", () => {
  it("reproduces the ±0.10 figure the spec quotes for n=100 at 0.61", () => {
    const mde = minDetectableEffect(100, 0.61);
    expect(mde.ciHalfWidth).toBeCloseTo(0.0956, 3);
  });

  it("states the wider interval this golden set actually has at n=77", () => {
    expect(minDetectableEffect(77, 0.61).ciHalfWidth).toBeCloseTo(0.1089, 3);
  });

  it("shrinks the detectable effect as n grows", () => {
    const small = minDetectableEffect(50, 0.5);
    const large = minDetectableEffect(500, 0.5);
    expect(large.mde).toBeLessThan(small.mde);
    expect(large.ciHalfWidth).toBeLessThan(small.ciHalfWidth);
  });

  it("is hardest to detect at a baseline of 0.5", () => {
    const mid = minDetectableEffect(77, 0.5).mde;
    expect(minDetectableEffect(77, 0.9).mde).toBeLessThan(mid);
    expect(minDetectableEffect(77, 0.1).mde).toBeLessThan(mid);
  });

  it("leaves the paired figure null until a correlation is supplied", () => {
    expect(minDetectableEffect(77, 0.6).mdePaired).toBeNull();
  });

  it("reports a tighter paired effect for correlated arms", () => {
    const mde = minDetectableEffect(77, 0.6, { correlation: 0.75 });
    expect(mde.mdePaired).not.toBeNull();
    expect(mde.mdePaired!).toBeLessThan(mde.mde);
    expect(mde.mdePaired!).toBeCloseTo(mde.mde * Math.sqrt(0.25), 10);
  });

  it("echoes alpha and power, and responds to them", () => {
    const strict = minDetectableEffect(77, 0.6, { alpha: 0.01, power: 0.95 });
    expect(strict.alpha).toBe(0.01);
    expect(strict.power).toBe(0.95);
    expect(strict.mde).toBeGreaterThan(minDetectableEffect(77, 0.6).mde);
  });

  it("rejects impossible inputs", () => {
    expect(() => minDetectableEffect(0, 0.5)).toThrow(/n must be positive/);
    expect(() => minDetectableEffect(10, 1.5)).toThrow(/baselineRate/);
    expect(() => minDetectableEffect(10, 0.5, { correlation: 2 })).toThrow(
      /correlation/,
    );
  });
});

describe("correlation", () => {
  it("is 1 for identical vectors and -1 for mirrored ones", () => {
    const a = series(20, (i) => i);
    expect(correlation(a, [...a])).toBeCloseTo(1, 10);
    expect(correlation(a, a.map((v) => -v))).toBeCloseTo(-1, 10);
  });

  it("is 0 for a constant vector rather than NaN", () => {
    expect(correlation(series(10, (i) => i), series(10, () => 5))).toBe(0);
    expect(correlation(series(10, () => 5), series(10, (i) => i))).toBe(0);
  });

  it("is 0 for empty input", () => {
    expect(correlation([], [])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => correlation([1, 2], [1])).toThrow(/differ in length/);
  });
});
