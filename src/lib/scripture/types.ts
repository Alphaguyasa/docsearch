import type { Tradition } from "./canon";

/** One verse after USFM markup has been removed. */
export interface Verse {
  book: string; // USFM code, e.g. "2SA"
  chapter: number;
  verse: number;
  text: string;
  /** Section heading (\s) that opens at this verse, if any. */
  heading?: string;
  /** True when this verse starts a new paragraph or poetry block. */
  paragraphStart: boolean;
}

/** A chunk ready to embed and store. */
export interface ScriptureChunk {
  sourceId: string;
  /** Unique per document: "web:2SA" for a Bible book, the source id otherwise. */
  documentKey: string;
  documentTitle: string;
  chunkIndex: number;
  ref: string;
  book: string | null;
  chapterStart: number | null;
  verseStart: number | null;
  verseEnd: number | null;
  /** What gets embedded and shown: a header line with the ref, then the text. */
  content: string;
  tokenCount: number;
  traditions: Tradition[];
}
