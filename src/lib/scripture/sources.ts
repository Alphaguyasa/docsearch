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
const ETHIOPIAN_MONTHS: Record<string, string> = {
  FIRST: "Maskaram", SECOND: "Teqemt", THIRD: "Hedar", FOURTH: "Takhsas", FIFTH: "Ter",
  SIXTH: "Yakatit", SEVENTH: "Maggabit", EIGHTH: "Miyazya", NINTH: "Genbot", TENTH: "Sane",
  ELEVENTH: "Hamle", TWELFTH: "Nahase", THIRTEENTH: "Pagumen",
};
const MONTHS =
  /^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH)\s+MONTH\b/i;

interface TextRule {
  refPrefix: string;
  traditions: Tradition[];
  clean: CleanOptions;
  defaultHeading: string;
  /** OCR sources: rule-driven sections instead of generic heading detection. */
  sections?: SectionRule;
  /** The text numbers its own paragraphs: refs become "§12–15" (see chunkSections). */
  paragraphNumbers?: boolean;
  /** Rename detected headings (exact match); "" leaves just the work's name in the ref. */
  renameHeadings?: Record<string, string>;
}

/** Footnotes and index lines common to the OCR scans. */
const FOOTNOTE = /^[\^*†‡§]\s?|^\d{1,2}\s+(Lit\.|Cf\.|See|Or|i\.e\.|Reading|Read)\b/;
const INDEX_LINE = /\d+\s*,\s*\d+/;

/** CCEL plain text (Schaff's Fathers): rules, separators and "[614] Luke ii. 29." footnotes. */
const CCEL: CleanOptions = {
  dropLines: [/^[_-]{10,}$/],
  dropParagraphs: /^\[\d+\]\s/,
  // Footnote calls, without leaving a space before punctuation ("wealth [12] ," -> "wealth,").
  strip: /\s?\[\d+\]\s*(?=[,.;:?!])|\s?\[\d+\]/g,
};

