import { describe, expect, it } from "vitest";

import type { RetrievedChunk } from "../types";
import {
  citationScore,
  cohensKappa,
  correctnessScore,
  extractCitations,
  faithfulnessScore,
  judgeScoresToMetrics,
  type Claim,
} from "./judge";

function chunks(ids: string[]): RetrievedChunk[] {
  return ids.map((chunkId, i) => ({
    chunkId,
    docId: "doc-1",
    page: i + 1,
    text: `text ${chunkId}`,
    score: 1,
    rank: i + 1,
  }));
}

describe("extractCitations", () => {
  it("resolves a marker to the chunk at that 1-based position", () => {
    const [citation] = extractCitations("Leave is 25 days [1].", chunks(["c1", "c2"]));
    expect(citation.marker).toBe(1);
    expect(citation.chunkId).toBe("c1");
  });

  it("strips markers from the sentence it hands the judge", () => {
    const [citation] = extractCitations("Leave is 25 days [1].", chunks(["c1"]));
    expect(citation.sentence).toBe("Leave is 25 days.");
  });

  it("pairs each marker with its OWN sentence", () => {
    const found = extractCitations(
      "Leave is 25 days [1]. Carry-over is capped at five [2].",
      chunks(["c1", "c2"]),
    );
    expect(found).toHaveLength(2);
    expect(found[0].sentence).toContain("25 days");
    expect(found[1].sentence).toContain("Carry-over");
    expect(found[1].chunkId).toBe("c2");
  });

  it("handles several markers on one sentence", () => {
    const found = extractCitations("Both apply [1][3].", chunks(["c1", "c2", "c3"]));
    expect(found.map((c) => c.chunkId)).toEqual(["c1", "c3"]);
  });

  it("marks a dangling citation as unresolvable rather than guessing", () => {
    // The model invented a ninth passage. Catching this needs no LLM call.
    const [citation] = extractCitations("Stated clearly [9].", chunks(["c1", "c2"]));
    expect(citation.marker).toBe(9);
    expect(citation.chunkId).toBeNull();
  });

  it("returns nothing for an answer with no citations", () => {
    expect(extractCitations("This question is not covered.", chunks(["c1"]))).toEqual([]);
  });

  it("returns nothing for an empty answer", () => {
    expect(extractCitations("", chunks(["c1"]))).toEqual([]);
  });
});

describe("faithfulnessScore", () => {
  const claim = (label: Claim["label"]): Claim => ({
    claim: "x",
    label,
    evidenceChunkId: null,
  });

  it("is supported / total", () => {
    expect(faithfulnessScore([claim("supported"), claim("unsupported")])).toBe(0.5);
  });

  it("counts contradicted as not supported", () => {
    expect(faithfulnessScore([claim("supported"), claim("contradicted")])).toBe(0.5);
  });

  it("is 1 when every claim is supported", () => {
    expect(faithfulnessScore([claim("supported"), claim("supported")])).toBe(1);
  });

  it("is 0 when none is", () => {
    expect(faithfulnessScore([claim("unsupported")])).toBe(0);
  });

  /**
   * WAS "vacuously faithful", asserting 1. That put a free point in the
   * faithfulness mean for every question the system refused — and refusals are
   * disproportionately the questions it did worst on, so the metric rose
   * fastest exactly where the system was failing.
   *
   * Null is the convention recallAtK already uses for a question with no
   * relevant chunks: not measurable, so excluded from the mean rather than
   * averaged in. A refusal asserts nothing about the subject, so there is
   * nothing for grounding to be true or false OF.
   */
  it("returns null when the answer made no claims — a refusal is not scored", () => {
    expect(faithfulnessScore([])).toBeNull();
  });
});

describe("correctnessScore", () => {
  it("maps the three verdicts to 1 / 0.5 / 0", () => {
    expect(correctnessScore("correct")).toBe(1);
    expect(correctnessScore("partial")).toBe(0.5);
    expect(correctnessScore("incorrect")).toBe(0);
  });
});

