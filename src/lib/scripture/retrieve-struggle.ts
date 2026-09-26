/**
 * SERVER-ONLY. Struggle-aware retrieval for the scripture app.
 *
 *   message -> sin tags -> matching figures -> their fall/restoration chunks
 *           -> topped up with ordinary hybrid search, deduplicated.
 *
 * Figure passages come first so the answer can tell a specific person's story;
 * hybrid results add anything else in the corpus that speaks to the message.
 */
import { db } from "../db";
import { getLlm, lightModel } from "../llm";
import { retrieve, type RetrievedChunk } from "../retrieve";
import { canonByCode, type Tradition } from "./canon";
import { orderedPassages, rankFigures, refsOverlap, type Figure } from "./figures";
import { mapStruggle, type TagLlm } from "./struggle";
import { parseRef } from "./usfm";

export interface StruggleRetrieveOptions {
  filterTraditions?: Tradition[];
  /** Total chunks returned. */
  limit?: number;
  /** Max figures whose stories are pulled in. */
  maxFigures?: number;
  /** Override the tag-classification LLM (tests / eval). */
  llm?: TagLlm;
}

export interface StruggleRetrieveResult {
  tags: string[];
  via: "synonyms" | "llm" | "none";
  figures: Pick<Figure, "id" | "name" | "summary" | "note" | "kind">[];
  results: RetrievedChunk[];
  degraded: boolean;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  ref: string | null;
  traditions: string[] | null;
  chunk_index: number;
}
const COLS = "id,document_id,content,page_number,ref,traditions,chunk_index";
const PER_PASSAGE = 3;

const defaultLlm: TagLlm = async (prompt) =>
  (await getLlm().complete([{ role: "user", content: prompt }], 60, lightModel())).text;

export async function retrieveForStruggle(
  message: string,
  opts: StruggleRetrieveOptions = {},
): Promise<StruggleRetrieveResult> {
  const limit = opts.limit ?? 10;
  const filter = opts.filterTraditions;
  const { tags, via } = await mapStruggle(message, opts.llm ?? defaultLlm);
  const figures = rankFigures(tags, filter, opts.maxFigures ?? 3);

  // Leave ~30% of the budget for search results; at least 2 chunks per figure.
  const perFigure = Math.max(2, Math.floor((limit * 0.7) / Math.max(1, figures.length)));
  const figureChunks: ChunkRow[] = [];
  for (const f of figures) {
    const rows: ChunkRow[] = [];
    for (const p of orderedPassages(f)) {
      if (rows.length >= perFigure) break;
      rows.push(...(await passageChunks(p.ref, p.sourceId, filter, p.match)).slice(0, PER_PASSAGE));
    }
    figureChunks.push(...rows.slice(0, perFigure));
  }

  const seen = new Set<string>();
  const fromFigures = figureChunks.filter((r) => !seen.has(r.id) && seen.add(r.id));
  const meta = await documentMeta(fromFigures.map((r) => r.document_id));
  const results: RetrievedChunk[] = fromFigures.map((r, i) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    title: meta.get(r.document_id)?.title ?? "(unknown)",
    filename: meta.get(r.document_id)?.filename ?? "(unknown)",
    pageNumber: r.page_number,
    ref: r.ref,
    traditions: r.traditions ?? [],
    vectorScore: null,
    keywordScore: null,
    fusedScore: 1 - i / 1000, // figure passages rank above search results
  }));

  let degraded = false;
  if (results.length < limit) {
    const search = await retrieve(message, { limit: limit + results.length, filterTraditions: filter });
    degraded = search.degraded;
    for (const r of search.results) {
      if (results.length >= limit) break;
      if (!seen.has(r.id)) {
        seen.add(r.id);
        results.push(r);
      }
    }
  }

  return {
    tags,
    via,
    figures: figures.map(({ id, name, summary, note, kind }) => ({ id, name, summary, note, kind })),
    results: results.slice(0, limit),
    degraded,
  };
}

/** Chunks for one figure passage, respecting the tradition filter. */
async function passageChunks(
  ref: string,
  sourceId: string,
  filter?: Tradition[],
  match?: string,
): Promise<ChunkRow[]> {
  if (sourceId === "web") {
    const byName = new Map([...canonByCode().values()].map((b) => [b.name, b.code]));
    const parsed = parseRef(ref);
    const code = parsed ? byName.get(parsed.book) : byName.get(ref); // "Prayer of Manasseh" has no chapter
    if (!code) return [];
    let q = db.from("chunks").select(COLS).eq("book", code);
    if (parsed) q = q.gte("chapter_start", parsed.c1 - 1).lte("chapter_start", parsed.c2);
    if (filter?.length) q = q.overlaps("traditions", filter);
    const { data, error } = await q.order("chunk_index").limit(40).returns<ChunkRow[]>();
    if (error) throw new Error(`passage lookup failed (${ref}): ${error.message}`);
    return (data ?? []).filter((r) => !parsed || (r.ref !== null && refsOverlap(r.ref, ref)));
  }
  const docId = await documentIdFor(sourceId);
  if (!docId) return [];
  let q = db.from("chunks").select(COLS).eq("document_id", docId).ilike("ref", `${escapeLike(ref)}%`);
  // Broad sections (a whole Book, a whole month) are narrowed by a phrase in the text.
  if (match) q = q.ilike("content", `%${escapeLike(match)}%`);
  if (filter?.length) q = q.overlaps("traditions", filter);
  const { data, error } = await q.order("chunk_index").limit(PER_PASSAGE).returns<ChunkRow[]>();
  if (error) throw new Error(`passage lookup failed (${ref}): ${error.message}`);
  return data ?? [];
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const docIdCache = new Map<string, string | null>();
async function documentIdFor(sourceId: string): Promise<string | null> {
  if (docIdCache.has(sourceId)) return docIdCache.get(sourceId)!;
  const { data } = await db.from("documents").select("id").eq("source_id", sourceId).maybeSingle<{ id: string }>();
  docIdCache.set(sourceId, data?.id ?? null);
  return data?.id ?? null;
}

async function documentMeta(ids: string[]): Promise<Map<string, { title: string; filename: string }>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, { title: string; filename: string }>();
  if (!unique.length) return out;
  const { data, error } = await db.from("documents").select("id,title,filename").in("id", unique)
    .returns<{ id: string; title: string; filename: string }[]>();
  if (error) throw new Error(`document metadata lookup failed: ${error.message}`);
  for (const d of data ?? []) out.set(d.id, d);
  return out;
}
