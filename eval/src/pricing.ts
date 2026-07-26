/**
 * USD per 1,000,000 tokens, broken out by pipeline stage.
 *
 * READ FROM THE VENDORS' PRICING PAGES, NOT GUESSED. Sources:
 *   Voyage    — https://docs.voyageai.com/docs/pricing   (fetched 2026-07-26)
 *   Anthropic — https://platform.claude.com/docs/en/pricing  (fetched 2026-07-26)
 *
 * A wrong constant here does not fail — it silently produces a cost column that
 * looks authoritative and ranks variants incorrectly, which is worse than no
 * cost column at all. Re-check both pages before quoting these numbers in a
 * writeup, and update the fetch dates above when you do.
 *
 * ON THE FREE ALLOCATIONS. Voyage gives every account its first 200M tokens
 * free across embeddings AND rerankers, and this project's Gemini tier bills
 * nothing. So `costUsd` on the current setup is a LIST-PRICE UPPER BOUND, not a
 * statement about the bill. That is deliberate: recording 0 everywhere would
 * make cost useless as an experiment axis — you could not tell a variant that
 * reranks 50 candidates from one that doesn't. Gemini stays at 0 because the
 * free tier is what the harness actually runs on and eval/src/provider.ts
 * already records it that way; mixing a notional paid Gemini rate in here would
 * make the two disagree.
 */

export interface TokenPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Stages are separate maps so a report can attribute spend, per the spec. */
export const PRICING: {
  embed: Record<string, TokenPrice>;
  rerank: Record<string, TokenPrice>;
  generate: Record<string, TokenPrice>;
  judge: Record<string, TokenPrice>;
} = {
  // Embeddings are input-only; output is not billed.
  embed: {
    // https://docs.voyageai.com/docs/pricing — $0.06 / 1M tokens.
    "voyage-4": { inputPerMTok: 0.06, outputPerMTok: 0 },
    "voyage-3.5": { inputPerMTok: 0.06, outputPerMTok: 0 },
  },

  // Rerankers bill the concatenated query+documents as input.
  rerank: {
    // https://docs.voyageai.com/docs/pricing — $0.05 and $0.02 / 1M tokens.
    "rerank-2.5": { inputPerMTok: 0.05, outputPerMTok: 0 },
    "rerank-2.5-lite": { inputPerMTok: 0.02, outputPerMTok: 0 },
  },

  generate: {
    // https://platform.claude.com/docs/en/pricing
    "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
    "claude-haiku-4-5-20251001": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
    // Sonnet 5 list is $3/$15; an introductory $2/$10 runs through 2026-08-31.
    // List is recorded so a cost comparison does not silently change when the
    // promotion ends.
    "claude-sonnet-5": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
    // Free tier — see the header. Matches eval/src/provider.ts.
    "gemini-flash-latest": { inputPerMTok: 0, outputPerMTok: 0 },
    "gemini-flash-lite-latest": { inputPerMTok: 0, outputPerMTok: 0 },
  },

  judge: {
    "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
    "claude-haiku-4-5-20251001": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
    "gemini-flash-latest": { inputPerMTok: 0, outputPerMTok: 0 },
    "gemini-flash-lite-latest": { inputPerMTok: 0, outputPerMTok: 0 },
  },
};

export type Stage = keyof typeof PRICING;

export interface StageUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Cost of one call. An unpriced model returns 0 AND warns once — silently
 * costing nothing is how a mispriced experiment ships.
 */
const warned = new Set<string>();

export function costOf(stage: Stage, model: string, usage: StageUsage): number {
  const price = PRICING[stage][model];
  if (!price) {
    const key = `${stage}:${model}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(
        `  [pricing] no ${stage} price for "${model}" — counting it as $0. ` +
          `Add it to eval/src/pricing.ts or the cost column will understate.`,
      );
    }
    return 0;
  }
  return (
    (usage.inputTokens / 1e6) * price.inputPerMTok +
    (usage.outputTokens / 1e6) * price.outputPerMTok
  );
}

/** Per-stage cost breakdown for one question. */
export interface CostBreakdown {
  embed: number;
  rerank: number;
  generate: number;
  judge: number;
  total: number;
}

export function emptyCost(): CostBreakdown {
  return { embed: 0, rerank: 0, generate: 0, judge: 0, total: 0 };
}
