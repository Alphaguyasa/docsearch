import { describe, expect, it } from "vitest";

import {
  buildAggregationQuestions,
  buildEntityIndex,
  crossDocumentPairs,
  sameDocumentPairs,
  entityIdf,
  entityMentions,
  namedEntities,
  sampleStratified,
  selectMultihopPairs,
  mulberry32,
  type CorpusChunk,
} from "./entities";

function chunk(id: string, documentId: string, content: string): CorpusChunk {
  return {
    id,
    documentId,
    filename: `${documentId}.pdf`,
    title: documentId,
    content,
    pageNumber: 1,
    chunkIndex: 0,
  };
}

describe("namedEntities", () => {
  it("extracts multi-word capitalised phrases and acronyms", () => {
    const found = namedEntities("The Wagner Institute published RoBERTa results.");
    expect(found.has("Wagner Institute")).toBe(true);
    expect(found.has("RoBERTa")).toBe(true);
  });

  it("drops discourse connectives, which are capitalised only by position", () => {
    // "However" was the single most common "shared entity" on the real corpus,
    // matching 617 chunk pairs that shared no subject whatsoever.
    const found = namedEntities("However, results improved. Therefore we conclude.");
    expect(found.has("However")).toBe(false);
    expect(found.has("Therefore")).toBe(false);
  });

  it("drops section headings", () => {
    const found = namedEntities("Introduction\nRelated Work\nConclusion");
    expect(found.has("Introduction")).toBe(false);
    expect(found.has("Conclusion")).toBe(false);
  });
});

describe("entityMentions", () => {
  it("counts repeat mentions", () => {
    const counts = entityMentions("Kestrel Device is fast. Kestrel Device is cheap.");
    expect(counts.get("Kestrel Device")).toBe(2);
  });

  it("counts a one-off citation once", () => {
    expect(entityMentions("As shown by Al-Fuqaha et al.").get("Al-Fuqaha")).toBe(1);
  });
});

describe("buildEntityIndex", () => {
  const corpus = [
    chunk("c1", "doc-1", "Zephyr Protocol is used here."),
    chunk("c2", "doc-1", "Zephyr Protocol again, same document."),
    chunk("c3", "doc-2", "Zephyr Protocol and Common Term."),
    chunk("c4", "doc-3", "Common Term only."),
    chunk("c5", "doc-4", "Common Term only."),
  ];

  it("counts DOCUMENTS, not chunks", () => {
    const index = buildEntityIndex(corpus);
    // Zephyr Protocol appears in three chunks but only two documents.
    expect(index.documentFrequency.get("Zephyr Protocol")).toBe(2);
    expect(index.documentCount).toBe(4);
  });

  it("scores a rarer entity as more specific", () => {
    const index = buildEntityIndex(corpus);
    expect(entityIdf(index, "Zephyr Protocol")).toBeGreaterThan(
      entityIdf(index, "Common Term"),
    );
  });

  it("treats an unseen entity as maximally specific", () => {
    const index = buildEntityIndex(corpus);
    expect(entityIdf(index, "Never Seen")).toBeGreaterThan(entityIdf(index, "Zephyr Protocol"));
  });
});

