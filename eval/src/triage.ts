/**
 * Review triage. PURE FUNCTIONS — no I/O, no network.
 *
 * Shrinks the review pile without ever making the accept/reject call. Two
 * signals, both advisory:
 *
 *  1. LEXICAL — the question reuses its source chunk's distinctive vocabulary.
 *     These are the candidates that inflate every retrieval metric while
 *     teaching you nothing: the retriever matches on a rare shared term rather
 *     than on meaning, so recall looks high and means nothing.
 *
 *  2. DUPLICATE — the question is a near-restatement of one already accepted or
 *     already drafted in this batch. Duplicates silently reweight the golden
 *     set toward whatever they duplicate.
 *
 * Nothing here rejects anything. Flagged candidates are sorted to the END of the
 * review queue so they can be culled in one pass, but every one of them still
 * goes in front of a human.
 */

/** Ordinary English words plus question scaffolding, which carry no signal. */
const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "all", "also", "am", "an", "and",
  "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "cannot", "could", "did", "do", "does",
  "doing", "done", "down", "during", "each", "few", "for", "from", "further",
  "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his",
  "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "may",
  "me", "might", "more", "most", "must", "my", "no", "nor", "not", "of", "off",
  "on", "once", "only", "or", "other", "ought", "our", "ours", "out", "over",
  "own", "same", "shall", "she", "should", "so", "some", "such", "than", "that",
  "the", "their", "theirs", "them", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we",
  "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "would", "you", "your", "yours",
  // Question scaffolding — shared by every question, so pure noise here.
  "according", "describe", "explain", "given", "list", "many", "much", "state",
  "used", "using", "within",
]);

/**
 * Deliberately conservative stemmer: plurals and third-person -s only, plus
 * -ies -> -y.
 *
 * Without any stemming, "calibrates" and "calibrate" read as different terms and
 * a question that lifts the passage's wording verbatim-but-inflected scores low
 * — the exact case the lexical flag exists to catch. Full Porter stemming would
 * catch more but also conflates unrelated words, and a false lexical flag costs
 * reviewer trust in every other flag. This handles the common inflection and
 * stops there.
 */
function stem(term: string): string {
  if (term.length <= 3) return term;
  // "verifies" -> "verify", but not "series" (vowel before -ies).
  if (/[^aeiou]ies$/.test(term)) return `${term.slice(0, -3)}y`;
  // Never strip from "process", "status", "analysis".
  if (/(ss|us|is)$/.test(term)) return term;
  if (term.endsWith("s")) return term.slice(0, -1);
  return term;
}

/**
 * Content terms: lowercased, stopworded, stemmed, length >= 2.
 *
 * Digits are deliberately KEPT and never stemmed. Numbers, dates, and IDs are
 * exactly the tokens a near-miss unanswerable question turns on, and dropping
 * them would blind the lexical check to the most important overlap there is.
 */
export function contentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => (/^\d+$/.test(t) ? t : stem(t)));
}

export type IdfIndex = Map<string, number>;

/**
 * Inverse document frequency over the corpus.
 *
 * A term appearing in one chunk of 2,000 is distinctive; one appearing in half
 * of them is not. Weighting by IDF is what makes "rare terms" precise rather
 * than a hand-tuned list.
 */
export function buildIdf(documents: string[]): IdfIndex {
  const n = documents.length;
  const df = new Map<string, number>();

  for (const doc of documents) {
    for (const term of new Set(contentTerms(doc))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const idf: IdfIndex = new Map();
  for (const [term, count] of df) idf.set(term, Math.log(n / (1 + count)) + 1);
  return idf;
}

/** IDF of an unseen term: maximally distinctive, so treat df as 0. */
export function idfOf(idf: IdfIndex, term: string, corpusSize: number): number {
  return idf.get(term) ?? Math.log(corpusSize || 1) + 1;
}

/**
 * How much of the question's distinctive vocabulary is lifted from the chunk,
 * in 0..1. 1.0 means every rare word in the question also appears in its source.
 *
 * NOTE — this is IDF-weighted CONTAINMENT, not raw Jaccard. Jaccard divides by
 * the union, and a chunk runs hundreds of terms against a question's ten or so,
 * so the union is almost entirely chunk terms and the score collapses toward
 * zero for every candidate, good or bad. Containment measures the thing we
 * actually care about — reuse of the source's wording — and stays comparable
 * across chunk lengths.
 */
export function lexicalOverlap(
  question: string,
  chunk: string,
  idf: IdfIndex,
  corpusSize: number,
): number {
  const qTerms = [...new Set(contentTerms(question))];
  if (qTerms.length === 0) return 0;

  const chunkTerms = new Set(contentTerms(chunk));

  let shared = 0;
  let total = 0;
  for (const term of qTerms) {
    const weight = idfOf(idf, term, corpusSize);
    total += weight;
    if (chunkTerms.has(term)) shared += weight;
  }
  return total === 0 ? 0 : shared / total;
}

/** IDF-weighted term-frequency vector, L2-normalised. */
function termVector(text: string, idf: IdfIndex, corpusSize: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of contentTerms(text)) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }

  const vector = new Map<string, number>();
  let norm = 0;
  for (const [term, count] of counts) {
    const weight = count * idfOf(idf, term, corpusSize);
    vector.set(term, weight);
    norm += weight * weight;
  }

  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  for (const [term, weight] of vector) vector.set(term, weight / norm);
  return vector;
}

