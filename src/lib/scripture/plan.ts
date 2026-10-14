/**
 * Resume planning for ingestion. Pure — unit-tested.
 *
 * A chunk row is either absent or complete (content + embedding written in the
 * same upsert), so "done" means: a row exists at (document, chunk_index) with
 * identical content and a non-null embedding. Anything else is (re)embedded.
 * Rows past the end of a rebuilt document are stale and deleted.
 */
import type { ScriptureChunk } from "./types";

export interface ExistingRow {
  id: string;
  documentKey: string;
  chunkIndex: number;
  content: string;
  embedded: boolean;
}

export interface IngestPlan {
  toEmbed: ScriptureChunk[];
  staleRowIds: string[];
  alreadyDone: number;
}

export function planIngest(expected: ScriptureChunk[], existing: ExistingRow[]): IngestPlan {
  const have = new Map(existing.map((r) => [`${r.documentKey}#${r.chunkIndex}`, r]));
  const wanted = new Set<string>();
  const toEmbed: ScriptureChunk[] = [];
  let alreadyDone = 0;
  for (const c of expected) {
    const key = `${c.documentKey}#${c.chunkIndex}`;
    wanted.add(key);
    const row = have.get(key);
    if (row && row.embedded && row.content === c.content) alreadyDone++;
    else toEmbed.push(c);
  }
  const staleRowIds = existing.filter((r) => !wanted.has(`${r.documentKey}#${r.chunkIndex}`)).map((r) => r.id);
  return { toEmbed, staleRowIds, alreadyDone };
}

/** Split into groups that are each committed to the DB before the next is embedded. */
export function groups<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