export const TEXT_RULES: Record<string, TextRule> = {
  enoch: {
    refPrefix: "Book of Enoch",
    traditions: ["ethiopian_orthodox"],
    clean: {
      startAt: /^CHAPTER I\.$/,
      replace: [
        // The OCR reads "I" and "]" as "|": "from them | heard", "[of their ungodliness|".
        [/(^|[ \t])\|(?=\s)/gm, "$1I"],
        [/\|/g, "]"],
        // Numerals the OCR got wrong in a way the sequence can't settle
        // (Charles prints 92, 91, 93 in that order).
        [/^CHAPTER LXIil\.[ \t]*$/m, "CHAPTER LXII."],
        [/^CHAPTER XCIIl\.[ \t]*$/m, "CHAPTER XCIII."],
        [/(^CHAPTER LXXVII\.\s*$[\s\S]*?^)CHAPTER LXXVII\./m, "$1CHAPTER LXXVIII."],
        // The heading of chapter CII is lost in the scan.
        [/^(1\. In those days when He hath brought a grievous fire upon you)/m, "CHAPTER CII.\n\n$1"],
      ],
      dropLines: [/^www\.globalgrey/, /^The Book of Enoch By R\. ?H\. Charles/, /^THE BOOK OF ENOCH$/, /^[IVXLC]+-[IVXLC]+\b/, /^[IVXLC][IVXLCxil]+\.\s/, /^Chapter [IVXLCl]+\.$/, /^ee$/],
      // Charles's brackets mark his emendations; readers only need the words.
      strip: /\[|\]/g,
    },
    defaultHeading: "Chapter I",
    sections: { sectionStart: /^CHAPTER [IVXLCxil ]+\.?$/, name: "chapterNumeral" },
    paragraphNumbers: true,
  },
  kebra_nagast: {
    refPrefix: "Kebra Nagast",
    traditions: ["ethiopian_orthodox"],
    clean: {
      startAt: /^THE\s+GLORY\s+OF\s+KINGS$/,
      // OCR slips in the chapter titles.
      replace: [
        [/KlNG/g, "KING"],
        [/ZlON/g, "ZION"],
        [/GlFT/g, "GIFT"],
        [/^GLDRY/m, "GLORY"],
        [/ROB\^L/g, "ROBEL"],
        [/TAMR!N/g, "TAMRIN"],
        [/R6M[&£]|RoMK/g, "ROME"],
      ],
      endAt: /^INDEX$/,
      dropLines: [/^THE GLORY OF KINGS$/, /^The Queen of[- ]?Sh.ba and her Son Menyelek$/, /^PL.TE\b/, /^From Brit\./, /^Colophon$/],
      // Page-foot notes: "1 Genesis i, 26.", "* Compare Genesis ix, 25-27."
      dropParagraphs: /^[1-9*•†§]\s+[A-Z(]/,
    },
    defaultHeading: "The Glory of Kings",
    sections: { sectionStart: /^([0-9iIl]{1,3})\s?[.,:-]\s?(.{4,})$/, name: "numberedChapter" },
  },
  adam_and_eve: {
    refPrefix: "The Book of Adam and Eve",
    traditions: ["ethiopian_orthodox"],
    clean: {
      startAt: /^BOOK I\.$/,
      endAt: /^INDEX\.?$/,
      replace: [
        // "CHAPTER LIIL" / "CHAPTER LXXIIL": a final I misread as L.
        [/^(CHAPTER [IVXL ]*I)L[ \t]*$/gm, "$1I."],
        // "0 God" is the OCR of "O God".
        [/(^|["“\s])0\s+(?=[A-Z])/gm, "$1O "],
      ],
      // Page headers: "2 THE BOOK OF ADAM AND EVE. [BOOK", "i.] THE CAVE OF TREASURES. 7".
      dropLines: [/THE BOOK OF ADAM AND EVE/, /^[ivxlI1]+\.\]\s/, /\b(CAVE|TREASURES)\b.*\d+$/],
      // Footnotes at the page foot: "* The Ethiopic translator adds…", "f Of the week…", "1 Heb. …".
      dropParagraphs: /^[*†‡§ft\d]{1,2}\s+\S/,
      // Note calls: "day,f", "planted1", "heaven .4J".
      strip: /(?<=[a-z][,.;:]?)\d{1,2}(?=[\s,.;:]|$)|(?<=[,.;:]\s*)[ft*§†](?=\s|$)|\s\.\d[A-Z]?(?=\s|$)/g,
    },
    defaultHeading: "Book I",
    sections: {
      runningContext: /^(?:\[)?BOOK (I|II|III|IV)\.?\]?$/,
      contextLabel: (n: string) => `Book ${n}`,
      sectionStart: /^CHAPTER [IVXLCYTxil ]+[.§ ]*$/,
      name: "chapterNumeral",
    },
  },
  jubilees: {
    refPrefix: "Book of Jubilees",
    traditions: ["ethiopian_orthodox"],
    clean: {
      startAt: /^Prologue$/,
      endAt: /^INDEX$/,
      dropLines: [/THE BOOK OF JUBILEES/, /^\([ivxl]+\.\s*\d/],
      // Page-foot notes: "1 The effect of a solar year…", "• For 33-34 cf. 1 Enoch…", "' A lunar year…".
      dropParagraphs: /^[1-9*•'’■>§†]{1,2}\s+\S/,
      // Note calls: "world,3", "feasts.1", "soon.*", "days l of", "of 2 their".
      strip: /(?<=[A-Za-z][.,;:!?"”)\]]{0,2})[1-9*•§](?=\s|$)|(?<=\s)[1-9l*•§](?=\s)/g,
    },
    defaultHeading: "Prologue",
    sections: { sectionStart: /^([IVXLl]+)\.[1-9*]?\s+(?=[A-Z])/, name: "romanChapterStart" },
  },
  ephrem: {
    refPrefix: "Ephrem the Syrian",
    traditions: ALL,
    clean: {
      ...CCEL,
      startAt: /^Three Homilies\.$/,
      endAt: /^Aphrahat\.$/,
      dropLines: [...CCEL.dropLines!, /^Three Homilies\.$/],
    },
    defaultHeading: "Three Homilies",
    sections: { sectionStart: /^On (Our Lord|Admonition and Repentance|the Sinful Woman)\.$/, name: "contextLine" },
    paragraphNumbers: true,
  },
  aphrahat: {
    refPrefix: "Aphrahat",
    traditions: ALL,
    clean: {
      ...CCEL,
      startAt: /^Letter of an Inquirer\.$/,
      endAt: /^Indexes$/,
      dropLines: [...CCEL.dropLines!, /^The "Demonstrations" of Aphrahat\.$/],
    },
    defaultHeading: "Letter of an Inquirer",
    sections: { sectionStart: /^(Letter of an Inquirer\.|Demonstration [IVXL]+\.--.+)$/, name: "contextLine" },
    paragraphNumbers: true,
  },
  cyril_repentance: {
    refPrefix: "Cyril of Jerusalem",
    traditions: ALL,
    clean: {
      ...CCEL,
      startAt: /^Lecture II\.$/,
      endAt: /^Lecture III\.$/,
      dropLines: [...CCEL.dropLines!, /^On Repentance and Remission of Sins/],
    },
    defaultHeading: "Lecture II",
    sections: { sectionStart: /^Lecture II\.$/, name: "contextLine" },
    paragraphNumbers: true,
    renameHeadings: { "Lecture II": "Catechetical Lecture II, On Repentance" },
  },
  chrysostom_theodore: {
    refPrefix: "John Chrysostom",
    traditions: ALL,
    clean: {
      ...CCEL,
      startAt: /^an exhortation to theodore after his fall\.$/,
      endAt: /^St\. Chrysostom:$/,
      dropLines: [...CCEL.dropLines!, /^an exhortation to theodore after his fall\.$/],
    },
    defaultHeading: "Letter I",
    sections: { sectionStart: /^Letter (I|II)\.$/, name: "contextLine" },
    paragraphNumbers: true,
    renameHeadings: { "Letter I": "Letter to Theodore after his Fall", "Letter II": "Second Letter to Theodore" },
  },
  antony: {
    refPrefix: "Athanasius, Life of Antony",
    traditions: ALL,
    // The dedicatory preface is skipped: the numbered Life starts at §1.
    clean: { ...CCEL, startAt: /^1\. Antony you must know/, endAt: /^Introduction to Ad Episcopos/ },
    defaultHeading: "",
    paragraphNumbers: true,
  },
  isaac: {
    refPrefix: "Isaac of Nineveh",
    traditions: ALL,
    clean: {
      startAt: /^SIX TREATISES ON THE BEHAVIOUR OF/,
      endAt: /^REGISTER$/,
      replace: [[/^EX[ \t]*$/m, "IX"], [/(^|\s)\|(?=\s)/gm, "$1I"]],
      dropLines: [
        // Page headers: the treatise title cut short with "ETC." and a page number, often misread.
        /\b(ETC|EIC|FTC|EC|HEC|SUC)\b[.,]?\s*[^a-z]*$/,
        /^(SIX TREATISES ON THE BEHAVIOUR OF|EXCELLENCE\b)/,
      ],
      dropParagraphs: /^[1-9*]\)\s/,
      strip: /\s?[1-9]\)(?=[\s,.;:]|$)/g,
    },
    defaultHeading: "Treatise I: Six Treatises on the Behaviour of Excellence",
    sections: { sectionStart: /^([IVXLCxil]{1,7})$/, name: "loneNumeral", label: "Treatise" },
  },
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
      // The ordinal survives OCR; the small-caps month name does not.
      runningContext:
        /^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH)\s+MONTH\b/i,
      contextLabel: (ordinal: string) => ETHIOPIAN_MONTHS[ordinal.toUpperCase()] ?? ordinal,
      sectionStart: /^(\[fol[^\]]*\]\s*)?IN THE NAME OF THE FATHER/i,
      name: "contextFirstWords",
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
  const sections = (
    rule.sections ? sectionize(lines, rule.sections, rule.defaultHeading) : toSections(lines, rule.defaultHeading)
  ).map((s) => (rule.renameHeadings && s.heading in rule.renameHeadings ? { ...s, heading: rule.renameHeadings[s.heading] } : s));
  const chunks = chunkSections(sections, {
    sourceId,
    title: entry.title,
    refPrefix: rule.refPrefix,
    traditions: rule.traditions,
    paragraphNumbers: rule.paragraphNumbers,
  });
  return { chunks, skippedBooks: [] };
}
