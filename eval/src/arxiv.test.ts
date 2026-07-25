import { describe, expect, it } from "vitest";

import { parseAtomFeed, pdfFilename } from "./arxiv";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.12345v2</id>
    <title>Attention &amp; Alignment in
      Neural Machine Translation</title>
    <summary>Some abstract.</summary>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v5</id>
    <title>Attention Is All You Need</title>
  </entry>
</feed>`;

describe("parseAtomFeed", () => {
  it("extracts id, version and title", () => {
    const { papers } = parseAtomFeed(FEED);
    expect(papers).toHaveLength(2);
    expect(papers[1]).toEqual({
      arxivId: "1706.03762",
      version: 5,
      title: "Attention Is All You Need",
    });
  });

  it("decodes XML entities and collapses wrapped titles", () => {
    const { papers } = parseAtomFeed(FEED);
    expect(papers[0].title).toBe("Attention & Alignment in Neural Machine Translation");
  });

  it("skips entries missing an id or title rather than defaulting them", () => {
    // A silent default would put junk rows in the manifest; counting the skip
    // makes a feed-format change visible as "fetched 0 of 200".
    const { papers, skipped } = parseAtomFeed(
      `<entry><id>http://arxiv.org/abs/1234.5678v1</id></entry>
       <entry><title>No id here</title></entry>`,
    );
    expect(papers).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("returns nothing for an empty feed", () => {
    expect(parseAtomFeed("<feed></feed>")).toEqual({ papers: [], skipped: 0 });
  });

  it("handles ids with a subject-class prefix", () => {
    const { papers } = parseAtomFeed(
      "<entry><id>http://arxiv.org/abs/cs/0701001v1</id><title>Old style</title></entry>",
    );
    expect(papers[0].arxivId).toBe("cs/0701001");
  });
});

describe("pdfFilename", () => {
  it("slugifies the title and keeps the id for traceability", () => {
    expect(
      pdfFilename({ arxivId: "1706.03762", version: 5, title: "Attention Is All You Need" }),
    ).toBe("attention-is-all-you-need--1706.03762v5.pdf");
  });

  it("truncates a long title so the path stays usable on Windows", () => {
    const name = pdfFilename({
      arxivId: "2301.00001",
      version: 1,
      title: "A ".repeat(200) + "Very Long Title",
    });
    expect(name.length).toBeLessThan(90);
    expect(name).toContain("2301.00001v1");
  });

  it("never leaves a trailing separator from truncation", () => {
    const name = pdfFilename({ arxivId: "1", version: 1, title: "x".repeat(59) + " y" });
    expect(name).not.toContain("---");
  });

  it("falls back when a title slugifies to nothing", () => {
    expect(pdfFilename({ arxivId: "2301.00002", version: 1, title: "《》" })).toBe(
      "paper--2301.00002v1.pdf",
    );
  });
});
