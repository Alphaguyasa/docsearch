/**
 * POST /api/search — retrieve + cited answer generation over the corpus.
 *
 * Request:  { "question": string }   (non-empty, trimmed, ≤ 1000 chars)
 *
 * Failures BEFORE streaming return a real HTTP status with a readable JSON body
 * { "error": string }:
 *   - 400  invalid request body (missing/empty/too-long question)
 *   - 502  retrieval failed upstream (embedding / database / keyword search)
 *
 * On success the response is 200 with Content-Type application/x-ndjson: one
 * JSON object per line, each with a "type" field. The Phase 4 client can rely on
 * this exact contract:
 *
 *   {"type":"sources","chunks":[...]}   exactly once, first line
 *   {"type":"delta","text":"..."}        zero or more, in order
 *   {"type":"done"}                      exactly once, last line — on success
 *   {"type":"error","message":"..."}     instead of "done", if generation fails
 *                                        after the stream has already started
 *
 * Each entry in "chunks" is:
 *   { n, id, title, filename, pageNumber, content,
 *     fusedScore, vectorScore, keywordScore }
 * where `n` is the 1-based citation number the answer's [n] markers refer to,
 * and the scores are the retrieval signals (fusedScore is the RRF rank; the
 * per-arm scores are null when that arm did not surface the chunk).
 *
 * Note: once the 200 stream has opened the status can no longer change, so a
 * mid-stream generation failure surfaces as a terminal {"type":"error"} line
 * rather than an HTTP error.
 */
import { z } from "zod";

import { streamAnswer } from "@/lib/answer";
import { retrieve } from "@/lib/retrieve";
import type { RetrievedChunk } from "@/lib/retrieve";
import type { SearchStreamMessage, SourceChunk } from "@/lib/search-stream";

const requestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "question must not be empty")
    // Raised from 1000: "counsel" mode invites someone to describe their own
    // situation, and a person explaining what has happened to them needs more
    // room than a lookup question does. Still bounded — this is the text that
    // goes into an embedding and a prompt.
    .max(4000, "question must be at most 4000 characters"),
  mode: z.enum(["answer", "compare", "counsel"]).default("answer"),
  /** Restrict to one communion. Omit to draw on the whole corpus. */
  tradition: z.enum(["eastern", "oriental"]).optional(),
});

/**
 * How much, and how widely, each mode retrieves.
 *
 * These are not cosmetic. "compare" exists to show what DIFFERENT works say, so
 * it must fetch more passages and cap how many any one work may contribute —
 * without the cap, a question about despondency returns eight passages of
 * Cassian, and a mode whose entire purpose is breadth answers from a single
 * author. "counsel" caps too, more loosely: several voices speaking to a
 * person's situation is better than one book at length, but the counsel should
 * still be allowed to dwell where a source is genuinely apt.
 */
const RETRIEVAL_BY_MODE: Record<
  "answer" | "compare" | "counsel",
  { limit: number; maxPerWork?: number }
> = {
  answer: { limit: 8 },
  compare: { limit: 16, maxPerWork: 2 },
  counsel: { limit: 10, maxPerWork: 3 },
};

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Serialize one contract message as an NDJSON line (typed against the shared contract). */
function line(message: SearchStreamMessage): string {
  return JSON.stringify(message) + "\n";
}

/** The wire shape of a "sources" entry: the base contract plus retrieval scores. */
type WireSource = SourceChunk & {
  fusedScore: number;
  vectorScore: number | null;
  keywordScore: number | null;
};

function sourceLine(chunks: RetrievedChunk[]): string {
  const sources: WireSource[] = chunks.map((chunk, i) => ({
    n: i + 1,
    id: chunk.id,
    title: chunk.title,
    filename: chunk.filename,
    pageNumber: chunk.pageNumber,
    content: chunk.content,
    reference: chunk.reference,
    author: chunk.author,
    tradition: chunk.tradition,
    category: chunk.category,
    century: chunk.century,
    fusedScore: chunk.fusedScore,
    vectorScore: chunk.vectorScore,
    keywordScore: chunk.keywordScore,
  }));
  // Emitted directly (not via line()) because the enriched entry is a superset
  // of the base SearchStreamMessage "sources" shape.
  return JSON.stringify({ type: "sources", chunks: sources }) + "\n";
}

export async function POST(request: Request): Promise<Response> {
  // 1. Parse and validate the body — bad input is a 400, before anything else.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  const { question, mode, tradition } = parsed.data;

  // 2. Retrieve BEFORE opening the stream, so an upstream failure can still
  //    return a proper status code and message.
  let chunks: RetrievedChunk[];
  try {
    const result = await retrieve(question, {
      ...RETRIEVAL_BY_MODE[mode],
      // ALWAYS filtered by tradition, even when the user picked neither side.
      // A document with no tradition is not part of this corpus — the database
      // still holds the research PDFs this project was built on before it
      // became an Orthodox library, and an unfiltered query can and does
      // retrieve them. Passing both traditions means "anything catalogued as
      // Orthodox", and the SQL additionally lets through everything marked
      // "both", which is the pre-Chalcedonian inheritance either side may cite.
      traditions: tradition ? [tradition] : ["eastern", "oriental"],
    });
    chunks = result.results;
  } catch (err) {
    return errorResponse(`Retrieval failed: ${errorMessage(err)}`, 502);
  }

  // 3. Stream NDJSON: sources first, then answer deltas, then done (or error).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sourceLine(chunks)));

        for await (const text of streamAnswer(question, chunks, mode)) {
          controller.enqueue(encoder.encode(line({ type: "delta", text })));
        }

        controller.enqueue(encoder.encode(line({ type: "done" })));
      } catch (err) {
        // The status is already committed (200); report the failure in-band as
        // the terminal line instead of a "done".
        controller.enqueue(
          encoder.encode(line({ type: "error", message: errorMessage(err) })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
