/**
 * How people are shown to readers. The seed data carries notes written for the
 * retrieval pipeline ("filter that passage by tradition", "refs are by Book");
 * readers only ever see the notes below, which say something true about the
 * text they are about to read.
 */
import type { Figure } from "@/lib/scripture/figures";

export const TRADITION_NAMES: Record<string, string> = {
  protestant: "Protestant",
  catholic: "Catholic",
  orthodox: "Eastern Orthodox",
  ethiopian_orthodox: "Ethiopian Orthodox",
};

const READER_NOTES: Record<string, string> = {
  david: "Psalm 51 is Psalm 50 in Orthodox and Catholic Bibles that follow the Septuagint.",
  elijah: "Despair is not a sin in itself. Elijah's story is here because he was brought so low, and was met there.",
  woman_caught_in_adultery: "This passage (John 7:53–8:11) is not in the earliest manuscripts of John's Gospel.",
  moses_the_ethiopian: "Budge's translation of the Paradise of the Holy Fathers calls him “Moses the Indian”.",
  manasseh: "The Prayer of Manasseh is Scripture in the Orthodox and Ethiopian Orthodox Churches.",
};

export function readerNote(f: Pick<Figure, "id">): string | undefined {
  return READER_NOTES[f.id];
}

export function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

/** A passage reference fit to print: drops the opening-words locators used to find tradition texts. */
function cleanRef(ref: string): string {
  return ref.replace(/,\s*“[^”]*”\s*$/, "");
}

/** The fall and the restoration, each as "Book 1:2-3; Book 4:5". Context passages are left out. */
export function storyRefs(f: Figure): { fall: string[]; restoration: string[] } {
  const live = f.passages.filter((p) => p.sourceId !== "pending");
  const refs = (role: "fall" | "restoration") => [...new Set(live.filter((p) => p.role === role).map((p) => cleanRef(p.ref)))];
  return { fall: refs("fall"), restoration: refs("restoration") };
}

/** People with at least one passage in the library, i.e. whose story can actually be read. */
export function readablePeople(all: Figure[]): Figure[] {
  return all.filter((f) => f.passages.some((p) => p.sourceId !== "pending"));
}
