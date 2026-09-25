/**
 * Per-source parsing rules and the corpus builder: raw files -> chunks.
 * I/O is limited to reading the raw files named in the manifest.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync, strFromU8 } from "fflate";

import { canonByCode, TRADITIONS, type Tradition } from "./canon";
import { chunkBook, chunkSections, cleanText, toSections, type CleanOptions } from "./chunk-scripture";
import type { Manifest } from "./manifest";
import type { ScriptureChunk } from "./types";
import { PERIPHERAL, parseUsfm } from "./usfm";

const ALL: Tradition[] = [...TRADITIONS];
const MONTHS =
  /^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH)\s+MONTH\b/i;

interface TextRule {
  refPrefix: string;
  traditions: Tradition[];
  clean: CleanOptions;
  defaultHeading: string;
}

export const TEXT_RULES: Record<string, TextRule> = {
  confessions: {
    refPrefix: "Confessions",
    traditions: ALL,
    clean: { startAt: /^BOOK I$/, endAt: /^\*\*\* END OF THE PROJECT GUTENBERG/ },
    defaultHeading: "BOOK I",
  },
  lausiac: {
    refPrefix: "Lausiac History",
    traditions: ALL,
    clean: { endAt: /^INDEX\b/, dropLines: [/^THE LAUSIAC HISTORY\s*\d*$/i, /^\d+\s+THE LAUSIAC HISTORY/i] },
    defaultHeading: "Introduction",
  },
  paradise: {
    refPrefix: "Paradise of the Holy Fathers",
    traditions: ["catholic", "orthodox", "ethiopian_orthodox"],
    clean: { endAt: /^INDEX\b/, dropLines: [/^THE PARADISE OF THE (HOLY )?FATHERS\s*\d*$/i, /^\d+\s+THE PARADISE/i] },
    defaultHeading: "Introduction",
  },
  synaxarium: {
    refPrefix: "Ethiopian Synaxarium",
    traditions: ["ethiopian_orthodox"],
    clean: {
      endAt: /^INDEX\b/,
      dropLines: [MONTHS, /^\d+\s+THE BOOK OF THE SAINTS/i, /^THE BOOK OF THE SAINTS/i],
      inline: [/\[?fol\.\s*\d+\s*[ab]?\s*\d?\]?/gi],
    },
    defaultHeading: "Preface",
  },
};

export interface BuildResult {
  chunks: ScriptureChunk[];
  skippedBooks: string[];
}

/** Build every chunk for one manifest entry. */
export function buildSource(rawDir: string, manifest: Manifest, sourceId: string): BuildResult {
  const entry = manifest.entries.find((e) => e.id === sourceId);
  if (!entry) throw new Error(`build: ${sourceId} not in manifest`);

  if (entry.format === "usfm-zip") {
    const canon = canonByCode();
    const chunks: ScriptureChunk[] = [];
    const skippedBooks: string[] = [];
    for (const f of entry.files) {
      const files = unzipSync(readFileSync(join(rawDir, sourceId, f.name)));
      const names = Object.keys(files).filter((n) => /\.(usfm|sfm)$/i.test(n)).sort();
      for (const name of names) {
        const book = parseUsfm(strFromU8(files[name]));
        const info = canon.get(book.code);
        if (!info) {
          if (PERIPHERAL.has(book.code)) {
            skippedBooks.push(book.code);
            continue;
          }
          throw new Error(`build: ${name} has book code ${book.code}, not in data/canon.json`);
        }
        if (info.skip) {
          skippedBooks.push(book.code);
          continue;
        }
        chunks.push(
          ...chunkBook(book.verses, {
            sourceId,
            code: book.code,
            bookName: info.name,
            traditions: info.traditions,
          }),
        );
      }
    }
    return { chunks, skippedBooks };
  }

  const rule = TEXT_RULES[sourceId];
  if (!rule) throw new Error(`build: no text rule for ${sourceId}`);
  const lines = entry.files.flatMap((f) =>
    cleanText(readFileSync(join(rawDir, sourceId, f.name), "utf8"), rule.clean),
  );
  const sections = toSections(lines, rule.defaultHeading);
  const chunks = chunkSections(sections, {
    sourceId,
    title: entry.title,
    refPrefix: rule.refPrefix,
    traditions: rule.traditions,
  });
  return { chunks, skippedBooks: [] };
}
