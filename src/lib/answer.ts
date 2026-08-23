/**
 * SERVER-ONLY. Cited answer generation over the Orthodox corpus.
 *
 * Three modes, because the site answers three genuinely different questions and
 * one prompt cannot serve all three without doing at least two of them badly:
 *
 *   "answer"   — a direct question. Answer it from the books, with citations.
 *   "compare"  — "what does each book say about X". Go through the sources one
 *                by one and report each on its own terms, including where they
 *                differ.
 *   "counsel"  — someone describing their own life. Bring what the Fathers,
 *                the sayings and the scriptures actually say to that situation.
 *
 * WHAT ALL THREE SHARE, and what must never be relaxed: every claim is grounded
 * in a supplied passage and carries its citation, and a question the passages do
 * not cover gets a plain refusal rather than an answer from general knowledge.
 * That constraint is the whole value of the thing. A site that answers Orthodox
 * questions from a model's memory of the internet is worse than no site — it
 * will be confidently wrong about which Church holds what, and the reader has no
 * way to tell.
 *
 * Generation goes through the provider-agnostic llm.ts; this module never names
 * a concrete provider. Never import into a client component.
 */
import type { LlmCompletion, LlmMessage } from "./llm";
import { getLlm } from "./llm";
import type { RetrievedChunk } from "./retrieve";

/**
 * The refusal must contain this exact phrase and no citation markers, so the
 * unanswerable eval questions (u01–u05) can be checked mechanically. Every mode
 * instructs the model to produce it verbatim.
 */
export const NOT_COVERED_PHRASE = "not covered by these documents";

export type AnswerMode = "answer" | "compare" | "counsel";

export const ANSWER_MODES: AnswerMode[] = ["answer", "compare", "counsel"];

export function isAnswerMode(value: string): value is AnswerMode {
  return (ANSWER_MODES as string[]).includes(value);
}

/**
 * The rules that hold in every mode. Kept as one shared block rather than
 * copied into three prompts: a grounding rule that drifts between modes is a
 * grounding rule that will eventually be missing from one of them.
 */
const SHARED_RULES = [
  "You answer only from the numbered passages supplied below. Each passage is",
  "labelled [n] with the work it comes from, its author where known, the",
  "tradition that holds it, and a reference the reader can look up.",
  "",
  "Rules — these hold absolutely:",
  "1. Use ONLY what is in the passages. Never add anything from your own prior",
  "   knowledge of Orthodoxy, scripture, history or the Fathers, however certain",
  "   you are of it. If you know something the passages do not say, it does not",
  "   go in the answer.",
  "2. End every factual claim with the citation it came from: [1], or [2][3].",
  "   A claim with no citation is not allowed.",
  "3. Attribute correctly. Say which Father, which book or which council a",
  "   statement comes from — not a bare 'the Church teaches'. A desert elder's",
  "   saying, one Father's opinion and a canon of an Ecumenical Council carry",
  "   different weight, and the reader must be able to see which they are being",
  "   given.",
  "4. Where a passage is marked as belonging to one tradition (Eastern Orthodox",
  "   or Oriental Orthodox) and not the other, say so. Never present a text one",
  "   communion rejects as though both received it. Where the passage is from",
  "   the undivided Church, it belongs to both, and you may say that.",
  `5. If the passages do not contain what is needed, reply with exactly this one`,
  `   sentence: "This question is ${NOT_COVERED_PHRASE}." Write nothing else and`,
  "   include no citation markers. Do not guess, and do not fill the gap from",
  "   memory.",
].join("\n");

