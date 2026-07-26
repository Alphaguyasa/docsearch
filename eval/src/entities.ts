/**
 * Corpus sampling and entity extraction. PURE FUNCTIONS — no I/O, no network.
 *
 * Split from corpus.ts so these can be unit-tested without database
 * credentials: corpus.ts imports the shared db client, and that client validates
 * SUPABASE_URL et al at module load. Same arrangement as duplicates.ts and
 * triage.ts, for the same reason.
 */

export interface CorpusChunk {
  id: string;
  documentId: string;
  filename: string;
  title: string;
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
}


/**
 * Deterministic PRNG (mulberry32) so a given --seed always samples the same
 * chunks. Phase 5 uses the same generator for the bootstrap, for the same
 * reason: a sampled result nobody can reproduce is not evidence.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sample up to `perDoc` chunks from EACH document.
 *
 * Stratifying this way is the point: sampling `n` chunks globally would let one
 * long document dominate the golden set, and every metric computed on it would
 * then really be a metric about that document.
 */
export function sampleStratified(
  corpus: CorpusChunk[],
  perDoc: number,
  rand: () => number,
): CorpusChunk[] {
  const byDoc = new Map<string, CorpusChunk[]>();
  for (const chunk of corpus) {
    const list = byDoc.get(chunk.documentId);
    if (list) list.push(chunk);
    else byDoc.set(chunk.documentId, [chunk]);
  }

  const picked: CorpusChunk[] = [];
  for (const chunks of byDoc.values()) {
    picked.push(...shuffle(chunks, rand).slice(0, perDoc));
  }
  return picked;
}

/**
 * Words that are capitalised for reasons other than being a named entity.
 *
 * SCOPE OF THIS LIST, deliberately narrow: only words capitalised by English
 * orthography (sentence starts, discourse connectives) or by document structure
 * (section headings). Those are properties of written English, not of any
 * particular corpus, so no amount of corpus statistics will identify them —
 * a connective that happened to be rare would sail through an IDF filter.
 *
 * Corpus-generic terms are NOT listed here. "BERT", "English", and "Proceedings"
 * are useless as shared entities on an NLP-paper corpus and highly distinctive
 * on another, so they are filtered by document frequency instead — see
 * buildEntityIndex. Hand-listing them would be a threshold in disguise, tuned to
 * one corpus and silently wrong on the next.
 */
const ENTITY_STOPWORDS = new Set([
  // Determiners, pronouns, prepositions, auxiliaries — sentence-initial capitals.
  "The", "This", "That", "These", "Those", "A", "An", "And", "But", "Or", "If",
  "When", "While", "For", "From", "With", "Without", "All", "Any", "Each",
  "Every", "No", "Not", "In", "On", "At", "To", "By", "As", "It", "Its", "We",
  "You", "They", "He", "She", "There", "Here", "Page", "Section", "Table",
  "Figure", "Note", "Notes", "Appendix", "Chapter", "Part", "Article", "Item",
  "Where", "What", "Which", "Who", "How", "Why", "Then", "Than", "Also", "Such",
  "Both", "Either", "Neither", "Per", "Via", "Are", "Is", "Was", "Were", "Be",
  "Been", "Has", "Have", "Had", "Will", "Shall", "May", "Must", "Should",
  // Discourse connectives. Measured as the top "shared entities" on this corpus:
  // "However" alone matched 617 chunk pairs, none of which shared a subject.
  "However", "Therefore", "Thus", "Hence", "Moreover", "Furthermore",
  "Additionally", "Similarly", "Consequently", "Nevertheless", "Nonetheless",
  "Specifically", "Notably", "Importantly", "Interestingly", "Finally",
  "First", "Firstly", "Second", "Secondly", "Third", "Thirdly", "Fourth",
  "Fifth", "Lastly", "Next", "Overall", "Instead", "Meanwhile", "Although",
  "Though", "Since", "Because", "Given", "Unlike", "Whereas", "Indeed",
  "Recently", "Currently", "Previously", "Following", "During", "After",
  "Before", "Above", "Below", "Here", "Now", "Once", "Further", "Rather",
  "Together", "Alternatively", "Conversely", "Accordingly", "Subsequently",
  // Section headings — structural, not subjects.
  "Abstract", "Introduction", "Background", "Method", "Methods", "Methodology",
  "Approach", "Experiments", "Experiment", "Evaluation", "Results", "Result",
  "Discussion", "Conclusion", "Conclusions", "References", "Acknowledgments",
  "Acknowledgements", "Related", "Work", "Limitations", "Appendices",
]);