/**
 * Cosine similarity between two questions, over IDF-weighted term vectors.
 *
 * Deliberately NOT embedding-based. Embeddings would be a better semantic
 * signal, but they would spend the same rate-limited quota the harness needs for
 * generation and judging, and would make triage non-deterministic across runs.
 * For catching near-restatements this is sufficient, and it costs nothing.
 */
export function cosineSimilarity(
  a: string,
  b: string,
  idf: IdfIndex,
  corpusSize: number,
): number {
  const va = termVector(a, idf, corpusSize);
  const vb = termVector(b, idf, corpusSize);

  // Iterate the smaller vector; terms absent from the other contribute nothing.
  const [small, large] = va.size <= vb.size ? [va, vb] : [vb, va];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  return dot;
}

export type SuspectFlag = "lexical" | "duplicate";

export interface TriageInput {
  id: string;
  question: string;
  /** Concatenated source chunk text. Empty for unanswerable questions. */
  sourceText: string;
}

export interface TriageResult {
  id: string;
  flag: SuspectFlag | null;
  detail: string | null;
  lexicalOverlap: number;
  nearestId: string | null;
  nearestSimilarity: number;
}

export interface TriageOptions {
  /** Flag above this IDF-weighted containment. */
  lexicalThreshold: number;
  /** Flag above this cosine similarity to an earlier/accepted question. */
  duplicateThreshold: number;
  /** Questions already accepted in previous review sessions. */
  accepted?: { id: string; question: string }[];
}

/**
 * Flag candidates for review triage.
 *
 * Duplicate takes precedence over lexical: a near-restatement is decided by
 * comparison with another question, which is the more clear-cut cull.
 *
 * Each candidate is compared against previously accepted questions AND against
 * candidates earlier in this batch, so a pair of near-identical drafts flags the
 * second rather than both — the first still deserves a fair look.
 */
export function triageCandidates(
  candidates: TriageInput[],
  idf: IdfIndex,
  corpusSize: number,
  options: TriageOptions,
): TriageResult[] {
  const seen: { id: string; question: string }[] = [...(options.accepted ?? [])];
  const results: TriageResult[] = [];

  for (const candidate of candidates) {
    let nearestId: string | null = null;
    let nearestSimilarity = 0;

    for (const prior of seen) {
      const similarity = cosineSimilarity(candidate.question, prior.question, idf, corpusSize);
      if (similarity > nearestSimilarity) {
        nearestSimilarity = similarity;
        nearestId = prior.id;
      }
    }

    // Unanswerable questions have no source chunk, so there is no wording to
    // have lifted — the lexical signal simply does not apply.
    const overlap = candidate.sourceText
      ? lexicalOverlap(candidate.question, candidate.sourceText, idf, corpusSize)
      : 0;

    let flag: SuspectFlag | null = null;
    let detail: string | null = null;

    if (nearestId !== null && nearestSimilarity >= options.duplicateThreshold) {
      flag = "duplicate";
      detail = `${nearestSimilarity.toFixed(2)} cosine vs ${nearestId}`;
    } else if (candidate.sourceText && overlap >= options.lexicalThreshold) {
      flag = "lexical";
      detail =
        `${(overlap * 100).toFixed(0)}% of the question's distinctive terms ` +
        `also appear in its source chunk`;
    }

    results.push({
      id: candidate.id,
      flag,
      detail,
      lexicalOverlap: overlap,
      nearestId,
      nearestSimilarity,
    });

    seen.push({ id: candidate.id, question: candidate.question });
  }

  return results;
}

/** Clean candidates first, flagged ones last, original order kept within each. */
export function sortForReview<T extends { suspect?: SuspectFlag | null }>(items: T[]): T[] {
  const rank = (item: T): number => (item.suspect ? 1 : 0);
  return [...items].sort((a, b) => rank(a) - rank(b));
}
