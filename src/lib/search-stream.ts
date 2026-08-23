/**
 * Shared types and client-side parser for the /api/search NDJSON stream.
 *
 * This is the single source of truth for the wire contract documented in
 * src/app/api/search/route.ts — both the route (producer) and the browser
 * client (consumer) import these types so they cannot drift. Isomorphic and
 * dependency-free: safe to import from a client component (no server-only code).
 */

/** One numbered citation target. `n` is the number the answer's [n] refer to. */
export interface SourceChunk {
  n: number;
  id: string;
  title: string;
  filename: string;
  pageNumber: number | null;
  content: string;
  /**
   * The lookup-able citation: "Wisdom 3:1", "NPNF2-08 — Letter CCXXXIII".
   * Null for documents with no recovered structure, which still cite by page.
   */
  reference: string | null;
  author: string | null;
  /** "eastern" | "oriental" | "both" | null — see src/lib/corpus/types.ts. */
  tradition: string | null;
  category: string | null;
  century: number | null;
}

/**
 * A line of the stream. The route guarantees ordering: exactly one `sources`
 * first, then zero or more `delta`, then exactly one terminal `done` — or an
 * `error` in its place if generation fails after the stream has opened.
 */
export type SearchStreamMessage =
  | { type: "sources"; chunks: SourceChunk[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Parse an NDJSON response body into a sequence of typed messages, yielding
 * each line the moment it is fully received. Because `sources` is the first
 * line, a consumer that renders on each yielded message paints the citation
 * targets before any `delta` arrives.
 */
export async function* parseSearchStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SearchStreamMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Emit every complete line as soon as its newline arrives.
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as SearchStreamMessage;
    }
  }

  // A final line without a trailing newline (shouldn't happen given the route
  // always terminates with "\n", but be forgiving).
  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as SearchStreamMessage;
}
