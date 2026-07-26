/**
 * Voyage reranking, for the `rerank` arm of experiment 4.
 *
 * A cross-encoder scores (query, document) pairs jointly instead of comparing
 * two independent embeddings, so it sees interactions a bi-encoder cannot — at
 * the cost of one API call over the top-N candidates. The pipeline uses it to
 * reorder a wide retrieval down to a narrow, better-ordered top-k.
 *
 * REST via fetch, no SDK — the project convention (CLAUDE.md).
 */
import { config } from "../../src/lib/env";

const RERANK_URL = "https://api.voyageai.com/v1/rerank";

/** Priced in eval/src/pricing.ts. rerank-2.5-lite is the cheaper arm. */
export const DEFAULT_RERANK_MODEL = "rerank-2.5";

export interface RerankCandidate {
  chunkId: string;
  text: string;
}

export interface RerankedChunk {
  chunkId: string;
  /** Relevance score from the cross-encoder, higher is better. */
  score: number;
}

export interface RerankResult {
  ranked: RerankedChunk[];
  usage: { totalTokens: number };
}

interface VoyageRerankResponse {
  data?: { index: number; relevance_score: number }[];
  usage?: { total_tokens?: number };
}

/**
 * Rerank `candidates` against `query`, returning at most `topN`, best first.
 *
 * Returns the input order untouched when there is nothing to do, so a variant
 * with rerank enabled on an empty retrieval behaves like one without it rather
 * than spending a call on zero documents.
 */
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  options: { model?: string; topN?: number } = {},
): Promise<RerankResult> {
  const model = options.model ?? DEFAULT_RERANK_MODEL;
  const topN = options.topN ?? candidates.length;

  if (candidates.length === 0) {
    return { ranked: [], usage: { totalTokens: 0 } };
  }

  const res = await fetch(RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      query,
      documents: candidates.map((c) => c.text),
      top_k: Math.min(topN, candidates.length),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Voyage rerank failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`,
    );
  }

  const json = (await res.json()) as VoyageRerankResponse;
  const rows = json.data ?? [];

  // Voyage returns positions into the documents array. An out-of-range index
  // would silently mis-attribute a score to the wrong chunk, which is the kind
  // of bug that shows up only as slightly-wrong metrics — so it throws.
  const ranked: RerankedChunk[] = rows.map((row) => {
    const candidate = candidates[row.index];
    if (!candidate) {
      throw new Error(
        `Voyage rerank returned index ${row.index} for ${candidates.length} document(s).`,
      );
    }
    return { chunkId: candidate.chunkId, score: row.relevance_score };
  });

  // Sort defensively: the API documents descending order, but relying on it
  // silently would make a future change look like a retrieval regression.
  ranked.sort((a, b) => b.score - a.score);

  return { ranked, usage: { totalTokens: json.usage?.total_tokens ?? 0 } };
}
