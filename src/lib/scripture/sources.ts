/**
 * Per-source parsing rules and the corpus builder: raw files -> chunks.
 * I/O is limited to reading the raw files named in the manifest.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync, strFromU8 } from "fflate";

import { canonByCode, TRADITIONS, type Tradition } from "./canon";
import {
  chunkBook,
  chunkSections,
  cleanText,
  sectionize,
  toSections,
  type CleanOptions,
  type SectionRule,
} from "./chunk-scripture";
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
  /** OCR sources: rule-driven sections instead of generic heading detection. */
  sections?: SectionRule;
}

/** Footnotes and index lines common to the OCR scans. */
const FOOTNOTE = /^[\^*†‡§]\s?|^\d{1,2}\s+(Lit\.|Cf\.|See|Or|i\.e\.|Reading|Read)\b/;
const INDEX_LINE = /\d+\s*,\s*\d+/;

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
    clean: {
      startAt: /^PROLOGUE\b/,
      dropLines: [/^[\dIl]+\s+THE LAUSIAC HISTORY$/i, /^THE LAUSIAC HISTORY$/i, FOOTNOTE, INDEX_LINE],
      inline: [/\[\d+\]\s*/g],
    },
    defaultHeading: "Prologue",
    // Right-hand running header: chapter title + page number.
    sections: { runningTitle: /^([A-Z][A-Z .,'’&()-]{3,}?)[\s.•·-]*\d{1,3}$/ },
  },
  paradise: {
    refPrefix: "Paradise of the Holy Fathers",
    traditions: ["catholic", "orthodox", "ethiopian_orthodox"],
    clean: {
      dropLines: [/par[ao]bise|paradise/i, /^contents\b/i, FOOTNOTE, INDEX_LINE],
    },
    defaultHeading: "Introduction",
    // Blackletter chapter lines OCR badly; name each chapter by its opening words.
    sections: { sectionStart: /^Chapter\b/i, name: "firstWords" },
  },
  synaxarium: {
    refPrefix: "Ethiopian Synaxarium",
    traditions: ["ethiopian_orthodox"],
    clean: {
      dropLines: [
        /^[#\d\s]*THE ETHIOPIC SYNAXARIUM$/i,
        /^(SON )?AND THE HOLY GHOST,? ONE GOD\.?$/i,
        /^\d+\s+THE BOOK OF THE SAINTS/i,
        FOOTNOTE,
        INDEX_LINE,
      ],
      inline: [/\[fol\.[^\]]*\]/gi],
    },
    defaultHeading: "Preface",
    // Each day opens with the Trinitarian invocation; the month comes from the running header.
    sections: {
      runningContext:
        /^(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH)\s+MONTH\s*[—–-]+\s*([A-Za-z'’]+)/i,
      sectionStart: /^(\[fol[^\]]*\]\s*)?IN THE NAME OF THE FATHER/i,
      name: "contextCounter",
    },
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
  const sections = rule.sections
    ? sectionize(lines, rule.sections, rule.defaultHeading)
    : toSections(lines, rule.defaultHeading);
  const chunks = chunkSections(sections, {
    sourceId,
    title: entry.title,
    refPrefix: rule.refPrefix,
    traditions: rule.traditions,
  });
  return { chunks, skippedBooks: [] };
}
