import { describe, expect, it } from "vitest";

import type { Question, RetrievedChunk } from "../types";
import {
  docLevelRecallAtK,
  hitRateAtK,
  meanIgnoringNull,
  mrr,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  scoreRetrieval,
} from "./retrieval";

/** Build a ranked result list from chunk ids, all from `docId` unless mapped. */
function results(ids: string[], docFor: Record<string, string> = {}): RetrievedChunk[] {
  return ids.map((chunkId, i) => ({
    chunkId,
    docId: docFor[chunkId] ?? "doc-1",
    page: 1,
    text: `text for ${chunkId}`,
    score: 1 - i * 0.01,
    rank: i + 1,
  }));
}

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-0001",
    question: "test?",
    type: "factoid",
    expectedAnswer: "yes",
    relevantChunkIds: ["c1"],
    relevantDocIds: ["doc-1"],
    sourcePages: [1],
    difficulty: "easy",
    paraphraseOf: null,
    ...overrides,
  };
}

describe("recallAtK", () => {
  it("returns null — not 0 — for an empty relevant set", () => {
    // The whole point: unanswerable questions must be excluded from averages,
    // not scored zero, or they drag every retrieval number down.
    expect(recallAtK(results(["c1", "c2"]), [], 10)).toBeNull();
  });

  it("is 0 when no relevant chunk is retrieved", () => {
    expect(recallAtK(results(["x1", "x2", "x3"]), ["c1"], 10)).toBe(0);
  });

  it("is 1 when every relevant chunk is retrieved", () => {
    expect(recallAtK(results(["c1", "c2", "x1"]), ["c1", "c2"], 10)).toBe(1);
  });

  it("is fractional when only some relevant chunks are retrieved", () => {
    expect(recallAtK(results(["c1", "x1"]), ["c1", "c2"], 10)).toBe(0.5);
  });

  it("counts a relevant chunk at exactly position k", () => {
    // c1 is 3rd — inside k=3, outside k=2. Off-by-one here would silently
    // shift every reported cutoff.
    expect(recallAtK(results(["x1", "x2", "c1"]), ["c1"], 3)).toBe(1);
    expect(recallAtK(results(["x1", "x2", "c1"]), ["c1"], 2)).toBe(0);
  });

  it("handles k larger than the retrieved list", () => {
    expect(recallAtK(results(["c1"]), ["c1"], 20)).toBe(1);
  });

  it("handles an empty retrieved list", () => {
    expect(recallAtK([], ["c1"], 10)).toBe(0);
  });

  it("does not double-count a duplicated relevant chunk", () => {
    expect(recallAtK(results(["c1", "c1"]), ["c1", "c2"], 10)).toBe(0.5);
  });
});

describe("precisionAtK", () => {
  it("returns null for an empty relevant set", () => {
    expect(precisionAtK(results(["c1"]), [], 10)).toBeNull();
  });

  it("is the relevant fraction of the returned window", () => {
    expect(precisionAtK(results(["c1", "x1", "x2", "x3"]), ["c1"], 4)).toBe(0.25);
  });

  it("divides by the window actually returned, not by k", () => {
    // 1 relevant of 2 returned = 0.5. Dividing by k would give 0.05 and make a
    // low-topK variant look imprecise purely for returning fewer results.
    expect(precisionAtK(results(["c1", "x1"]), ["c1"], 20)).toBe(0.5);
  });

  it("is 0 for an empty retrieved list", () => {
    expect(precisionAtK([], ["c1"], 10)).toBe(0);
  });

  it("is 1 when everything returned is relevant", () => {
    expect(precisionAtK(results(["c1", "c2"]), ["c1", "c2"], 10)).toBe(1);
  });
});

describe("mrr", () => {
  it("returns null for an empty relevant set", () => {
    expect(mrr(results(["c1"]), [])).toBeNull();
  });

  it("is 0 when ground truth exists but nothing relevant is retrieved", () => {
    // Distinct from null: this is a genuine miss and must count in the average.
    expect(mrr(results(["x1", "x2"]), ["c1"])).toBe(0);
  });

  it("is 1 when the first result is relevant", () => {
    expect(mrr(results(["c1", "x1"]), ["c1"])).toBe(1);
  });

  it("is the reciprocal of the first relevant rank", () => {
    expect(mrr(results(["x1", "x2", "c1"]), ["c1"])).toBeCloseTo(1 / 3);
  });

  it("uses the FIRST relevant chunk when several are present", () => {
    expect(mrr(results(["x1", "c2", "c1"]), ["c1", "c2"])).toBe(0.5);
  });

  it("truncates when k is given", () => {
    expect(mrr(results(["x1", "x2", "c1"]), ["c1"], 2)).toBe(0);
    expect(mrr(results(["x1", "x2", "c1"]), ["c1"], 3)).toBeCloseTo(1 / 3);
  });
});