const MODE_INSTRUCTIONS: Record<AnswerMode, string> = {
  answer: [
    "Answer the question directly, in a few clear paragraphs.",
    "",
    "Lead with the answer itself rather than with preamble. Where the sources",
    "agree, say so once and cite them together. Where they differ, say that",
    "plainly and give each position with its own citation — a real disagreement",
    "between Fathers is part of the answer, not a problem to smooth over.",
  ].join("\n"),

  compare: [
    "The reader wants to know what EACH source says, not a merged summary.",
    "",
    "Go through the works one at a time. For each one, give it its own short",
    "section headed with the work and its author, and say what that particular",
    "source says, with citations. Keep each source's own emphasis and wording",
    "rather than flattening them into a common paraphrase — the differences",
    "between how St Ephrem and St Athanasius treat a subject are exactly what",
    "was asked for.",
    "",
    "Group Eastern Orthodox, Oriental Orthodox and shared (pre-Chalcedonian)",
    "sources so the reader can see which tradition each belongs to.",
    "",
    "Close with a short paragraph on where the sources agree and where they",
    "genuinely diverge. If they all say substantially the same thing, say that",
    "rather than manufacturing a contrast.",
  ].join("\n"),

  counsel: [
    "Someone is describing a situation in their own life and asking what the",
    "tradition says to it. Answer them as a reader who has the books open, not",
    "as a therapist and not as a priest.",
    "",
    "Do this:",
    "  - Address the situation they actually described, not a general topic.",
    "  - Bring what the sources concretely say to it: the sayings of the desert",
    "    fathers, the counsel of the Fathers, the scriptures, and the lives of",
    "    the saints who faced something similar. Quote them; their own words",
    "    carry more than a paraphrase.",
    "  - Where a saint or a person in these texts went through the same thing,",
    "    say what happened to them and cite it.",
    "  - Keep a gentle and unhurried tone. Do not moralise, do not diagnose, and",
    "    do not tell them what their situation means about them.",
    "",
    "Do not do this:",
    "  - Do not give medical, psychiatric or legal advice.",
    "  - Do not present the Fathers as a treatment for a mental illness. Ancient",
    "    ascetic counsel about despondency is not a substitute for care, and",
    "    offering it as one would harm someone who needs a doctor.",
    "  - Do not invent consolation that is not in the passages. If the sources",
    "    are silent on their situation, say so honestly — that is more use to",
    "    them than a comforting sentence you made up.",
    "",
    "End with one short line, in your own words, noting that these are books and",
    "not a substitute for speaking with their priest or spiritual father. If",
    "what they describe involves danger to their life or someone else's, say",
    "clearly and first that they should reach out to emergency services or a",
    "crisis line where they live, before anything you quote.",
  ].join("\n"),
};

/** How a passage is labelled in the context block. */
function formatChunk(chunk: RetrievedChunk, n: number): string {
  const parts: string[] = [chunk.title];
  if (chunk.author) parts.push(chunk.author);

  // The tradition label is what lets rule 4 be followed. Rendered in words
  // rather than as the raw enum, so the model is reading a description of the
  // passage and not a database value.
  if (chunk.tradition === "eastern") parts.push("Eastern Orthodox");
  else if (chunk.tradition === "oriental") parts.push("Oriental Orthodox");
  else if (chunk.tradition === "both") parts.push("received by both traditions");

  if (chunk.century) parts.push(`${chunk.century}th century`);

  // Prefer the real reference; fall back to a page for anything ingested
  // before the corpus carried structure.
  const locator =
    chunk.reference ?? (chunk.pageNumber === null ? null : `p.${chunk.pageNumber}`);
  if (locator) parts.push(locator);

  return `[${n}] (${parts.join("; ")})\n${chunk.content}`;
}

/**
 * Build the system + user messages for a question, its mode and its passages.
 *
 * Exported for the eval harness, which scores the exact prompt production
 * sends rather than a reconstruction of it.
 */
export function buildMessagesForMode(
  question: string,
  chunks: RetrievedChunk[],
  mode: AnswerMode,
): LlmMessage[] {
  const context = chunks.map((chunk, i) => formatChunk(chunk, i + 1)).join("\n\n");

  const system = [
    "You are a careful reader of the Orthodox Christian tradition, serving both",
    "the Eastern Orthodox and the Oriental Orthodox Churches.",
    "",
    SHARED_RULES,
    "",
    "For this request:",
    MODE_INSTRUCTIONS[mode],
  ].join("\n");

  const user = `Passages:\n\n${context}\n\nQuestion: ${question}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Default-mode prompt builder.
 *
 * Kept as a named export with its original signature because the eval harness
 * and its cached runs are keyed on it; adding the mode as a third parameter
 * with a default would have changed no call site but also would not have made
 * that guarantee explicit.
 */
export function buildMessages(
  question: string,
  chunks: RetrievedChunk[],
): LlmMessage[] {
  return buildMessagesForMode(question, chunks, "answer");
}

/**
 * Stream an answer for `question` grounded in `chunks`, as text deltas.
 * Provider selection is handled entirely inside llm.ts.
 */
export function streamAnswer(
  question: string,
  chunks: RetrievedChunk[],
  mode: AnswerMode = "answer",
): AsyncIterable<string> {
  return getLlm().stream(buildMessagesForMode(question, chunks, mode));
}

/**
 * Non-streaming answer with token usage, for the eval harness.
 *
 * Uses the SAME prompt builder as the streaming path, so the prompt the harness
 * scores is byte-identical to the one production sends. Only the transport
 * differs — see the note on `LlmProvider.complete`.
 */
export function answerOnce(
  question: string,
  chunks: RetrievedChunk[],
  maxTokens?: number,
  model?: string,
  mode: AnswerMode = "answer",
): Promise<LlmCompletion> {
  return getLlm().complete(buildMessagesForMode(question, chunks, mode), maxTokens, model);
}
