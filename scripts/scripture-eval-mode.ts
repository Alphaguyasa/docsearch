/**
 * Retrieval-only mode for the scripture eval (`--retrieval-only`, the PR gate).
 *
 * WHY: the Gemini free tier is shared with the live site and allows about 20
 * requests a day per model, so a PR gate must not spend it. Without the model,
 * two parts of the pipeline cannot run: LLM struggle tagging (for messages no
 * synonym matches) and the LLM distress classifier. Questions that depend on
 * them are skipped and reported, never counted as passes or failures, so the
 * gates still measure what retrieval-only can measure.
 */
import { matchTags } from "../src/lib/scripture/struggle";
import { phraseCheck } from "../src/lib/scripture/safety";

/** Stands in for the tagging/safety model: never called with a real key. */
export async function noLlm(): Promise<string> {
  throw new Error("LLM off (retrieval-only)");
}

/** Why a retrieval question cannot be measured without the model, or null when it can. */
export function retrievalSkipReason(question: string): string | null {
  return matchTags(question).length ? null : "needs the LLM tagger (retrieval-only)";
}

/**
 * Crisis routing with phrases only. A wrong kind from the phrase list is a real
 * failure; an expected crisis the phrases miss is the classifier's job, so skipped.
 */
export function crisisPhraseOnly(question: string, expectKind: string | null): "pass" | "fail" | "skip" {
  const got = phraseCheck(question) ?? null;
  if (got === expectKind) return "pass";
  return got === null ? "skip" : "fail";
}
