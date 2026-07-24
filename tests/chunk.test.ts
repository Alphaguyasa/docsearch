import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chunkPage,
  chunkPages,
  countTokens,
  stripRepeatedLines,
  type Page,
} from "../src/lib/chunk";

// Build a paragraph of roughly `tokens` tokens (countTokens = ceil(chars / 4)).
function para(label: string, tokens: number): string {
  const target = tokens * 4;
  let s = `${label}:`;
  let i = 0;
  while (s.length < target) s += ` w${i++}`;
  return s + ".";
}

test("splits on paragraph boundaries, never mid-paragraph for small paragraphs", () => {
  const paras = [para("A", 100), para("B", 100), para("C", 100)];
  const text = paras.join("\n\n");
  const chunks = chunkPage(1, text, { targetTokens: 250, overlapRatio: 0 });

  // With no overlap and a 250-token target, whole paragraphs pack 2 then 1.
  assert.equal(chunks.length, 2);
  // Every chunk is composed of whole paragraphs joined by the blank-line
  // separator — no paragraph is ever cut in half.
  for (const chunk of chunks) {
    for (const piece of chunk.content.split("\n\n")) {
      assert.ok(
        paras.includes(piece),
        `chunk piece is not a whole paragraph: ${JSON.stringify(piece)}`,
      );
    }
  }
});

test("overlap repeats trailing segments as the next chunk's prefix (~15%)", () => {
  const paras = Array.from({ length: 12 }, (_, i) => para(`P${i}`, 50));
  const chunks = chunkPage(1, paras.join("\n\n"), {
    targetTokens: 200, // ~4 paragraphs per chunk
    overlapRatio: 0.15, // ~30 tokens ≈ trailing paragraph
  });

  assert.ok(chunks.length >= 2, "expected multiple chunks");

  const overlapBudget = Math.round(200 * 0.15);
  for (let i = 0; i < chunks.length - 1; i++) {
    const prev = chunks[i].content.split("\n\n");
    const next = chunks[i + 1].content.split("\n\n");

    // The next chunk must begin by repeating a non-empty run of the previous
    // chunk's trailing paragraphs.
    let overlap = 0;
    while (
      overlap < prev.length &&
      overlap < next.length &&
      prev[prev.length - 1 - overlap] === next[overlap]
    ) {
      overlap++;
    }
    assert.ok(overlap >= 1, `chunks ${i}/${i + 1} share no overlap`);

    // Overlap stays within the ~15% budget (each paragraph here is ~50 tokens,
    // so the budget admits exactly one paragraph of overlap).
    const overlapTokens = next
      .slice(0, overlap)
      .reduce((sum, p) => sum + countTokens(p), 0);
    assert.ok(
      overlapTokens <= overlapBudget + countTokens(next[0]),
      `overlap ${overlapTokens} exceeds budget ${overlapBudget}`,
    );
  }
});

test("the chunk window always makes forward progress (no infinite overlap)", () => {
  // Paragraphs near the target size stress the progress guarantee.
  const paras = Array.from({ length: 6 }, (_, i) => para(`Q${i}`, 190));
  const chunks = chunkPage(1, paras.join("\n\n"), {
    targetTokens: 200,
    overlapRatio: 0.15,
  });
  assert.equal(chunks.length, 6); // one big paragraph per chunk, all present
});

test("a chunk never spans two pages", () => {
  const pages: Page[] = [
    { pageNumber: 1, text: [para("A", 100), para("B", 100)].join("\n\n") },
    { pageNumber: 2, text: [para("C", 100), para("D", 100)].join("\n\n") },
  ];
  const chunks = chunkPages(pages, { targetTokens: 1000 }); // whole page fits

  // Content from page 1 never appears in a page-2 chunk and vice-versa.
  for (const chunk of chunks) {
    const onPage1 = chunk.content.includes("A:") || chunk.content.includes("B:");
    const onPage2 = chunk.content.includes("C:") || chunk.content.includes("D:");
    assert.ok(!(onPage1 && onPage2), "chunk mixes content from two pages");
    if (onPage1) assert.equal(chunk.pageNumber, 1);
    if (onPage2) assert.equal(chunk.pageNumber, 2);
  }
});

test("an oversized paragraph is split on sentence boundaries, never mid-sentence", () => {
  const sentences = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} ends here.`);
  const oneBigParagraph = sentences.join(" ");
  const chunks = chunkPage(1, oneBigParagraph, { targetTokens: 20, overlapRatio: 0 });

  assert.ok(chunks.length > 1, "expected the big paragraph to be split");
  // Every sentence survives intact somewhere; no chunk ends mid-sentence.
  for (const chunk of chunks) {
    assert.ok(
      /[.!?]$/.test(chunk.content.trim()),
      `chunk does not end at a sentence boundary: ${JSON.stringify(chunk.content)}`,
    );
  }
});

test("stripRepeatedLines removes running headers/footers, including 'Page N'", () => {
  const pages: Page[] = [1, 2, 3, 4].map((n) => ({
    pageNumber: n,
    text: [
      "ACME Corp — Confidential", // header, identical every page
      "",
      `Unique body content for page ${n} goes here.`,
      "",
      `Page ${n}`, // footer, differs only by the page number
    ].join("\n"),
  }));

  const cleaned = stripRepeatedLines(pages);

  for (const page of cleaned) {
    assert.ok(!page.text.includes("ACME Corp"), "header not stripped");
    assert.ok(!/Page \d/.test(page.text), "numbered footer not stripped");
    assert.ok(
      page.text.includes(`Unique body content for page ${page.pageNumber}`),
      "body content was wrongly removed",
    );
  }
});

test("stripRepeatedLines is a no-op with too few pages to judge", () => {
  const pages: Page[] = [1, 2].map((n) => ({
    pageNumber: n,
    text: ["Header line", `Body ${n}`].join("\n"),
  }));
  assert.deepEqual(stripRepeatedLines(pages), pages);
});
