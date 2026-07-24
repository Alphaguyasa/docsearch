/**
 * Chunking for ingestion. Pure functions, no I/O — this is the unit-tested core.
 *
 * TOKEN COUNTING — ONE EXPLICIT METHOD:
 * We approximate token count as ceil(characters / 4). This is the single method
 * used for BOTH the `token_count` column and the ingest stats output; the two
 * never diverge. We deliberately do NOT use the Anthropic token-counting API:
 *   (a) `--dry-run` must make zero network calls, and
 *   (b) that API counts Claude tokens, not Voyage's, so it would be no more
 *       accurate for our embedding model anyway.
 */

export interface Page {
  /** 1-based page number. This is the citation later, so it must survive chunking. */
  pageNumber: number;
  text: string;
}

export interface Chunk {
  content: string;
  pageNumber: number;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Approximate target chunk size, in tokens. */
  targetTokens?: number;
  /** Fraction of a chunk repeated at the start of the next chunk. */
  overlapRatio?: number;
}

const DEFAULT_TARGET_TOKENS = 800;
const DEFAULT_OVERLAP_RATIO = 0.15;

/** The one and only token counter — see the file header. */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split text into paragraphs on blank-line boundaries, whitespace-normalized. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/**
 * Split a paragraph into sentences. Heuristic: break after . ! ? followed by
 * whitespace. Not linguistically perfect (e.g. "Dr." trips it), but good enough
 * to guarantee we never place a chunk boundary mid-sentence.
 */
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Decompose a page into "segments" — the atomic units we pack into chunks.
 * A segment is a whole paragraph; if a paragraph alone exceeds the target we
 * fall back to sentence segments so chunk boundaries never land mid-sentence.
 * A single sentence larger than the target is emitted whole (documented limit).
 */
function segmentsForPage(text: string, targetTokens: number): string[] {
  const segments: string[] = [];
  for (const para of splitParagraphs(text)) {
    if (countTokens(para) <= targetTokens) {
      segments.push(para);
    } else {
      for (const sentence of splitSentences(para)) segments.push(sentence);
    }
  }
  return segments;
}

/**
 * Chunk the text of a SINGLE page. Because each page is chunked independently,
 * a chunk can never span two pages, and overlap never crosses a page boundary.
 */
export function chunkPage(
  pageNumber: number,
  text: string,
  options: ChunkOptions = {},
): Chunk[] {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapRatio = options.overlapRatio ?? DEFAULT_OVERLAP_RATIO;
  const overlapTokens = Math.round(targetTokens * overlapRatio);

  const segments = segmentsForPage(text, targetTokens);
  if (segments.length === 0) return [];
  const tokens = segments.map(countTokens);

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < segments.length) {
    // Greedily accumulate segments up to the target — always take at least one,
    // even if that single segment already exceeds the target.
    let end = start;
    let running = 0;
    while (end < segments.length) {
      if (end > start && running + tokens[end] > targetTokens) break;
      running += tokens[end];
      end++;
    }

    const content = segments.slice(start, end).join("\n\n");
    chunks.push({ content, pageNumber, tokenCount: countTokens(content) });

    if (end >= segments.length) break;

    // Overlap: step back from `end` collecting trailing segments until we've
    // gathered ~overlapTokens. Never step back to `start` or earlier, so the
    // window always advances (forward progress guaranteed).
    let back = end - 1;
    let overlap = 0;
    while (back > start && overlap + tokens[back] <= overlapTokens) {
      overlap += tokens[back];
      back--;
    }
    let nextStart = back + 1; // segments[nextStart .. end) repeat in the next chunk

    // If the budget was too small to fit even the last segment but the chunk
    // holds ≥2 segments, still carry one segment of overlap — otherwise large
    // paragraphs would produce zero overlap. Skipped when overlap is disabled.
    if (overlapTokens > 0 && nextStart === end && end - 1 > start) {
      nextStart = end - 1;
    }
    start = nextStart;
  }

  return chunks;
}

/** Chunk every page in order. Page numbers are preserved on each chunk. */
export function chunkPages(pages: Page[], options: ChunkOptions = {}): Chunk[] {
  return pages.flatMap((page) => chunkPage(page.pageNumber, page.text, options));
}

export interface StripOptions {
  /** Need at least this many pages before we trust the header/footer signal. */
  minPages?: number;
  /** A line must appear on at least this fraction of pages to be stripped. */
  threshold?: number;
}

// Footers like "Page 1" are short; body lines that merely contain a number are
// long. We only collapse digits (to catch "Page 1" / "Page 2" as one footer)
// for lines at or below this length, so numbered body text is never stripped.
const SHORT_LINE_CHARS = 40;

/**
 * Remove running headers/footers: lines that appear on nearly every page.
 * Used only behind the `--strip-repeated` flag (default OFF) so its effect can
 * be measured later.
 *
 * A line is stripped if its exact text recurs on ≥threshold of pages (static
 * headers/footers), OR — for SHORT lines only — its digit-normalized form does
 * (numbered footers like "Page 1", "Page 2", ...).
 */
export function stripRepeatedLines(
  pages: Page[],
  options: StripOptions = {},
): Page[] {
  const minPages = options.minPages ?? 3;
  const threshold = options.threshold ?? 0.7;
  if (pages.length < minPages) return pages;

  const collapse = (line: string) => line.trim().replace(/\s+/g, " ");
  const digitless = (line: string) => collapse(line).replace(/\d+/g, "#");
  const minCount = threshold * pages.length;

  // Count, per page, how often each exact line and each short-line "shape" recurs.
  const exactFreq = new Map<string, number>();
  const shapeFreq = new Map<string, number>();
  for (const page of pages) {
    const seenExact = new Set<string>();
    const seenShape = new Set<string>();
    for (const raw of page.text.split(/\r?\n/)) {
      const line = collapse(raw);
      if (line === "") continue;
      if (!seenExact.has(line)) {
        seenExact.add(line);
        exactFreq.set(line, (exactFreq.get(line) ?? 0) + 1);
      }
      if (line.length <= SHORT_LINE_CHARS) {
        const shape = digitless(raw);
        if (!seenShape.has(shape)) {
          seenShape.add(shape);
          shapeFreq.set(shape, (shapeFreq.get(shape) ?? 0) + 1);
        }
      }
    }
  }

  const isRepeated = (raw: string): boolean => {
    const line = collapse(raw);
    if (line === "") return false;
    if ((exactFreq.get(line) ?? 0) >= minCount) return true;
    if (line.length <= SHORT_LINE_CHARS && (shapeFreq.get(digitless(raw)) ?? 0) >= minCount) {
      return true;
    }
    return false;
  };

  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text
      .split(/\r?\n/)
      // Keep blank lines (they mark paragraph boundaries); drop repeated lines.
      .filter((raw) => collapse(raw) === "" || !isRepeated(raw))
      .join("\n"),
  }));
}