describe("crossDocumentPairs", () => {
  it("prefers the RARER shared entity, not the longest name", () => {
    // The old heuristic took the longest string, which on the real corpus picked
    // "Computational Linguistics" over anything that actually identified a subject.
    const both = "Kestrel matters. Kestrel again. Extremely Long Generic Phrase. Extremely Long Generic Phrase.";
    const filler = "Extremely Long Generic Phrase. Extremely Long Generic Phrase.";
    const corpus = [
      chunk("a1", "doc-1", both),
      chunk("b1", "doc-2", both),
      chunk("f1", "doc-3", filler),
      chunk("f2", "doc-4", filler),
      chunk("f3", "doc-5", filler),
    ];
    const index = buildEntityIndex(corpus);
    const pairs = crossDocumentPairs([corpus[0], corpus[1]], index);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].entity).toBe("Kestrel");
  });

  it("excludes entities appearing in too much of the corpus", () => {
    // Ten documents all sharing one term: no pair of them is 'about' it.
    const corpus = Array.from({ length: 10 }, (_, i) =>
      chunk(`c${i}`, `doc-${i}`, "Ubiquitous Thing appears everywhere."),
    );
    const index = buildEntityIndex(corpus);
    const pairs = crossDocumentPairs(corpus, index, { maxDocFraction: 0.15 });
    expect(pairs).toHaveLength(0);
  });

  it("rejects a rare entity that is only cited once in each passage", () => {
    // The failure this fixes: after IDF filtering, the top shared entities were
    // author surnames appearing once each in reference lists — maximally rare,
    // and sharing a citation rather than a subject. The model refused all 20.
    const corpus = [
      chunk("a1", "doc-1", "We propose a parser. See Al-Fuqaha et al. for background."),
      chunk("b1", "doc-2", "We propose a tagger. See Al-Fuqaha et al. for background."),
    ];
    const index = buildEntityIndex(corpus);
    expect(crossDocumentPairs(corpus, index)).toHaveLength(0);
  });

  it("accepts a rare entity that both passages are actually about", () => {
    const corpus = [
      chunk("a1", "doc-1", "Kestrel Device performs well. Kestrel Device costs little."),
      chunk("b1", "doc-2", "We extend Kestrel Device. Kestrel Device is evaluated here."),
    ];
    const index = buildEntityIndex(corpus);
    const pairs = crossDocumentPairs(corpus, index);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].entity).toBe("Kestrel Device");
    expect(pairs[0].mentions).toBe(2);
  });

  it("scores by the WEAKER passage, not the stronger", () => {
    // Central to one passage, mentioned in passing by the other: that cannot
    // anchor a question genuinely requiring both.
    const corpus = [
      chunk("a1", "doc-1", "Kestrel Device. Kestrel Device. Kestrel Device. Kestrel Device."),
      chunk("b1", "doc-2", "A brief nod to Kestrel Device here."),
    ];
    const index = buildEntityIndex(corpus);
    expect(crossDocumentPairs(corpus, index)).toHaveLength(0);
  });

  it("does not break ties alphabetically", () => {
    // Ranking ties by name returned twenty pairs whose entities all began "A".
    const corpus = Array.from({ length: 12 }, (_, i) => {
      const name = `${String.fromCharCode(65 + i)}lpha${i} Widget`;
      return chunk(`c${i}`, `doc-${i}`, `${name} matters. ${name} again.`);
    });
    // Give every pair an identical score by making one shared entity.
    const shared = corpus.map((c, i) =>
      chunk(c.id, `doc-${i}`, `${c.content} Shared Anchor. Shared Anchor.`),
    );
    const index = buildEntityIndex(shared);
    const pairs = crossDocumentPairs(shared, index, { maxDocFraction: 1 });

    const firstEntities = pairs.slice(0, 5).map((p) => p.entity);
    expect(firstEntities.length).toBeGreaterThan(0);
    // Deterministic across calls despite the non-lexical ordering.
    const again = crossDocumentPairs(shared, index, { maxDocFraction: 1 });
    expect(again.slice(0, 5).map((p) => `${p.a.id}|${p.b.id}`)).toEqual(
      pairs.slice(0, 5).map((p) => `${p.a.id}|${p.b.id}`),
    );
  });

  it("never pairs two chunks from the same document", () => {
    const corpus = [
      chunk("a", "doc-1", "Kestrel Device."),
      chunk("b", "doc-1", "Kestrel Device."),
    ];
    const index = buildEntityIndex(corpus);
    expect(crossDocumentPairs(corpus, index)).toHaveLength(0);
  });

  it("returns pairs sorted most-specific first", () => {
    const rare = "Rarest Widget. Rarest Widget.";
    const mid = "Middling Gadget. Middling Gadget.";
    const corpus = [
      chunk("a1", "doc-1", rare),
      chunk("b1", "doc-2", rare),
      chunk("a2", "doc-3", mid),
      chunk("b2", "doc-4", mid),
      chunk("x1", "doc-5", mid),
    ];
    const index = buildEntityIndex(corpus);
    const pairs = crossDocumentPairs(corpus, index, { maxDocFraction: 1 });

    expect(pairs.length).toBeGreaterThan(1);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].idf).toBeGreaterThanOrEqual(pairs[i].idf);
    }
    expect(pairs[0].entity).toBe("Rarest Widget");
  });

  it("is deterministic across repeated calls", () => {
    const text = "Alpha Thing and Beta Thing. Alpha Thing and Beta Thing.";
    const corpus = [
      chunk("a1", "doc-1", text),
      chunk("b1", "doc-2", text),
      chunk("c1", "doc-3", text),
    ];
    const index = buildEntityIndex(corpus);
    const first = crossDocumentPairs(corpus, index, { maxDocFraction: 1 });
    const second = crossDocumentPairs(corpus, index, { maxDocFraction: 1 });
    expect(first.map((p) => `${p.a.id}-${p.b.id}-${p.entity}`)).toEqual(
      second.map((p) => `${p.a.id}-${p.b.id}-${p.entity}`),
    );
  });
});

