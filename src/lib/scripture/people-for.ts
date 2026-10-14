/**
 * People for a message with no model and no search quota: the synonym table
 * and the figure ranking only. Used when the story can't be written — the
 * day's answer quota is spent, the site is busy, or the stream breaks — so the
 * reader still leaves with someone who carried the same thing, whose story
 * they can read straight from the text on that person's page.
 */
import type { FigureSummary } from "../search-stream";
import type { Tradition } from "./canon";
import { rankFigures } from "./figures";
import { matchTags } from "./struggle";

export function peopleFor(message: string, tradition?: Tradition): FigureSummary[] {
  const tags = matchTags(message);
  if (!tags.length) return [];
  return rankFigures(tags, tradition ? [tradition] : undefined, 3).map(({ id, name, summary, note, kind }) => ({
    id,
    name,
    summary,
    note,
    kind,
  }));
}
