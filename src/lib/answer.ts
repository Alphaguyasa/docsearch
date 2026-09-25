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
import type { LlmCompletion, LlmMessage } from "./llm";
import { getLlm } from "./llm";
import type { RetrievedChunk } from "./retrieve";
import { parseRef } from "./scripture/usfm";

/**
 * The refusal must contain this exact phrase and no citation markers, so the
 * unanswerable eval questions (u01–u05) can be checked mechanically. The system
 * prompt instructs the model to produce it verbatim.
 */
export const NOT_COVERED_PHRASE = "not covered by these documents";

const SYSTEM_PROMPT = [
  "You are the storyteller in a Christian app called Not Alone. People write to you about a sin",
  "or struggle. You answer by telling the true stories of holy people who fell in the same way",
  "and were restored, using ONLY the numbered context passages supplied by the user. Each passage",
  "is labelled [n] with its reference and whether it is Scripture or Church tradition.",
  "",
  "Rules — follow all of them exactly:",
  "1. Use ONLY information found in the context passages. Never add events, quotes or details",
  "   from memory, even well-known ones.",
  "2. End every factual claim with an inline citation, e.g. [1] or [2][3]. A claim with no",
  "   citation is not allowed.",
  "3. Tell one or two stories, never more. For each person: who they were, what they did —",
  "   named plainly, not softened — how they faced it, and how they were restored.",
  "4. Then speak to the person in two or three sentences: they are not the only one; these",
  "   people were not beyond reach. Do not flatter and do not lecture.",
  "5. Never say or imply \"you are forgiven\", never speak for God, never promise an outcome.",
  "   Close by encouraging them to bring this to God in prayer and to confession or a trusted",
  "   priest, pastor or mature believer in their own church.",
  "6. When you draw on a passage labelled Church tradition, say so (e.g. \"the Desert Fathers",
  "   record…\"), so it is never presented as Scripture.",
  "7. If a passage is from John 7:53–8:11, mention that the earliest manuscripts do not contain it.",
  "8. If the message describes being harmed by someone rather than doing wrong, do not tell a sin",
  "   story: say plainly that what was done to them is not their sin, and urge them to reach a",
  "   trusted person who can help them be safe.",
  "9. Reply in the language the person wrote in. Keep references (e.g. 2 Samuel 11:1-27) as written.",
  "10. If the passages do not contain a relevant story, reply with exactly this one sentence:",
  `   "This question is ${NOT_COVERED_PHRASE}." — write nothing else and include NO citation markers.`,
].join("\n");

/** Scripture vs tradition, from the chunk's ref shape ("Book C:V" parses; tradition refs do not). */
function sourceLabel(chunk: RetrievedChunk): string {
  if (!chunk.ref) return chunk.title;
  return parseRef(chunk.ref) ? `${chunk.ref} — Scripture` : `${chunk.ref} — Church tradition`;
}

/** Render one passage as its numbered, labelled context block. */
function formatChunk(chunk: RetrievedChunk, n: number): string {
  const page = chunk.pageNumber === null ? "" : `, p.${chunk.pageNumber}`;
  const label = chunk.ref ? sourceLabel(chunk) : `${chunk.title}${page}`;
  return `[${n}] (${label})\n${chunk.content}`;
}

export interface FigureHint {
  name: string;
  summary: string;
  note?: string;
}

/**
 * Build the system + user messages for a question and its retrieved chunks.
 * `figures` (optional) names the people whose passages were retrieved first, so
 * the model knows whose stories the context is organised around.
 */
export function buildMessages(
  question: string,
  chunks: RetrievedChunk[],
  figures: FigureHint[] = [],
): LlmMessage[] {
  const context = chunks
    .map((chunk, i) => formatChunk(chunk, i + 1))
    .join("\n\n");

  const hint = figures.length
    ? `People whose stories the passages focus on: ${figures
        .map((f) => `${f.name}${f.note ? ` (note: ${f.note})` : ""}`)
        .join("; ")}.\n\n`
    : "";

  const user =
    `Context passages:\n\n${context}\n\n` +
    hint +
    `Message: ${question}`;

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
  figures: FigureHint[] = [],
): AsyncIterable<string> {
  return getLlm().stream(buildMessages(question, chunks, figures));
}

/**
 * Non-streaming answer with token usage, for the eval harness.
 *
 * Uses the SAME `buildMessages` as the streaming path, so the prompt the
 * harness scores is byte-identical to the one production sends. Only the
 * transport differs — see the note on `LlmProvider.complete`.
 */
export function answerOnce(
  question: string,
  chunks: RetrievedChunk[],
  maxTokens?: number,
  model?: string,
): Promise<LlmCompletion> {
  return getLlm().complete(buildMessages(question, chunks), maxTokens, model);
}