describe("ndcgAtK", () => {
  it("returns null for an empty relevant set", () => {
    expect(ndcgAtK(results(["c1"]), [], 10)).toBeNull();
  });

  it("is exactly 1.0 when all relevant chunks occupy the top positions", () => {
    expect(ndcgAtK(results(["c1", "c2", "x1", "x2"]), ["c1", "c2"], 10)).toBe(1);
  });

  it("is exactly 1.0 for a single relevant chunk ranked first", () => {
    expect(ndcgAtK(results(["c1", "x1"]), ["c1"], 10)).toBe(1);
  });

  it("is 0 when nothing relevant is retrieved", () => {
    expect(ndcgAtK(results(["x1", "x2"]), ["c1"], 10)).toBe(0);
  });

  it("penalises a relevant chunk ranked lower", () => {
    // rank 2 => DCG = 1/log2(3); IDCG = 1/log2(2) = 1.
    expect(ndcgAtK(results(["x1", "c1"]), ["c1"], 10)).toBeCloseTo(1 / Math.log2(3));
  });

  it("rewards better ordering of the same retrieved set", () => {
    const better = ndcgAtK(results(["c1", "x1", "c2"]), ["c1", "c2"], 10)!;
    const worse = ndcgAtK(results(["x1", "c1", "c2"]), ["c1", "c2"], 10)!;
    expect(better).toBeGreaterThan(worse);
  });

  it("caps the ideal ranking at k", () => {
    // Two relevant chunks but k=1: the best achievable is one hit, so a
    // top-ranked hit still scores 1.0 rather than being penalised for a chunk
    // that could not fit in the window.
    expect(ndcgAtK(results(["c1", "c2"]), ["c1", "c2"], 1)).toBe(1);
  });

  it("is 0 when k is 0", () => {
    expect(ndcgAtK(results(["c1"]), ["c1"], 0)).toBe(0);
  });
});

describe("hitRateAtK", () => {
  it("returns null for an empty relevant set", () => {
    expect(hitRateAtK(results(["c1"]), [], 10)).toBeNull();
  });

  it("is 1 when any relevant chunk is in the top k", () => {
    expect(hitRateAtK(results(["x1", "c1"]), ["c1", "c2"], 10)).toBe(1);
  });

  it("is 0 when none is", () => {
    expect(hitRateAtK(results(["x1", "x2"]), ["c1"], 10)).toBe(0);
  });

  it("respects the cutoff at exactly position k", () => {
    expect(hitRateAtK(results(["x1", "x2", "c1"]), ["c1"], 3)).toBe(1);
    expect(hitRateAtK(results(["x1", "x2", "c1"]), ["c1"], 2)).toBe(0);
  });
});

describe("docLevelRecallAtK", () => {
  it("returns null for an empty relevant doc set", () => {
    expect(docLevelRecallAtK(results(["c1"]), [], 10)).toBeNull();
  });

  it("credits the right document even when the chunk is wrong", () => {
    // This is the reason the metric exists: chunk recall is 0 here, but the
    // retriever DID find the correct document — a chunking problem, not a
    // retrieval one.
    const retrieved = results(["x9"], { x9: "doc-1" });
    expect(recallAtK(retrieved, ["c1"], 10)).toBe(0);
    expect(docLevelRecallAtK(retrieved, ["doc-1"], 10)).toBe(1);
  });

  it("is 0 when only wrong documents are retrieved", () => {
    expect(docLevelRecallAtK(results(["x1"], { x1: "doc-9" }), ["doc-1"], 10)).toBe(0);
  });

  it("is fractional across multiple relevant documents", () => {
    const retrieved = results(["a1", "b1"], { a1: "doc-1", b1: "doc-9" });
    expect(docLevelRecallAtK(retrieved, ["doc-1", "doc-2"], 10)).toBe(0.5);
  });

  it("does not double-count two chunks from the same document", () => {
    const retrieved = results(["a1", "a2"], { a1: "doc-1", a2: "doc-1" });
    expect(docLevelRecallAtK(retrieved, ["doc-1", "doc-2"], 10)).toBe(0.5);
  });
});

describe("scoreRetrieval", () => {
  it("emits every metric at every cutoff with flat keys", () => {
    const scores = scoreRetrieval(results(["c1"]), question());
    for (const k of [1, 3, 5, 10, 20]) {
      for (const metric of ["recall", "precision", "ndcg", "hitRate", "docRecall", "mrr"]) {
        expect(scores).toHaveProperty(`${metric}@${k}`);
      }
    }
    expect(scores).toHaveProperty("mrr");
    expect(scores["recall@10"]).toBe(1);
  });

  it("returns null for every metric on an unanswerable question", () => {
    const unanswerable = question({
      type: "unanswerable",
      expectedAnswer: null,
      relevantChunkIds: [],
      relevantDocIds: [],
    });
    const scores = scoreRetrieval(results(["x1", "x2"]), unanswerable);
    for (const value of Object.values(scores)) expect(value).toBeNull();
  });

  it("separates chunk-level from doc-level recall on a near miss", () => {
    const scores = scoreRetrieval(results(["x9"], { x9: "doc-1" }), question());
    expect(scores["recall@10"]).toBe(0);
    expect(scores["docRecall@10"]).toBe(1);
  });
});

describe("meanIgnoringNull", () => {
  it("averages only the present values", () => {
    expect(meanIgnoringNull([1, null, 0])).toBe(0.5);
  });

  it("returns null when every value is null", () => {
    expect(meanIgnoringNull([null, null])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(meanIgnoringNull([])).toBeNull();
  });

  it("ignores nulls rather than treating them as zero", () => {
    // [1, null] must be 1, not 0.5 — the whole null-vs-zero contract in one line.
    expect(meanIgnoringNull([1, null])).toBe(1);
  });
});