/**
 * Extract candidate named entities: runs of capitalised words, plus bare
 * acronyms. Crude, but it only has to be good enough to find two chunks in
 * different documents that plausibly share a subject for a multi-hop question —
 * the model then decides whether a real two-chunk question exists.
 */
export function namedEntities(text: string): Set<string> {
  return new Set(entityMentions(text).keys());
}

/**
 * Entities with how many times each is mentioned — local salience.
 *
 * Rarity alone is not enough to anchor a multi-hop question. On an academic
 * corpus the rarest shared entities are overwhelmingly bibliographic: author
 * surnames, affiliations, and place names that appear ONCE each in a reference
 * list. Two papers citing the same author share a citation, not a subject, and a
 * model asked to bridge them correctly refuses.
 *
 * A subject the passage is actually about gets mentioned repeatedly; a citation
 * appears once. Counting mentions is what separates the two, and it costs one
 * extra integer per entity.
 */
export function entityMentions(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (key: string): void => {
    out.set(key, (out.get(key) ?? 0) + 1);
  };

  for (const match of text.matchAll(/\b[A-Z][a-zA-Z0-9'-]+(?:\s+[A-Z][a-zA-Z0-9'-]+)*/g)) {
    const phrase = match[0].trim();
    const words = phrase.split(/\s+/);
    // A single capitalised word is usually just a sentence start; require either
    // a multi-word phrase or a word that isn't a common stopword.
    if (words.length === 1 && ENTITY_STOPWORDS.has(words[0])) continue;
    const meaningful = words.filter((w) => !ENTITY_STOPWORDS.has(w));
    if (meaningful.length === 0) continue;
    if (phrase.length < 4) continue;
    bump(meaningful.join(" "));
  }

  for (const match of text.matchAll(/\b[A-Z]{2,}(?:-[A-Z0-9]+)?\b/g)) {
    if (match[0].length >= 2 && !ENTITY_STOPWORDS.has(match[0])) bump(match[0]);
  }

  return out;
}

/**
 * How many DISTINCT DOCUMENTS each entity appears in, over the whole corpus.
 *
 * Documents, not chunks, is the right unit: the question being asked of an
 * entity is "does this name pick out a specific subject shared by these two
 * papers", and an entity appearing in 60 of 90 papers does not, however many
 * chunks it occupies within them.
 *
 * Built over the FULL corpus rather than the sampled subset — an entity's rarity
 * is a fact about the collection, and measuring it on 270 sampled chunks would
 * make every entity look rarer than it is.
 */
export interface EntityIndex {
  documentFrequency: Map<string, number>;
  documentCount: number;
}

export function buildEntityIndex(corpus: CorpusChunk[]): EntityIndex {
  const docsOf = new Map<string, Set<string>>();
  const documents = new Set<string>();

  for (const chunk of corpus) {
    documents.add(chunk.documentId);
    for (const entity of namedEntities(chunk.content)) {
      const seen = docsOf.get(entity);
      if (seen) seen.add(chunk.documentId);
      else docsOf.set(entity, new Set([chunk.documentId]));
    }
  }

  const documentFrequency = new Map<string, number>();
  for (const [entity, docs] of docsOf) documentFrequency.set(entity, docs.size);
  return { documentFrequency, documentCount: documents.size };
}

