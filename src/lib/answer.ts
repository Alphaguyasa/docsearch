/**
 * SERVER-ONLY. Cited answer generation.
 *
 * Turns retrieved chunks into a grounded, cited answer. The context passages are
 * numbered [1]..[n] and labelled with document title and page; the model is
 * required to cite every factual claim with the matching [n], and to refuse
 * plainly when the passages do not cover the question rather than answering from
 * general knowledge. Generation goes through the provider-agnostic llm.ts — this
 * module never names a concrete provider. Never import into a client component.
 */
import type { LlmMessage } from "./llm";
import { getLlm } from "./llm";
import type { RetrievedChunk } from "./retrieve";

/**
 * The refusal must contain this exact phrase and no citation markers, so the
 * unanswerable eval questions (u01–u05) can be checked mechanically. The system
 * prompt instructs the model to produce it verbatim.
 */
export const NOT_COVERED_PHRASE = "not covered by these documents";

const SYSTEM_PROMPT = [
  "You answer questions strictly from a set of numbered context passages supplied",
  "by the user. Each passage is labelled [n] with its source document title and",
  "page number.",
  "",
  "Rules — follow all of them exactly:",
  "1. Use ONLY information found in the context passages. Never answer from prior",
  "   or general knowledge.",
  "2. End every factual claim with an inline citation naming the passage(s) it",
  "   came from, e.g. [1] or [2][3]. A claim with no citation is not allowed.",
  "3. If the passages do not contain the information needed to answer the",
  `   question, reply with exactly this one sentence: "This question is ${NOT_COVERED_PHRASE}."`,
  "   In that case write nothing else and include NO citation markers.",
].join("\n");

/** Render one passage as its numbered, labelled context block. */
function formatChunk(chunk: RetrievedChunk, n: number): string {
  const page = chunk.pageNumber === null ? "" : `, p.${chunk.pageNumber}`;
  return `[${n}] (${chunk.title}${page})\n${chunk.content}`;
}

/** Build the system + user messages for a question and its retrieved chunks. */
export function buildMessages(
  question: string,
  chunks: RetrievedChunk[],
): LlmMessage[] {
  const context = chunks
    .map((chunk, i) => formatChunk(chunk, i + 1))
    .join("\n\n");

  const user =
    `Context passages:\n\n${context}\n\n` +
    `Question: ${question}`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

/**
 * Stream a cited answer for `question` grounded in `chunks`, as text deltas.
 * Provider selection is handled entirely inside llm.ts.
 */
export function streamAnswer(
  question: string,
  chunks: RetrievedChunk[],
): AsyncIterable<string> {
  return getLlm().stream(buildMessages(question, chunks));
}
