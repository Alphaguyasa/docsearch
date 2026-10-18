/**
 * Where churches differ on a book: which traditions read a scripture passage as
 * scripture, and which do not. Drives the label under a cited passage.
 *
 * WHY from the passage's own tags rather than a lookup by book: scripture
 * chunks carry their book's tags from data/canon.json (traditionsFor), and a
 * ref like "Tobit 4:7" would need parsing back to a USFM code to look up.
 */
import { TRADITIONS, type Tradition } from "./canon";

export interface CanonSplit {
  inCanon: Tradition[];
  notIn: Tradition[];
}

/** null when every tradition reads the book (nothing to point out) or the tags are unknown. */
export function canonSplit(traditions: readonly string[] | undefined): CanonSplit | null {
  if (!traditions?.length) return null;
  const inCanon = TRADITIONS.filter((t) => traditions.includes(t));
  const notIn = TRADITIONS.filter((t) => !traditions.includes(t));
  return inCanon.length && notIn.length ? { inCanon, notIn } : null;
}