/**
 * Inverse document frequency of an entity. Higher means more distinctive.
 *
 * Same form as buildIdf in triage.ts — log(N / (1 + df)) + 1 — so the two
 * specificity scores in this harness are on a comparable scale.
 */
export function entityIdf(index: EntityIndex, entity: string): number {
  const df = index.documentFrequency.get(entity) ?? 0;
  return Math.log(index.documentCount / (1 + df)) + 1;
}

/**
 * Recorded per pair so the Phase 6 breakdown can report the two kinds
 * separately: they exercise different retrieval failures, and averaging them
 * together would hide whichever is worse. Defined in types.ts.
 */
import type { MultihopKind } from "./types";

export type { MultihopKind };

export interface EntityPair {
  a: CorpusChunk;
  b: CorpusChunk;
  entity: string;
  kind: MultihopKind;
  /** IDF of the shared entity — how specific the connection is. */
  idf: number;
  /** Documents the entity appears in, corpus-wide. */
  documentFrequency: number;
  /** Times mentioned in the weaker of the two passages. */
  mentions: number;
  /** idf * mentions — rarity AND salience. See crossDocumentPairs. */
  score: number;
}

/**
 * Best shared entity for one pair of chunks, or null if none qualifies.
 *
 * Shared by both pair builders so cross-document and same-document candidates
 * are scored identically — only which chunks are eligible differs.
 */
function bestSharedEntity(
  aMentions: Map<string, number>,
  bMentions: Map<string, number>,
  index: EntityIndex,
  maxDocs: number,
  minMentions: number,
): { entity: string; idf: number; documentFrequency: number; mentions: number; score: number } | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  let bestIdf = 0;
  let bestDf = 0;
  let bestMentions = 0;

  for (const [entity, tfA] of aMentions) {
    const tfB = bMentions.get(entity);
    if (tfB === undefined) continue;

    const df = index.documentFrequency.get(entity) ?? 0;
    if (df > maxDocs) continue;

    // The WEAKER passage governs: an entity central to one passage and mentioned
    // once in passing by the other cannot anchor a question requiring both.
    const tf = Math.min(tfA, tfB);
    if (tf < minMentions) continue;

    const idf = entityIdf(index, entity);
    const score = idf * tf;
    if (score > bestScore) {
      best = entity;
      bestScore = score;
      bestIdf = idf;
      bestDf = df;
      bestMentions = tf;
    }
  }

  if (best === null) return null;
  return {
    entity: best,
    idf: bestIdf,
    documentFrequency: bestDf,
    mentions: bestMentions,
    score: bestScore,
  };
}

/** Score-descending, ties broken by a stable hash. See tieHash. */
function sortPairs(pairs: EntityPair[]): EntityPair[] {
  pairs.sort(
    (x, y) =>
      y.score - x.score ||
      tieHash(`${x.entity}|${x.a.id}|${x.b.id}`) - tieHash(`${y.entity}|${y.a.id}|${y.b.id}`),
  );
  return pairs;
}

/**
 * Deterministic, order-independent hash. Used only to break exact score ties.
 *
 * Ties are common and consequential here: thousands of entities appear in
 * exactly two documents, so they share an IDF exactly, and any lexical tiebreak
 * picks an unrepresentative slice of them. Ranking by name gave twenty pairs
 * whose entities all began with "A". Hashing spreads the tie deterministically
 * without favouring any part of the alphabet.
 */
function tieHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * An entity appearing in more than this fraction of the corpus is too generic to
 * anchor a multi-hop question, no matter how long its name is.
 *
 * At 90 documents, 0.15 admits entities appearing in at most 13. Expressed as a
 * fraction rather than a raw count so it transfers to a corpus of a different
 * size; ranking still uses the IDF itself.
 */
export const DEFAULT_MAX_DOC_FRACTION = 0.15;

