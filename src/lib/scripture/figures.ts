/**
 * Figure-first retrieval: struggle tags -> figures -> their fall / restoration
 * passages, then hybrid search fills the rest. The ranking and overlap logic
 * is pure and unit-tested; the DB calls are thin.
 */
import figuresSeed from "../../../data/figures.seed.json";
import type { Tradition } from "./canon";
import { parseRef } from "./usfm";

export interface Figure {
  id: string;
  name: string;
  kind: "scripture" | "tradition";
  sins: string[];
  summary: string;
  traditions: string[];
  note?: string;
  passages: { role: "fall" | "restoration" | "context"; ref: string; sourceId: string; match?: string }[];
}

export const FIGURES = figuresSeed.figures as Figure[];

/**
 * Figures for these tags, best first: more matching tags wins, then scripture
 * before tradition, then seed order. Figures whose passages are all pending,
 * or outside the tradition filter, are excluded.
 */
export function rankFigures(tags: string[], filter?: Tradition[], limit = 3, all = FIGURES): Figure[] {
  return all
    .map((f, order) => ({ f, order, score: f.sins.filter((s) => tags.includes(s)).length }))
    .filter(({ f, score }) => score > 0)
    .filter(({ f }) => f.passages.some((p) => p.sourceId !== "pending"))
    .filter(({ f }) => !filter?.length || f.traditions.some((t) => filter.includes(t as Tradition)))
    .sort((a, b) => b.score - a.score || (a.f.kind === b.f.kind ? 0 : a.f.kind === "scripture" ? -1 : 1) || a.order - b.order)
    .slice(0, limit)
    .map(({ f }) => f);
}

/** Does a chunk ref (e.g. "2 Samuel 10:15-11:3") overlap a passage ref ("2 Samuel 11:1-27")? */
export function refsOverlap(chunkRef: string, passageRef: string): boolean {
  const c = parseRef(chunkRef);
  const p = parseRef(passageRef);
  if (!c || !p || c.book !== p.book) return false;
  const cs = c.c1 * 1000 + c.v1;
  const ce = c.c2 * 1000 + c.v2;
  const ps = p.c1 * 1000 + p.v1;
  const pe = p.c2 * 1000 + p.v2;
  return cs <= pe && ce >= ps;
}

/** Order passages so a story reads fall -> restoration -> context. */
export function orderedPassages(f: Figure): Figure["passages"] {
  const rank = { fall: 0, restoration: 1, context: 2 } as const;
  return f.passages.filter((p) => p.sourceId !== "pending").sort((a, b) => rank[a.role] - rank[b.role]);
}
