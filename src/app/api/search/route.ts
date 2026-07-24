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
    .max(1000, "question must be at most 1000 characters"),
});

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
  const { question } = parsed.data;

  // 2. Retrieve BEFORE opening the stream, so an upstream failure can still
  //    return a proper status code and message.
  let chunks: RetrievedChunk[];
  try {
    const result = await retrieve(question);
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

        for await (const text of streamAnswer(question, chunks)) {
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
