/**
 * Resumable-ingestion planning. Pure, no I/O — unit-tested.
 *
 * Given the chunks built locally for one document and the state the database
 * reports for it, decide what to embed and what to delete. A chunk is (re)embedded
 * when it is missing, has no embedding, or its content changed since it was
 * stored (compared by md5, the same hash Postgres computes). Rows beyond the
 * local chunk count are stale and deleted.
 */
import { createHash } from "node:crypto";

import type { ScriptureChunk } from "./types";

export interface DbChunkState {
  chunk_index: number;
  content_md5: string;
  embedded: boolean;
}

export interface DocPlan {
  toEmbed: ScriptureChunk[];
  staleIndexes: number[];
  alreadyDone: number;
}

export function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

export function planDocument(local: ScriptureChunk[], state: DbChunkState[]): DocPlan {
  const byIndex = new Map(state.map((s) => [s.chunk_index, s]));
  const toEmbed: ScriptureChunk[] = [];
  let alreadyDone = 0;
  for (const c of local) {
    const s = byIndex.get(c.chunkIndex);
    if (s && s.embedded && s.content_md5 === md5(c.content)) alreadyDone++;
    else toEmbed.push(c);
  }
  const maxLocal = local.length - 1;
  const staleIndexes = state.map((s) => s.chunk_index).filter((i) => i > maxLocal);
  return { toEmbed, staleIndexes, alreadyDone };
}

/** Ingest order: the sources users will hit first go first. */
export const SOURCE_PRIORITY = ["web", "lausiac", "confessions", "synaxarium", "paradise"];

export function orderSources(ids: string[]): string[] {
  const rank = (id: string) => {
    const i = SOURCE_PRIORITY.indexOf(id);
    return i === -1 ? SOURCE_PRIORITY.length : i;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