/**
 * Minimum times a shared entity must be mentioned in EACH passage.
 *
 * 2 is the smallest value that distinguishes a subject from a citation, which is
 * the distinction that matters most on an academic corpus.
 */
export const DEFAULT_MIN_MENTIONS = 2;

export interface PairOptions {
  maxDocFraction?: number;
  minMentions?: number;
}

/**
 * Chunk pairs from DIFFERENT documents that share a SPECIFIC entity, best first.
 *
 * The previous heuristic took the longest shared entity name, on the theory that
 * longer means more specific. It does not: measured on this corpus the top
 * matches were "However" (617 pairs), "BERT" (547), "Proceedings" (365) and
 * "Computational Linguistics" (206) — discourse connectives, a field-ubiquitous
 * model name, and bibliography boilerplate, with the longest of them among the
 * most useless. Two papers both containing "However" share nothing, so the model
 * was asked 20 times for a question spanning two unrelated passages and correctly
 * refused all 20, leaving the multihop bucket empty.
 *
 * Ranking by IDF asks the right question — is this name rare enough to pick out a
 * shared subject — and the length of the string never enters into it.
 */
export function crossDocumentPairs(
  chunks: CorpusChunk[],
  index: EntityIndex,
  options: PairOptions = {},
): EntityPair[] {
  const maxDocFraction = options.maxDocFraction ?? DEFAULT_MAX_DOC_FRACTION;
  const minMentions = options.minMentions ?? DEFAULT_MIN_MENTIONS;
  // Floor of 2, not 1: a SHARED entity appears in both documents of the pair, so
  // its df is at least 2 by construction. A cap of 1 would make this function
  // structurally incapable of returning anything — which is what happens on a
  // small corpus, where floor(0.15 * documentCount) rounds to 0.
  const maxDocs = Math.max(2, Math.floor(maxDocFraction * index.documentCount));

  const mentions = new Map<string, Map<string, number>>();
  for (const c of chunks) mentions.set(c.id, entityMentions(c.content));

  const pairs: EntityPair[] = [];
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];
      if (a.documentId === b.documentId) continue;

      const aMentions = mentions.get(a.id);
      const bMentions = mentions.get(b.id);
      if (!aMentions || !bMentions) continue;

      const best = bestSharedEntity(aMentions, bMentions, index, maxDocs, minMentions);
      if (best === null) continue;
      pairs.push({ a, b, kind: "cross-doc", ...best });
    }
  }

  // Sorted by score, ties broken by a stable hash rather than by name — see
  // tieHash. Fully deterministic, so the seeded sampler upstream still
  // reproduces a run exactly.
  return sortPairs(pairs);
}

/**
 * Chunks far apart WITHIN one document that share a salient entity, best first.
 *
 * A DEVIATION from docs/EVAL_HARNESS.md, which specifies cross-document
 * multi-hop only. Measured on this corpus, cross-document pairs yield a question
 * about 5% of the time: 90 unrelated arXiv papers simply do not contain twenty
 * pairs of passages that jointly answer anything, and no ranking function can
 * manufacture them. A paper's own method section and its results genuinely do
 * share facts, so same-document pairs are the honest way to fill the bucket.
 *
 * They are NOT equivalent, which is why the kind is recorded per question rather
 * than blended: a same-document question can often be answered from one
 * well-chosen chunk, so it tests multi-chunk assembly less severely than a true
 * cross-document hop.
 */
export const DEFAULT_MIN_CHUNK_DISTANCE = 5;

/**
 * Same-document pairs tolerate a much more common entity than cross-document
 * ones. Corpus-wide rarity is what makes two SEPARATE papers about the same
 * thing; within one paper the subject is the paper's own, and a model name
 * appearing in half the corpus is still exactly what its method section and its
 * results section are both about. Ranking still prefers the rarer entity.
 */
export const DEFAULT_SAME_DOC_MAX_DOC_FRACTION = 0.5;