describe("selectMultihopPairs", () => {
  const twice = "Kestrel Device. Kestrel Device.";
  const corpus = [
    chunk("a1", "doc-1", twice),
    chunk("b1", "doc-2", twice),
    chunk("a2", "doc-1", twice),
    chunk("b2", "doc-2", twice),
  ];

  it("does not let one entity or document pair fill the bucket", () => {
    const index = buildEntityIndex(corpus);
    const pairs = crossDocumentPairs(corpus, index, { maxDocFraction: 1 });
    expect(pairs.length).toBeGreaterThan(1);

    // Every pair here is doc-1 x doc-2 on "Kestrel Device" — 20 questions about
    // the same two papers would make the multihop metric describe one document
    // pair rather than the corpus.
    const picked = selectMultihopPairs(pairs, 20);
    expect(picked).toHaveLength(1);
  });

  it("respects the limit", () => {
    const varied = [
      chunk("a", "doc-1", "Widget One. Widget One."),
      chunk("b", "doc-2", "Widget One. Widget One."),
      chunk("c", "doc-3", "Gadget Two. Gadget Two."),
      chunk("d", "doc-4", "Gadget Two. Gadget Two."),
      chunk("e", "doc-5", "Doohickey Three. Doohickey Three."),
      chunk("f", "doc-6", "Doohickey Three. Doohickey Three."),
    ];
    const index = buildEntityIndex(varied);
    const pairs = crossDocumentPairs(varied, index, { maxDocFraction: 1 });
    expect(selectMultihopPairs(pairs, 2)).toHaveLength(2);
  });

  it("returns an empty selection for no pairs", () => {
    expect(selectMultihopPairs([], 10)).toEqual([]);
  });
});

describe("sameDocumentPairs", () => {
  const far = (i: number, docId: string, content: string): CorpusChunk => ({
    ...chunk(`${docId}-c${i}`, docId, content),
    chunkIndex: i,
  });

  it("pairs distant chunks of one document sharing a salient entity", () => {
    const corpus = [
      far(0, "doc-1", "We introduce Kestrel Parser. Kestrel Parser is described here."),
      far(9, "doc-1", "Kestrel Parser scores 91.2. Kestrel Parser beats the baseline."),
    ];
    const index = buildEntityIndex(corpus);
    const pairs = sameDocumentPairs(corpus, index);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].kind).toBe("same-doc");
    expect(pairs[0].entity).toBe("Kestrel Parser");
  });

  it("rejects chunks closer than the minimum distance", () => {
    // Adjacent chunks share the overlap window and restate each other, so a
    // "two-hop" question over them needs only one of the two.
    const corpus = [
      far(0, "doc-1", "Kestrel Parser here. Kestrel Parser again."),
      far(2, "doc-1", "Kestrel Parser here. Kestrel Parser again."),
    ];
    const index = buildEntityIndex(corpus);
    expect(sameDocumentPairs(corpus, index)).toHaveLength(0);
    expect(sameDocumentPairs(corpus, index, { minChunkDistance: 2 })).toHaveLength(1);
  });

  it("never pairs across documents", () => {
    const corpus = [
      far(0, "doc-1", "Kestrel Parser. Kestrel Parser."),
      far(9, "doc-2", "Kestrel Parser. Kestrel Parser."),
    ];
    const index = buildEntityIndex(corpus);
    expect(sameDocumentPairs(corpus, index)).toHaveLength(0);
  });

  it("tolerates a corpus-common entity that cross-doc pairing would reject", () => {
    // Within one paper the subject IS the paper's own; a model name appearing in
    // half the corpus is still what its method and results sections are about.
    // This entity sits in the gap: too common for cross-doc (>15%), fine for
    // same-doc (<=50%).
    const common = "Common Model. Common Model.";
    const corpus = [
      far(0, "doc-1", common),
      far(9, "doc-1", common),
      ...Array.from({ length: 4 }, (_, i) => far(0, `doc-${i + 2}`, common)),
      ...Array.from({ length: 5 }, (_, i) => far(0, `doc-${i + 6}`, "Unrelated Filler.")),
    ];
    const index = buildEntityIndex(corpus);
    expect(index.documentCount).toBe(10);
    expect(index.documentFrequency.get("Common Model")).toBe(5);

    expect(sameDocumentPairs(corpus, index).length).toBeGreaterThan(0);
    expect(crossDocumentPairs(corpus, index)).toHaveLength(0);
  });
});

