import { describe, expect, it, vi } from "vitest";

import { costOf, PRICING } from "./pricing";

describe("costOf", () => {
  it("prices input and output separately", () => {
    // Haiku 4.5 is $1 / $5 per MTok — https://platform.claude.com/docs/en/pricing
    const cost = costOf("generate", "claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6.0);
  });

  it("prices embeddings as input-only", () => {
    // voyage-4 is $0.06 / MTok — https://docs.voyageai.com/docs/pricing
    expect(
      costOf("embed", "voyage-4", { inputTokens: 1_000_000, outputTokens: 999 }),
    ).toBeCloseTo(0.06);
  });

  it("prices the two rerank tiers differently", () => {
    const full = costOf("rerank", "rerank-2.5", { inputTokens: 1_000_000, outputTokens: 0 });
    const lite = costOf("rerank", "rerank-2.5-lite", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(full).toBeCloseTo(0.05);
    expect(lite).toBeCloseTo(0.02);
    expect(lite).toBeLessThan(full);
  });

  it("records the free-tier Gemini models as zero", () => {
    expect(
      costOf("generate", "gemini-flash-lite-latest", {
        inputTokens: 5_000_000,
        outputTokens: 5_000_000,
      }),
    ).toBe(0);
  });

  it("warns once for an unpriced model instead of failing silently", () => {
    // A missing price must not look like a free model — that is how a
    // mispriced experiment ships.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };

    expect(costOf("generate", "some-unpriced-model", usage)).toBe(0);
    expect(costOf("generate", "some-unpriced-model", usage)).toBe(0);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("some-unpriced-model");
    warn.mockRestore();
  });

  it("keeps every stage's map non-empty", () => {
    for (const stage of Object.keys(PRICING) as (keyof typeof PRICING)[]) {
      expect(Object.keys(PRICING[stage]).length).toBeGreaterThan(0);
    }
  });
});
