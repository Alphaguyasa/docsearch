/**
 * POST /api/search — retrieve + cited answer generation over the corpus.
 *
 * Request:  { "question": string }   (non-empty, trimmed, ≤ 1000 chars)
 *
 * Failures BEFORE streaming return a real HTTP status with a readable JSON body
 * { "error": string }:
 *   - 400  invalid request body (missing/empty/too-long question)
 *   - 429  site-wide search limit reached (Voyage free tier); retry in a minute
 *   - 502  retrieval failed upstream (embedding / database / keyword search)
 *
 * On success the response is 200 with Content-Type application/x-ndjson: one
 * JSON object per line, each with a "type" field. The Phase 4 client can rely on
 * this exact contract:
 *
 *   {"type":"crisis","crisis":{...}}     INSTEAD of everything below when the
 *                                        safety gate trips; followed only by done
 *   {"type":"sources","chunks":[...],"figures":[...],"tags":[...]}
 *                                        exactly once, first line
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

import { streamAnswer, type FigureHint } from "@/lib/answer";
import { getLlm, lightModel } from "@/lib/llm";
import type { RetrievedChunk } from "@/lib/retrieve";
import { TRADITIONS } from "@/lib/scripture/canon";
import { retrieveForStruggle } from "@/lib/scripture/retrieve-struggle";
import { BUSY_MESSAGE, takeSearchSlot } from "@/lib/scripture/rate-limit";
import { checkSafety, crisisResponse } from "@/lib/scripture/safety";
import { parseRef } from "@/lib/scripture/usfm";
import type { FigureSummary, SearchStreamMessage, SourceChunk } from "@/lib/search-stream";

const requestSchema = z.object({
  /** Optional tradition filter: only passages canonical / venerated there. */
  tradition: z.enum(TRADITIONS).optional(),
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

function sourceLine(chunks: RetrievedChunk[], figures: FigureSummary[] = [], tags: string[] = []): string {
  const sources: WireSource[] = chunks.map((chunk, i) => ({
    n: i + 1,
    id: chunk.id,
    title: chunk.title,
    filename: chunk.filename,
    pageNumber: chunk.pageNumber,
    content: chunk.content,
    ref: chunk.ref,
    traditions: chunk.traditions,
    kind: chunk.ref && !parseRef(chunk.ref) ? "tradition" : "scripture",
    fusedScore: chunk.fusedScore,
    vectorScore: chunk.vectorScore,
    keywordScore: chunk.keywordScore,
  }));
  // Emitted directly (not via line()) because the enriched entry is a superset
  // of the base SearchStreamMessage "sources" shape.
  return JSON.stringify({ type: "sources", chunks: sources, figures, tags }) + "\n";
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
  const { question, tradition } = parsed.data;
  // Classification runs on the light model, saving the main one's quota for answers.
  const classify = async (prompt: string) =>
    (await getLlm().complete([{ role: "user", content: prompt }], 20, lightModel())).text;

  // 2. Safety gate FIRST: a person at risk, or describing harm done to them,
  //    gets help and resources — never a story about a sinner.
  const safety = await checkSafety(question, classify);
  if (safety.crisis && safety.kind) {
    const body =
      line({ type: "crisis", crisis: crisisResponse(safety.kind) }) + line({ type: "done" });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // 3. Global rate limit — AFTER the safety gate, so a person in crisis is
  //    never told to wait.
  if (!(await takeSearchSlot())) {
    return errorResponse(BUSY_MESSAGE, 429);
  }

  // 4. Retrieve BEFORE opening the stream, so an upstream failure can still
  //    return a proper status code and message.
  let chunks: RetrievedChunk[];
  let figures: FigureSummary[] = [];
  let tags: string[] = [];
  try {
    const result = await retrieveForStruggle(question, {
      filterTraditions: tradition ? [tradition] : undefined,
      llm: classify,
    });
    chunks = result.results;
    figures = result.figures;
    tags = result.tags;
  } catch (err) {
    return errorResponse(`Retrieval failed: ${errorMessage(err)}`, 502);
  }
  const hints: FigureHint[] = figures.map(({ name, summary, note }) => ({ name, summary, note }));

  // 5. Stream NDJSON: sources first, then answer deltas, then done (or error).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sourceLine(chunks, figures, tags)));

        for await (const text of streamAnswer(question, chunks, hints)) {
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
