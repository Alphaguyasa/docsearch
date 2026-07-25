/**
 * Unlabelled near-duplicate detection. PURE FUNCTIONS — no I/O, no network.
 *
 * A golden set labels SOME chunks as relevant. If the corpus contains another
 * chunk that says substantially the same thing and is not labelled, then a
 * retriever that returns it is scored as WRONG — and recall understates the
 * system by however many such chunks exist. That is a false negative in the
 * ground truth, not in the retriever, and no amount of tuning will fix it.
 *
 * The check is deliberately advisory: it surfaces candidates for a human to
 * accept or reject. Auto-adding them would let the model that generated the
 * corpus decide what counts as correct, which is how a golden set stops being
 * ground truth.
 */

/**
 * pgvector round-trips as the text form "[0.1,0.2,...]" through PostgREST, but
 * some client paths hand back a real array. Accept both rather than assuming.
 */
export function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((n) => typeof n === "number") ? (value as number[]) : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const body = trimmed.slice(1, -1).trim();
  if (body === "") return null;

  const parts = body.split(",");
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
}

/**
 * Cosine similarity between two embedding vectors.
 *
 * Returns null on a dimension mismatch rather than a number — vectors of
 * different lengths mean two embedding models are mixed in one table, and
 * silently comparing a prefix would produce a plausible-looking score for
 * something meaningless.
 */
export function cosine(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface CandidateChunk {
  chunkId: string;
  docId: string;
  page: number | null;
  text: string;
  /** Rank in the question's top-k retrieval, 1-based. */
  rank: number;
}

/** A chunk the golden set already labels relevant, with its document. */
export interface LabelledChunk {
  chunkId: string;
  docId: string;
}

export interface NearDuplicate {
  candidate: CandidateChunk;
  /** The labelled relevant chunk it most closely matches. */
  labelledChunkId: string;
  similarity: number;
  /**
   * True when both chunks come from the same document — usually an adjacent
   * chunk sharing the overlap window, which is the most likely true positive.
   * A cross-document match is rarer and more interesting: genuinely duplicated
   * content, or a boilerplate section repeated across papers.
   */
  sameDocument: boolean;
}

export interface DuplicateScanResult {
  flagged: NearDuplicate[];
  /** Max similarity to a labelled chunk for EVERY unlabelled candidate,
   *  flagged or not — the distribution used to tune the threshold. */
  similarities: number[];
  /** Candidates skipped because an embedding was missing or malformed. */
  skipped: number;
}

/**
 * Find retrieved chunks that closely match a labelled relevant chunk but are
 * not themselves labelled.
 *
 * Similarity is measured chunk-to-chunk, not question-to-chunk. The question's
 * retrieval only decides which chunks are worth considering; whether a candidate
 * is a duplicate is a property of the two chunks. Comparing against the question
 * instead would flag anything topically related, which is most of the corpus.
 */
export function findUnlabelledNearDuplicates(
  labelledChunks: LabelledChunk[],
  candidates: CandidateChunk[],
  embeddings: Map<string, number[]>,
  threshold: number,
): DuplicateScanResult {
  const labelledIds = new Set(labelledChunks.map((c) => c.chunkId));
  const docOfLabelled = new Map(labelledChunks.map((c) => [c.chunkId, c.docId]));
  const flagged: NearDuplicate[] = [];
  const similarities: number[] = [];
  let skipped = 0;

  const labelledVectors = labelledChunks
    .map((c) => ({ id: c.chunkId, vector: embeddings.get(c.chunkId) }))
    .filter((entry): entry is { id: string; vector: number[] } => entry.vector !== undefined);

  // Without a single labelled vector there is nothing to compare against; every
  // candidate is reported as skipped rather than silently returning "clean".
  if (labelledVectors.length === 0) {
    return {
      flagged: [],
      similarities: [],
      skipped: candidates.filter((c) => !labelledIds.has(c.chunkId)).length,
    };
  }

  for (const candidate of candidates) {
    if (labelledIds.has(candidate.chunkId)) continue;

    const vector = embeddings.get(candidate.chunkId);
    if (!vector) {
      skipped++;
      continue;
    }

    let best = -1;
    let bestId: string | null = null;
    for (const labelled of labelledVectors) {
      const similarity = cosine(vector, labelled.vector);
      if (similarity === null) continue;
      if (similarity > best) {
        best = similarity;
        bestId = labelled.id;
      }
    }

    if (bestId === null) {
      skipped++;
      continue;
    }

    similarities.push(best);
    if (best >= threshold) {
      flagged.push({
        candidate,
        labelledChunkId: bestId,
        similarity: best,
        sameDocument: docOfLabelled.get(bestId) === candidate.docId,
      });
    }
  }

  return { flagged, similarities, skipped };
}

/** Percentiles for the threshold-tuning readout. */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index];
}
