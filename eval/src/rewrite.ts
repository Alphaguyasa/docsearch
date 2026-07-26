/**
 * Query rewriting: `none` | `hyde` | `decompose` (experiment 5).
 *
 * WHY REWRITE AT ALL. A question and the passage answering it are written in
 * different registers — the question asks, the passage asserts. Embedding the
 * question directly compares an interrogative against declaratives.
 *
 *   hyde      — have the model write a hypothetical ANSWER and retrieve with
 *               that instead. The fake answer is in the same register as the
 *               real passage, so the vectors sit closer together. It does not
 *               matter that the invented facts are wrong; only the shape is used.
 *   decompose — split a multi-part question into sub-questions and retrieve for
 *               each, then union. Aimed at multi-hop, where no single chunk
 *               answers the whole question and one query can only find one half.
 *
 * Rewrites go through the eval provider (cached, rate-limited), NOT the app's
 * generation path: this is harness machinery, not something production does, and
 * routing it through the same cache means a re-run of an unchanged variant costs
 * nothing.
 */
import { completeCached, getProvider, parseJsonLoose, type LLMProvider } from "./provider";
import type { QueryRewrite } from "./types";

export interface RewriteResult {
  /** Queries to retrieve with. Always non-empty; `none` returns the original. */
  queries: string[];
  /** What the rewriter produced, for the run record. Null when mode is `none`. */
  rewritten: string | null;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

const HYDE_PROMPT = [
  "Write a short passage that would appear in a technical document and would",
  "answer the question below. Two to four sentences.",
  "",
  "Write it as a factual passage, not as an answer to a question — no 'The",
  "answer is', no addressing the reader. Invented specifics are fine: this text",
  "is used only to match against real documents by writing style and topic, and",
  "is never shown to anyone or treated as true.",
  "",
  "Return ONLY the passage. No preamble, no markdown, no quotes.",
].join("\n");

const DECOMPOSE_PROMPT = [
  "Break the question below into the smallest set of standalone sub-questions",
  "that must each be answered to answer it fully.",
  "",
  "Rules:",
  "- If the question is already single-part, return it unchanged as the only item.",
  "- Each sub-question must stand alone: no pronouns referring to the original,",
  "  no 'it' or 'that' — repeat the subject in full.",
  "- At most 4. Fewer is better.",
  "",
  'Return JSON: {"subQuestions": string[]}',
].join("\n");

export async function rewriteQuery(
  question: string,
  mode: QueryRewrite,
  provider: LLMProvider = getProvider(),
): Promise<RewriteResult> {
  if (mode === "none") {
    return {
      queries: [question],
      rewritten: null,
      usage: NO_USAGE,
      model: provider.model,
    };
  }

  if (mode === "hyde") {
    const res = await completeCached(provider, `${HYDE_PROMPT}\n\nQUESTION: ${question}`, {
      json: false,
    });
    const passage = res.text.trim();
    // An empty or failed rewrite falls back to the original question rather
    // than retrieving on "" — a variant that silently retrieves nothing would
    // look like catastrophic retrieval failure instead of a rewriter problem.
    return {
      queries: passage ? [passage] : [question],
      rewritten: passage || null,
      usage: res.usage,
      model: provider.model,
    };
  }

  const res = await completeCached(
    provider,
    `${DECOMPOSE_PROMPT}\n\nQUESTION: ${question}`,
    { json: true },
  );

  let subQuestions: string[] = [];
  try {
    const parsed = parseJsonLoose<{ subQuestions?: unknown }>(res.text);
    if (Array.isArray(parsed.subQuestions)) {
      subQuestions = parsed.subQuestions
        .filter((q): q is string => typeof q === "string")
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 4);
    }
  } catch {
    // Fall through to the original question.
  }

  // The original is always retrieved too. Decomposition can lose the question's
  // framing entirely, and dropping it would make decompose strictly worse than
  // none on any question the split handles badly.
  const queries = subQuestions.length > 0 ? [question, ...subQuestions] : [question];

  return {
    queries,
    rewritten: subQuestions.length > 0 ? subQuestions.join(" | ") : null,
    usage: res.usage,
    model: provider.model,
  };
}