export interface SameDocumentPairOptions extends PairOptions {
  /** Minimum |chunk_index| gap. Adjacent chunks overlap and share wording. */
  minChunkDistance?: number;
}

export function sameDocumentPairs(
  chunks: CorpusChunk[],
  index: EntityIndex,
  options: SameDocumentPairOptions = {},
): EntityPair[] {
  const maxDocFraction = options.maxDocFraction ?? DEFAULT_SAME_DOC_MAX_DOC_FRACTION;
  const minMentions = options.minMentions ?? DEFAULT_MIN_MENTIONS;
  const minDistance = options.minChunkDistance ?? DEFAULT_MIN_CHUNK_DISTANCE;
  // Floor of 1 here, not 2: a same-document entity need only appear in the ONE
  // document, so df of 1 is both possible and the most specific case there is.
  const maxDocs = Math.max(1, Math.floor(maxDocFraction * index.documentCount));

  const mentions = new Map<string, Map<string, number>>();
  for (const c of chunks) mentions.set(c.id, entityMentions(c.content));

  const pairs: EntityPair[] = [];
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];
      if (a.documentId !== b.documentId) continue;

      // Adjacent chunks share the 15% overlap window and usually restate each
      // other, so a "multi-hop" question over them needs only one of the two.
      if (Math.abs(a.chunkIndex - b.chunkIndex) < minDistance) continue;

      const aMentions = mentions.get(a.id);
      const bMentions = mentions.get(b.id);
      if (!aMentions || !bMentions) continue;

      const best = bestSharedEntity(aMentions, bMentions, index, maxDocs, minMentions);
      if (best === null) continue;
      pairs.push({ a, b, kind: "same-doc", ...best });
    }
  }

  return sortPairs(pairs);
}

// --- Aggregation questions (deterministic, no LLM) ---------------------------

/**
 * Aggregation questions are BUILT, not generated.
 *
 * "How many papers mention X" has an exact, checkable answer that the document
 * frequency index already knows. Asking a model to invent one instead produced
 * four nulls out of ten and, worse, answers nobody had verified — a golden set
 * whose ground truth is a model's guess is not ground truth. Counting is the one
 * question type where the corpus can answer for itself, so it does.
 *
 * The ground truth here is defined by `namedEntities`: the question is really
 * "does retrieval surface the chunks the index says contain this entity". That
 * is the right question for a retrieval eval, and it is exactly reproducible.
 */
export const AGGREGATION_MIN_DOCS = 3;
export const AGGREGATION_MAX_DOCS = 10;

/**
 * Phrasings, varied so the bucket is not fifteen copies of one sentence.
 * Identical scaffolding across questions would let a retriever key on the
 * template rather than the entity, and would trip the duplicate triage besides.
 */
const COUNT_TEMPLATES = [
  "How many papers in this collection mention {e}?",
  "Across the corpus, how many documents refer to {e}?",
  "In how many separate papers does {e} come up?",
  "Count the documents in which {e} is discussed.",
];

const LIST_TEMPLATES = [
  "Which papers discuss {e}?",
  "List every document that mentions {e}.",
  "Name the papers in which {e} appears.",
  "Which documents in this collection cover {e}?",
];

export interface AggregationQuestion {
  entity: string;
  question: string;
  expectedAnswer: string;
  chunkIds: string[];
  docIds: string[];
  docTitles: string[];
  pages: number[];
  form: "count" | "list";
  documentFrequency: number;
}

export interface AggregationOptions {
  minDocs?: number;
  maxDocs?: number;
}

