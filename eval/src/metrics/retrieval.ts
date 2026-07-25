/**
 * Retrieval metrics. PURE FUNCTIONS ONLY — no I/O, no network, no database.
 *
 * Every metric returns `null` rather than 0 when the question has no ground
 * truth (an unanswerable question, where `relevantIds` is empty). That
 * distinction is load-bearing: an unanswerable question has no correct chunk to
 * retrieve, so scoring it 0 would silently drag every average down in
 * proportion to how many refusal questions the golden set contains — turning
 * "we test refusal properly" into "our retrieval looks worse". Callers average
 * over non-null values only.
 */
import type { Question, RetrievedChunk } from "../types";

/** Cutoffs every metric is reported at. */
export const K_VALUES = [1, 3, 5, 10, 20] as const;

export type MetricScores = Record<string, number | null>;

function topK(retrieved: RetrievedChunk[], k: number): RetrievedChunk[] {
  return retrieved.slice(0, Math.max(0, k));
}

/**
 * Fraction of the relevant chunks that appear in the top k.
 *
 * Denominator is the number of relevant chunks, so a question with 3 relevant
 * chunks scores 1/3 when one is found — recall of ground truth, not of the
 * result list.
 */
export function recallAtK(
  retrieved: RetrievedChunk[],
  relevantIds: string[],
  k: number,
): number | null {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0) return null;

  const found = new Set(
    topK(retrieved, k)
      .map((c) => c.chunkId)
      .filter((id) => relevant.has(id)),
  );
  return found.size / relevant.size;
}

/**
 * Fraction of the returned results that are relevant.
 *
 * The denominator is `min(k, retrieved.length)`, NOT k. Dividing by k would cap
 * a variant that returns 8 results at 0.4 for precision@20 purely because it was
 * configured to return fewer — and Phase 6's top-k sweep varies exactly that, so
 * the two arms would not be comparable. This measures precision of what the
 * system actually returned.
 */
export function precisionAtK(
  retrieved: RetrievedChunk[],
  relevantIds: string[],
  k: number,
): number | null {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0) return null;

  const window = topK(retrieved, k);
  if (window.length === 0) return 0;

  const hits = window.filter((c) => relevant.has(c.chunkId)).length;
  return hits / window.length;
}

/**
 * Reciprocal rank of the FIRST relevant chunk (1-based), or 0 if none appears.
 *
 * `k` is optional: omit it for the whole list, pass it to truncate. 0 and null
 * mean different things here — 0 is "ground truth exists and we missed it",
 * null is "there is no ground truth to find".
 */
export function mrr(
  retrieved: RetrievedChunk[],
  relevantIds: string[],
  k?: number,
): number | null {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0) return null;

  const window = k === undefined ? retrieved : topK(retrieved, k);
  const rank = window.findIndex((c) => relevant.has(c.chunkId));
  return rank === -1 ? 0 : 1 / (rank + 1);
}

/**
 * Normalised discounted cumulative gain with BINARY gains and a log2 discount.
 *
 * DCG  = Σ rel_i / log2(i + 1)  over the top k, i 1-based
 * IDCG = the same with every relevant chunk packed into the top positions
 *
 * Unlike recall, this rewards ranking relevant chunks HIGHER, not merely
 * retrieving them — so it is 1.0 exactly when the relevant chunks occupy the
 * leading positions.
 */
export function ndcgAtK(
  retrieved: RetrievedChunk[],
  relevantIds: string[],
  k: number,
): number | null {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0) return null;

  const discount = (position: number): number => 1 / Math.log2(position + 1);

  const dcg = topK(retrieved, k).reduce(
    (sum, chunk, i) => sum + (relevant.has(chunk.chunkId) ? discount(i + 1) : 0),
    0,
  );

  // Ideal ranking: every relevant chunk first, capped at k.
  const ideal = Math.min(relevant.size, Math.max(0, k));
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += discount(i + 1);

  // k <= 0 leaves nothing to score; guard rather than divide by zero.
  if (idcg === 0) return 0;
  return dcg / idcg;
}

/** 1 if ANY relevant chunk is in the top k, else 0. */
export function hitRateAtK(
  retrieved: RetrievedChunk[],
  relevantIds: string[],
  k: number,
): number | null {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0) return null;
  return topK(retrieved, k).some((c) => relevant.has(c.chunkId)) ? 1 : 0;
}

/**
 * Recall matched on `docId` rather than `chunkId`.
 *
 * Chunk-level recall punishes a near-miss chunk from the CORRECT document
 * exactly as hard as a chunk from the wrong document. Reporting both separates
 * "wrong document" from "wrong part of the right document" — and those drive
 * different fixes: the first is a retrieval problem, the second is a chunking
 * problem. A large gap between the two is the signal to go change chunk size.
 */
export function docLevelRecallAtK(
  retrieved: RetrievedChunk[],
  relevantDocIds: string[],
  k: number,
): number | null {
  const relevant = new Set(relevantDocIds);
  if (relevant.size === 0) return null;

  const found = new Set(
    topK(retrieved, k)
      .map((c) => c.docId)
      .filter((id) => relevant.has(id)),
  );
  return found.size / relevant.size;
}

/**
 * Every metric at every cutoff, as a flat record keyed `recall@10`, `ndcg@5`, …
 *
 * `mrr` (no suffix) is over the full result list; `mrr@k` truncates. Both are
 * reported because the unbounded figure is the one usually quoted, while the
 * truncated one is what a top-k comparison needs.
 */
export function scoreRetrieval(
  retrieved: RetrievedChunk[],
  question: Question,
): MetricScores {
  const { relevantChunkIds, relevantDocIds } = question;
  const scores: MetricScores = {
    mrr: mrr(retrieved, relevantChunkIds),
  };

  for (const k of K_VALUES) {
    scores[`recall@${k}`] = recallAtK(retrieved, relevantChunkIds, k);
    scores[`precision@${k}`] = precisionAtK(retrieved, relevantChunkIds, k);
    scores[`ndcg@${k}`] = ndcgAtK(retrieved, relevantChunkIds, k);
    scores[`hitRate@${k}`] = hitRateAtK(retrieved, relevantChunkIds, k);
    scores[`docRecall@${k}`] = docLevelRecallAtK(retrieved, relevantDocIds, k);
    scores[`mrr@${k}`] = mrr(retrieved, relevantChunkIds, k);
  }

  return scores;
}

/**
 * Mean over the non-null values of one metric across many questions.
 *
 * Returns null when every value is null — i.e. the metric is meaningless for
 * this set (all questions unanswerable) rather than zero.
 */
export function meanIgnoringNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}
