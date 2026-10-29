/**
 * Resume planning for ingestion. Pure — unit-tested.
 *
 * A chunk row is either absent or complete (content + embedding written in the
 * same upsert), so "done" means: a row exists at (document, chunk_index) with
 * identical content and a non-null embedding. Anything else is (re)embedded.
 * Rows past the end of a rebuilt document are stale and deleted.
 *
 * WHY retag: a done row is never rewritten, so a change to a book's tags in
 * data/canon.json (or a source's tags) would otherwise never reach the DB and
 * the church filter would silently read the old tags. Tags are cheap to fix in
 * place; re-embedding 9k chunks on Voyage's free tier would take days.
 */
import type { ScriptureChunk } from "./types";

export interface ExistingRow {
  id: string;
  documentKey: string;
  chunkIndex: number;
  content: string;
  embedded: boolean;
  /** Tags on the row. Omitted = unknown, so the row is never retagged. */
  traditions?: readonly string[];
}

export interface Retag {
  traditions: string[];
  ids: string[];
}

export interface IngestPlan {
  toEmbed: ScriptureChunk[];
  staleRowIds: string[];
  alreadyDone: number;
  /** Done rows whose tags differ from the build, grouped by their new tags. */
  retag: Retag[];
}

export function planIngest(expected: ScriptureChunk[], existing: ExistingRow[]): IngestPlan {
  const have = new Map(existing.map((r) => [`${r.documentKey}#${r.chunkIndex}`, r]));
  const wanted = new Set<string>();
  const toEmbed: ScriptureChunk[] = [];
  const retag = new Map<string, Retag>();
  let alreadyDone = 0;
  for (const c of expected) {
    const key = `${c.documentKey}#${c.chunkIndex}`;
    wanted.add(key);
    const row = have.get(key);
    if (row && row.embedded && row.content === c.content) {
      alreadyDone++;
      if (row.traditions && !sameTags(row.traditions, c.traditions)) {
        const tags = [...c.traditions].sort();
        const k = tags.join(",");
        if (!retag.has(k)) retag.set(k, { traditions: tags, ids: [] });
        retag.get(k)!.ids.push(row.id);
      }
    } else toEmbed.push(c);
  }
  const staleRowIds = existing.filter((r) => !wanted.has(`${r.documentKey}#${r.chunkIndex}`)).map((r) => r.id);
  return { toEmbed, staleRowIds, alreadyDone, retag: [...retag.values()] };
}

/** Order does not matter: the filter reads tags as a set (`&&` overlap). */
function sameTags(a: readonly string[], b: readonly string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((t) => y.has(t));
}

/** Split into groups that are each committed to the DB before the next is embedded. */
export function groups<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Rows per retag update. Each update rewrites the row's HNSW and tsv index entries. */
export const RETAG_BATCH = 25;

/**
 * Run `apply` over `ids` in batches of `size`; a batch that hits a statement
 * timeout is split in half and retried, down to single rows. Any other error,
 * or a timeout on one row, is thrown.
 *
 * WHY: on 2026-10-19 one retag of 100 rows hit Supabase's statement timeout.
 * The chained rerun recovered, but halving lets the same run finish.
 */
export async function applyInBatches(
  ids: string[],
  size: number,
  apply: (batch: string[]) => Promise<{ error: { message: string } | null }>,
): Promise<void> {
  for (const batch of groups(ids, size)) await applySplitting(batch, apply);
}

async function applySplitting(
  batch: string[],
  apply: (batch: string[]) => Promise<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await apply(batch);
  if (!error) return;
  if (batch.length > 1 && /statement timeout|canceling statement/i.test(error.message)) {
    const mid = Math.ceil(batch.length / 2);
    await applySplitting(batch.slice(0, mid), apply);
    await applySplitting(batch.slice(mid), apply);
    return;
  }
  throw new Error(error.message);
}
