import { describe, expect, it } from "vitest";

import { mapWithConcurrency, selectSubset } from "./runner";
import type { Question } from "./types";

function q(id: string, type: Question["type"]): Question {
  return {
    id,
    question: `q ${id}`,
    type,
    expectedAnswer: type === "unanswerable" ? null : "a",
    relevantChunkIds: type === "unanswerable" ? [] : ["c"],
    relevantDocIds: type === "unanswerable" ? [] : ["d"],
    sourcePages: [],
    difficulty: "medium",
    paraphraseOf: null,
  };
}

describe("selectSubset", () => {
  // 8 factoid, 2 unanswerable — a "first N" subset of 5 would be all factoid.
  const questions = [
    ...Array.from({ length: 8 }, (_, i) => q(`f${i}`, "factoid")),
    ...Array.from({ length: 2 }, (_, i) => q(`u${i}`, "unanswerable")),
  ];

  it("keeps every type represented", () => {
    const picked = selectSubset(questions, 5);
    const types = new Set(picked.map((p) => p.type));
    expect(types.has("factoid")).toBe(true);
    expect(types.has("unanswerable")).toBe(true);
  });

  it("respects the requested size", () => {
    expect(selectSubset(questions, 5)).toHaveLength(5);
  });

  it("keeps at least one of every type even at small n", () => {
    // Regression: trimming by file order used to drop the whole unanswerable
    // bucket from a small subset, so refusal accuracy reported "no data" —
    // the exact failure stratification exists to prevent.
    const picked = selectSubset(questions, 2);
    expect(new Set(picked.map((p) => p.type)).size).toBe(2);
  });

  it("trims the largest bucket, not the last one in the file", () => {
    const picked = selectSubset(questions, 3);
    const counts = picked.reduce<Record<string, number>>((acc, p) => {
      acc[p.type] = (acc[p.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.unanswerable).toBeGreaterThanOrEqual(1);
    expect(counts.factoid).toBeGreaterThanOrEqual(1);
  });

  it("returns everything when n exceeds the set", () => {
    expect(selectSubset(questions, 999)).toHaveLength(questions.length);
  });

  it("is deterministic, so a re-run hits the same cache entries", () => {
    expect(selectSubset(questions, 6).map((p) => p.id)).toEqual(
      selectSubset(questions, 6).map((p) => p.id),
    );
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const out = await mapWithConcurrency([30, 10, 20], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms / 10));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:10", "2:20"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("handles an empty input", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