export function buildAggregationQuestions(
  corpus: CorpusChunk[],
  index: EntityIndex,
  limit: number,
  options: AggregationOptions = {},
): AggregationQuestion[] {
  const minDocs = options.minDocs ?? AGGREGATION_MIN_DOCS;
  const maxDocs = options.maxDocs ?? AGGREGATION_MAX_DOCS;
  if (limit <= 0) return [];

  // Candidate entities first, so the corpus scan below only tracks the few
  // thousand that could possibly be used rather than every capitalised phrase.
  const candidates = new Set<string>();
  for (const [entity, df] of index.documentFrequency) {
    if (df >= minDocs && df <= maxDocs) candidates.add(entity);
  }
  if (candidates.size === 0) return [];

  interface Occurrence {
    chunkIds: string[];
    docIds: Set<string>;
    titles: Set<string>;
    pages: Set<number>;
    totalMentions: number;
    peakMentions: number;
  }
  const found = new Map<string, Occurrence>();

  for (const chunk of corpus) {
    for (const [entity, count] of entityMentions(chunk.content)) {
      if (!candidates.has(entity)) continue;

      let occurrence = found.get(entity);
      if (!occurrence) {
        occurrence = {
          chunkIds: [],
          docIds: new Set(),
          titles: new Set(),
          pages: new Set(),
          totalMentions: 0,
          peakMentions: 0,
        };
        found.set(entity, occurrence);
      }
      occurrence.chunkIds.push(chunk.id);
      occurrence.docIds.add(chunk.documentId);
      occurrence.titles.add(chunk.title);
      if (chunk.pageNumber !== null) occurrence.pages.add(chunk.pageNumber);
      occurrence.totalMentions += count;
      occurrence.peakMentions = Math.max(occurrence.peakMentions, count);
    }
  }

  const ranked = [...found.entries()]
    // Mentioned at least twice somewhere: an entity that appears exactly once in
    // every document it touches is a citation, and "how many papers cite Smith"
    // is a question about the bibliography, not the research.
    .filter(([, o]) => o.peakMentions >= DEFAULT_MIN_MENTIONS)
    .sort(
      (x, y) =>
        y[1].totalMentions - x[1].totalMentions ||
        tieHash(x[0]) - tieHash(y[0]),
    );

  const out: AggregationQuestion[] = [];
  for (const [entity, occurrence] of ranked) {
    if (out.length >= limit) break;

    // Alternate count and list, and walk the templates, so neither form nor
    // phrasing clusters at the top of the bucket.
    const form = out.length % 2 === 0 ? "count" : "list";
    const templates = form === "count" ? COUNT_TEMPLATES : LIST_TEMPLATES;
    const template = templates[Math.floor(out.length / 2) % templates.length];

    const titles = [...occurrence.titles].sort();
    const docIds = [...occurrence.docIds];

    out.push({
      entity,
      question: template.replace("{e}", entity),
      expectedAnswer: form === "count" ? String(docIds.length) : titles.join("; "),
      chunkIds: occurrence.chunkIds,
      docIds,
      docTitles: titles,
      pages: [...occurrence.pages].sort((a, b) => a - b),
      form,
      documentFrequency: docIds.length,
    });
  }

  return out;
}

/**
 * Take the `limit` most specific pairs, without letting one entity or one pair
 * of documents dominate.
 *
 * Strict best-first would happily return twenty questions about the same rare
 * entity in the same two papers — technically the most specific pairs available,
 * and useless as an evaluation bucket, since the multihop metric would then
 * describe one document pair rather than the corpus. One pair per entity and per
 * document pair keeps the bucket varied.
 *
 * Input is expected pre-sorted by crossDocumentPairs; selection is deterministic,
 * so no shuffling is needed or wanted.
 */
export function selectMultihopPairs(pairs: EntityPair[], limit: number): EntityPair[] {
  const usedEntities = new Set<string>();
  const usedDocPairs = new Set<string>();
  const picked: EntityPair[] = [];

  for (const pair of pairs) {
    if (picked.length >= limit) break;
    if (usedEntities.has(pair.entity)) continue;

    const docKey = [pair.a.documentId, pair.b.documentId].sort().join("|");
    if (usedDocPairs.has(docKey)) continue;

    usedEntities.add(pair.entity);
    usedDocPairs.add(docKey);
    picked.push(pair);
  }

  return picked;
}