describe("citationScore", () => {
  it("is valid / total", () => {
    expect(
      citationScore([
        { chunkId: "c1", valid: true, reason: "" },
        { chunkId: "c2", valid: false, reason: "" },
      ]),
    ).toBe(0.5);
  });

  it("is 1 when the answer cited nothing — nothing was miscited", () => {
    // Whether it SHOULD have cited is faithfulness's job; double-counting it
    // here would hide which stage actually failed.
    expect(citationScore([])).toBe(1);
  });
});

describe("judgeScoresToMetrics", () => {
  it("flattens successful outcomes to their scores", () => {
    const metrics = judgeScoresToMetrics({
      faithfulness: { ok: true, value: { claims: [], score: 0.75 }, costUsd: 0 },
      correctness: {
        ok: true,
        value: { verdict: "partial", reasoning: "", score: 0.5 },
        costUsd: 0,
      },
      citationAccuracy: { ok: true, value: { citations: [], score: 1 }, costUsd: 0 },
      refusal: null,
      costUsd: 0,
    });
    expect(metrics).toEqual({
      faithfulness: 0.75,
      correctness: 0.5,
      citationAccuracy: 1,
      refusalAccuracy: null,
    });
  });

  it("nulls a failed judge rather than scoring it 0", () => {
    // A judge that errored produced no evidence. Scoring it 0 would be a claim
    // the model never made, and would drag the mean down as if it had failed.
    const metrics = judgeScoresToMetrics({
      faithfulness: { ok: false, error: "after 3 attempts: bad JSON", costUsd: 0 },
      correctness: null,
      citationAccuracy: null,
      refusal: null,
      costUsd: 0,
    });
    expect(metrics.faithfulness).toBeNull();
  });
});

describe("cohensKappa", () => {
  it("is 1 for perfect agreement across two categories", () => {
    const { kappa, rawAgreement } = cohensKappa(["a", "b", "a", "b"], ["a", "b", "a", "b"]);
    expect(kappa).toBe(1);
    expect(rawAgreement).toBe(1);
  });

  it("is 0 when agreement is exactly what chance predicts", () => {
    // Both raters split 50/50 and agree half the time — po = pe = 0.5.
    const { kappa, rawAgreement } = cohensKappa(["a", "a", "b", "b"], ["a", "b", "a", "b"]);
    expect(rawAgreement).toBe(0.5);
    expect(kappa).toBeCloseTo(0);
  });

  it("is negative when agreement is worse than chance", () => {
    expect(cohensKappa(["a", "b"], ["b", "a"]).kappa).toBeLessThan(0);
  });

  it("punishes a constant rater that raw agreement would flatter", () => {
    // The judge says "faithful" every time on a set that is 90% faithful.
    // Raw agreement is a misleading 90%; kappa exposes that it learned nothing.
    const human = [...Array(9).fill("faithful"), "unfaithful"];
    const model = Array(10).fill("faithful");
    const { rawAgreement, kappa } = cohensKappa(human, model);
    expect(rawAgreement).toBeCloseTo(0.9);
    expect(kappa).toBeCloseTo(0);
  });

  it("reports 1 when both raters used a single category and agreed", () => {
    // pe is also 1 here, so the formula is 0/0 — must not be NaN.
    const { kappa } = cohensKappa(["a", "a"], ["a", "a"]);
    expect(kappa).toBe(1);
  });

  it("flags kappa below the 0.6 bar as weak", () => {
    expect(cohensKappa(["a", "a", "b", "b"], ["a", "b", "a", "b"]).weak).toBe(true);
    expect(cohensKappa(["a", "b"], ["a", "b"]).weak).toBe(false);
  });

  it("handles three categories", () => {
    const human = ["correct", "partial", "incorrect", "correct"];
    const model = ["correct", "partial", "incorrect", "correct"];
    expect(cohensKappa(human, model).kappa).toBe(1);
  });

  it("throws when the label arrays differ in length", () => {
    expect(() => cohensKappa(["a"], ["a", "b"])).toThrow(/differ in length/);
  });

  it("returns a weak zero for an empty set rather than NaN", () => {
    const { n, kappa, weak } = cohensKappa([], []);
    expect(n).toBe(0);
    expect(kappa).toBe(0);
    expect(weak).toBe(true);
  });
});