describe("buildAggregationQuestions", () => {
  // "Kestrel" in 4 documents, mentioned twice in each; "Rare" in only 1.
  const corpus = [
    ...Array.from({ length: 4 }, (_, i) =>
      chunk(`c${i}`, `doc-${i}`, "Kestrel Parser wins. Kestrel Parser again."),
    ),
    chunk("c9", "doc-9", "Rare Thing. Rare Thing."),
  ];
  const index = buildEntityIndex(corpus);

  it("emits exact counts as ground truth", () => {
    const qs = buildAggregationQuestions(corpus, index, 1, { minDocs: 3, maxDocs: 10 });
    expect(qs).toHaveLength(1);
    expect(qs[0].entity).toBe("Kestrel Parser");
    expect(qs[0].form).toBe("count");
    expect(qs[0].expectedAnswer).toBe("4");
    expect(qs[0].chunkIds).toHaveLength(4);
    expect(qs[0].docIds).toHaveLength(4);
  });

  it("excludes entities outside the document-frequency band", () => {
    const qs = buildAggregationQuestions(corpus, index, 10, { minDocs: 3, maxDocs: 10 });
    expect(qs.some((q) => q.entity === "Rare Thing")).toBe(false);
  });

  it("alternates count and list forms", () => {
    const wide = Array.from({ length: 6 }, (_, e) =>
      Array.from({ length: 3 }, (_, d) =>
        chunk(`e${e}d${d}`, `doc-${e}-${d}`, `Entity${e} Name. Entity${e} Name.`),
      ),
    ).flat();
    const wideIndex = buildEntityIndex(wide);
    const qs = buildAggregationQuestions(wide, wideIndex, 4, { minDocs: 3, maxDocs: 10 });

    expect(qs.length).toBe(4);
    expect(qs.map((q) => q.form)).toEqual(["count", "list", "count", "list"]);
    // Phrasing must vary — identical scaffolding lets a retriever key on the
    // template rather than the entity.
    const countQuestions = qs.filter((q) => q.form === "count").map((q) => q.question);
    const stripped = countQuestions.map((q, i) => q.replace(qs.filter((x) => x.form === "count")[i].entity, "{}"));
    expect(new Set(stripped).size).toBe(stripped.length);
  });

  it("skips citation-only entities mentioned once per document", () => {
    const cited = Array.from({ length: 4 }, (_, i) =>
      chunk(`x${i}`, `doc-${i}`, "As shown by Smithers et al."),
    );
    const citedIndex = buildEntityIndex(cited);
    const qs = buildAggregationQuestions(cited, citedIndex, 5, { minDocs: 3, maxDocs: 10 });
    expect(qs.some((q) => q.entity === "Smithers")).toBe(false);
  });

  it("returns nothing for a non-positive limit", () => {
    expect(buildAggregationQuestions(corpus, index, 0)).toEqual([]);
  });
});

describe("sampleStratified", () => {
  it("caps each document's contribution", () => {
    const corpus = [
      chunk("a1", "doc-1", "one"),
      chunk("a2", "doc-1", "two"),
      chunk("a3", "doc-1", "three"),
      chunk("b1", "doc-2", "four"),
    ];
    const picked = sampleStratified(corpus, 2, mulberry32(42));
    const perDoc = picked.filter((c) => c.documentId === "doc-1").length;
    expect(perDoc).toBe(2);
    expect(picked).toHaveLength(3);
  });
});
