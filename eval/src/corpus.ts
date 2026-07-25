/**
 * Read-only corpus access for the eval harness: sampling chunks for golden set
 * generation, and resolving chunk ids for validation.
 *
 * Imports the app's shared db client rather than opening its own connection, so
 * there is exactly one place that knows how to reach Postgres.
 */
import { db } from "../../src/lib/db";

export interface CorpusChunk {
  id: string;
  documentId: string;
  filename: string;
  title: string;
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
}

interface DocRow {
  id: string;
  title: string;
  filename: string;
}

/** Every chunk in the corpus, joined to its document's title and filename. */
export async function loadCorpus(): Promise<CorpusChunk[]> {
  const docs = await db.from("documents").select("id,title,filename").returns<DocRow[]>();
  if (docs.error) throw new Error(`document read failed: ${docs.error.message}`);
  const meta = new Map(docs.data.map((d) => [d.id, d]));

  const chunks = await db
    .from("chunks")
    .select("id,document_id,content,page_number,chunk_index")
    .order("document_id")
    .order("chunk_index")
    .returns<ChunkRow[]>();
  if (chunks.error) throw new Error(`chunk read failed: ${chunks.error.message}`);

  return chunks.data.map((c) => ({
    id: c.id,
    documentId: c.document_id,
    filename: meta.get(c.document_id)?.filename ?? "(unknown)",
    title: meta.get(c.document_id)?.title ?? "(unknown)",
    content: c.content,
    pageNumber: c.page_number,
    chunkIndex: c.chunk_index,
  }));
}

/** Which of `ids` actually exist in the chunks table. Used by validation. */
export async function existingChunkIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const res = await db.from("chunks").select("id").in("id", unique).returns<{ id: string }[]>();
  if (res.error) throw new Error(`chunk id lookup failed: ${res.error.message}`);
  return new Set(res.data.map((r) => r.id));
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

// Words that are capitalised for reasons other than being a named entity —
// sentence starts, headings, and boilerplate. Without this filter the entity
// index is dominated by "The", "This", "Page", and multi-document pairs get
// matched on nothing meaningful.
const ENTITY_STOPWORDS = new Set([
  "The", "This", "That", "These", "Those", "A", "An", "And", "But", "Or", "If",
  "When", "While", "For", "From", "With", "Without", "All", "Any", "Each",
  "Every", "No", "Not", "In", "On", "At", "To", "By", "As", "It", "Its", "We",
  "You", "They", "He", "She", "There", "Here", "Page", "Section", "Table",
  "Figure", "Note", "Notes", "Appendix", "Chapter", "Part", "Article", "Item",
  "Where", "What", "Which", "Who", "How", "Why", "Then", "Than", "Also", "Such",
  "Both", "Either", "Neither", "Per", "Via", "Are", "Is", "Was", "Were", "Be",
  "Been", "Has", "Have", "Had", "Will", "Shall", "May", "Must", "Should",
]);

/**
 * Extract candidate named entities: runs of capitalised words, plus bare
 * acronyms. Crude, but it only has to be good enough to find two chunks in
 * different documents that plausibly share a subject for a multi-hop question —
 * the model then decides whether a real two-chunk question exists.
 */
export function namedEntities(text: string): Set<string> {
  const out = new Set<string>();

  for (const match of text.matchAll(/\b[A-Z][a-zA-Z0-9'-]+(?:\s+[A-Z][a-zA-Z0-9'-]+)*/g)) {
    const phrase = match[0].trim();
    const words = phrase.split(/\s+/);
    // A single capitalised word is usually just a sentence start; require either
    // a multi-word phrase or a word that isn't a common stopword.
    if (words.length === 1 && ENTITY_STOPWORDS.has(words[0])) continue;
    const meaningful = words.filter((w) => !ENTITY_STOPWORDS.has(w));
    if (meaningful.length === 0) continue;
    if (phrase.length < 4) continue;
    out.add(meaningful.join(" "));
  }

  for (const match of text.matchAll(/\b[A-Z]{2,}(?:-[A-Z0-9]+)?\b/g)) {
    if (match[0].length >= 2 && !ENTITY_STOPWORDS.has(match[0])) out.add(match[0]);
  }

  return out;
}

/** Chunk pairs from DIFFERENT documents that share at least one entity. */
export function crossDocumentPairs(
  chunks: CorpusChunk[],
): { a: CorpusChunk; b: CorpusChunk; entity: string }[] {
  const entities = new Map<string, Set<string>>();
  for (const c of chunks) entities.set(c.id, namedEntities(c.content));

  const pairs: { a: CorpusChunk; b: CorpusChunk; entity: string }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];
      if (a.documentId === b.documentId) continue;
      const sharedEntities = [...(entities.get(a.id) ?? [])].filter((e) =>
        entities.get(b.id)?.has(e),
      );
      if (sharedEntities.length === 0) continue;
      // Prefer the longest shared entity — the most specific one.
      const entity = sharedEntities.sort((x, y) => y.length - x.length)[0];
      pairs.push({ a, b, entity });
    }
  }
  return pairs;
}
