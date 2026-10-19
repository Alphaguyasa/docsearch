/**
 * Where churches differ on a book: which traditions read a scripture passage as
 * scripture, and which do not. Drives the label under a cited passage.
 *
 * WHY from the passage's own tags rather than a lookup by book: scripture
 * chunks carry their book's tags from data/canon.json (traditionsFor), and a
 * ref like "Tobit 4:7" would need parsing back to a USFM code to look up.
 */
import type { Tradition } from "./canon";

// The canons a note names. WHY not oriental_orthodox: a book missing that tag
// may still be read by some Oriental churches (or is NEEDS REVIEW), so "not in
// the Oriental Orthodox canon" would claim more than the data says. Nor the
// legacy `orthodox`, which is the same set as eastern_orthodox.
const NOTE_TRADITIONS: Tradition[] = ["protestant", "catholic", "eastern_orthodox", "ethiopian_orthodox"];

export interface CanonSplit {
  inCanon: Tradition[];
  notIn: Tradition[];
}

/** null when every tradition reads the book (nothing to point out) or the tags are unknown. */
export function canonSplit(traditions: readonly string[] | undefined): CanonSplit | null {
  if (!traditions?.length) return null;
  const inCanon = NOTE_TRADITIONS.filter((t) => traditions.includes(t));
  const notIn = NOTE_TRADITIONS.filter((t) => !traditions.includes(t));
  return inCanon.length && notIn.length ? { inCanon, notIn } : null;
}
