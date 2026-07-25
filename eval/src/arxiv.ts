/**
 * arXiv Atom feed parsing and filename derivation. PURE — no I/O, no network.
 *
 * Kept separate from scripts/fetch-corpus.ts so importing these functions (for
 * tests, or anywhere else) cannot trigger the CLI's `main()` and fire a live
 * request at arXiv.
 */

export interface Paper {
  arxivId: string;
  version: number;
  title: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    // &amp; last, so "&amp;lt;" decodes to "&lt;" and not "<".
    .replace(/&amp;/g, "&");
}

function tagContent(entry: string, tag: string): string | null {
  const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

/**
 * Minimal Atom extraction.
 *
 * The feed comes from a single well-known producer with a stable shape, so a
 * targeted extractor beats adding an XML dependency for two fields. It is
 * deliberately strict: an entry missing an id or title is skipped and COUNTED,
 * never silently defaulted, so a feed-format change surfaces as "fetched 0 of
 * 200" rather than 200 rows of junk.
 */
export function parseAtomFeed(xml: string): { papers: Paper[]; skipped: number } {
  const papers: Paper[] = [];
  let skipped = 0;

  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1];
    const rawId = tagContent(entry, "id");
    const title = tagContent(entry, "title");

    // e.g. http://arxiv.org/abs/2301.12345v2, or the older http://arxiv.org/abs/cs/0701001v1
    const parsed = rawId?.match(/abs\/(.+?)v(\d+)$/);
    if (!parsed || !title) {
      skipped++;
      continue;
    }
    papers.push({ arxivId: parsed[1], version: Number(parsed[2]), title });
  }

  return { papers, skipped };
}

/**
 * Filesystem-safe, readable, and still carrying the id for traceability.
 *
 * The document title in the app is derived from the filename, so a bare id
 * would make every citation in the UI read "2301.12345v2". Truncated so the
 * full path stays within Windows' limits.
 */
export function pdfFilename(paper: Paper): string {
  const slug = paper.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  return `${slug || "paper"}--${paper.arxivId}v${paper.version}.pdf`;
}
