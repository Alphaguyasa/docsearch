import { describe, expect, it } from "vitest";

import {
  cosine,
  findUnlabelledNearDuplicates,
  parseVector,
  percentile,
  type CandidateChunk,
} from "./duplicates";

function candidate(chunkId: string, docId = "doc-1", rank = 1): CandidateChunk {
  return { chunkId, docId, page: 1, text: `text ${chunkId}`, rank };
}

describe("parseVector", () => {
  it("parses the pgvector text form", () => {
    expect(parseVector("[0.1,0.2,0.3]")).toEqual([0.1, 0.2, 0.3]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseVector("  [1, 2, 3]  ")).toEqual([1, 2, 3]);
  });

  it("passes a real array straight through", () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("handles negatives and exponents", () => {
    expect(parseVector("[-0.5,1e-3]")).toEqual([-0.5, 0.001]);
  });

  it("returns null rather than a partial vector on junk", () => {
    // A half-parsed embedding would silently produce plausible similarities.
    expect(parseVector("[1,not-a-number,3]")).toBeNull();
  });

  it("returns null for empty, malformed, or non-vector input", () => {
    expect(parseVector("[]")).toBeNull();
    expect(parseVector("0.1,0.2")).toBeNull();
    expect(parseVector(null)).toBeNull();
    expect(parseVector(undefined)).toBeNull();
    expect(parseVector(42)).toBeNull();
  });
});

describe("cosine", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("ignores magnitude", () => {
    expect(cosine([1, 1], [10, 10])).toBeCloseTo(1);
  });

  it("returns null on a dimension mismatch instead of comparing a prefix", () => {
    // Different lengths mean two embedding models are mixed in one table.
    // A number here would look plausible and mean nothing.
    expect(cosine([1, 0, 0], [1, 0])).toBeNull();
  });

  it("returns null for a zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBeNull();
  });

  it("returns null for empty vectors", () => {
    expect(cosine([], [])).toBeNull();
  });
});

describe("findUnlabelledNearDuplicates", () => {
  const labelled = [{ chunkId: "rel-1", docId: "doc-1" }];

  it("flags an unlabelled chunk that closely matches a labelled one", () => {
    const embeddings = new Map([
      ["rel-1", [1, 0, 0]],
      ["cand-1", [0.99, 0.14, 0]],
    ]);
    const { flagged } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("cand-1")],
      embeddings,
      0.9,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].candidate.chunkId).toBe("cand-1");
    expect(flagged[0].labelledChunkId).toBe("rel-1");
    expect(flagged[0].similarity).toBeGreaterThan(0.9);
  });

  it("never flags a chunk that is already labelled", () => {
    const embeddings = new Map([["rel-1", [1, 0, 0]]]);
    const { flagged } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("rel-1")],
      embeddings,
      0.5,
    );
    expect(flagged).toHaveLength(0);
  });

  it("leaves a dissimilar chunk alone", () => {
    const embeddings = new Map([
      ["rel-1", [1, 0, 0]],
      ["cand-1", [0, 1, 0]],
    ]);
    const { flagged, similarities } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("cand-1")],
      embeddings,
      0.9,
    );
    expect(flagged).toHaveLength(0);
    // Still recorded, so the distribution can be used to tune the threshold.
    expect(similarities).toHaveLength(1);
    expect(similarities[0]).toBeCloseTo(0);
  });

  it("matches against the CLOSEST labelled chunk when several exist", () => {
    const embeddings = new Map([
      ["rel-1", [1, 0, 0]],
      ["rel-2", [0, 1, 0]],
      ["cand-1", [0, 0.99, 0.14]],
    ]);
    const { flagged } = findUnlabelledNearDuplicates(
      [
        { chunkId: "rel-1", docId: "doc-1" },
        { chunkId: "rel-2", docId: "doc-2" },
      ],
      [candidate("cand-1", "doc-2")],
      embeddings,
      0.9,
    );
    expect(flagged[0].labelledChunkId).toBe("rel-2");
  });

  it("marks same-document matches, which are usually adjacent chunks", () => {
    const embeddings = new Map([
      ["rel-1", [1, 0, 0]],
      ["same", [1, 0, 0]],
      ["other", [1, 0, 0]],
    ]);
    const { flagged } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("same", "doc-1"), candidate("other", "doc-9", 2)],
      embeddings,
      0.9,
    );
    expect(flagged.find((f) => f.candidate.chunkId === "same")!.sameDocument).toBe(true);
    expect(flagged.find((f) => f.candidate.chunkId === "other")!.sameDocument).toBe(false);
  });

  it("counts a candidate with no embedding as skipped, not clean", () => {
    const embeddings = new Map([["rel-1", [1, 0, 0]]]);
    const { flagged, skipped } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("missing")],
      embeddings,
      0.9,
    );
    expect(flagged).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("reports every candidate as skipped when no labelled vector is available", () => {
    // Returning "clean" here would claim the ground truth was checked when
    // nothing could be compared.
    const { flagged, skipped } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("cand-1"), candidate("cand-2")],
      new Map(),
      0.9,
    );
    expect(flagged).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("respects the threshold boundary inclusively", () => {
    const embeddings = new Map([
      ["rel-1", [1, 0]],
      ["cand-1", [1, 0]],
    ]);
    expect(
      findUnlabelledNearDuplicates(labelled, [candidate("cand-1")], embeddings, 1).flagged,
    ).toHaveLength(1);
  });

  it("skips a candidate whose embedding has the wrong dimension", () => {
    const embeddings = new Map([
      ["rel-1", [1, 0, 0]],
      ["cand-1", [1, 0]],
    ]);
    const { flagged, skipped } = findUnlabelledNearDuplicates(
      labelled,
      [candidate("cand-1")],
      embeddings,
      0.5,
    );
    expect(flagged).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe("percentile", () => {
  it("returns the value at the requested quantile", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(6);
  });

  it("sorts before selecting", () => {
    expect(percentile([9, 1, 5], 0)).toBe(1);
  });

  it("clamps at the top", () => {
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });

  it("returns 0 for an empty set", () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});
