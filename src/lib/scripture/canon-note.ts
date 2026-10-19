/**
 * Where churches differ on a book: which traditions read a scripture passage as
 * scripture, and which do not. Drives the label under a cited passage.
 *
 * WHY from the passage's own tags rather than a lookup by book: scripture
 * chunks carry their book's tags from data/canon.json (traditionsFor), and a
 * ref like "Tobit 4:7" would need parsing back to a USFM code to look up.
 */
import { LEGACY_TRADITIONS, type Tradition } from "./canon";

export interface CanonSplit {
  inCanon: Tradition[];
  notIn: Tradition[];
}

/** null when every tradition reads the book (nothing to point out) or the tags are unknown. */
export function canonSplit(traditions: readonly string[] | undefined): CanonSplit | null {
  if (!traditions?.length) return null;
  // Legacy tags only until the DB is retagged: a row without the new tags would
  // otherwise read as "not in the Eastern or Oriental Orthodox canons".
  const inCanon: Tradition[] = LEGACY_TRADITIONS.filter((t) => traditions.includes(t));
  const notIn: Tradition[] = LEGACY_TRADITIONS.filter((t) => !traditions.includes(t));
  return inCanon.length && notIn.length ? { inCanon, notIn } : null;
}
