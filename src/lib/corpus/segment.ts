/**
 * Turning a downloaded text into citable sections. Pure functions, no I/O.
 *
 * WHY NOT JUST CHUNK THE FILE: the old pipeline chunked PDFs page by page, and
 * a page number was a good enough citation because the reader had the same PDF.
 * Here the reader has a Bible and a set of Fathers, not this file. "Brenton
 * Septuagint, offset 41,832" is not checkable by anyone; "Wisdom 3:1" is. So
 * ingestion runs a source-shaped segmenter first, which recovers whatever
 * structure the upstream text actually carries, and chunking then happens
 * WITHIN a section so no chunk ever straddles two references.
 *
 * Three sources, three real formats:
 *
 *   eBible verse-per-line  "GEN 1:1 In the beginning..."  — exact references
 *   CCEL Schaff volumes    underscore-ruled sections with titles — real headings
 *   Internet Archive OCR   loose prose, no structure, variable OCR quality
 *
 * The third is the hard one and is handled honestly rather than optimistically:
 * see textQuality() for what OCR noise does to retrieval and why bad paragraphs
 * are dropped instead of embedded.
 */
import { sanitizeText } from "../chunk";

export interface Section {
  /**
   * The citation a reader can look up: "Genesis 1:1-14", "Homily XI", "Canon
   * VI". Null when the source genuinely has no structure to recover, in which
   * case the ordinal is all the locator there is.
   */
  reference: string | null;
  /** Biblical book, for scripture only. Null everywhere else. */
  book: string | null;
  text: string;
  /** 0-based position in the file, so citations stay orderable without a page. */
  ordinal: number;
}

// ---------------------------------------------------------------------------
// eBible: verse per line
// ---------------------------------------------------------------------------

/**
 * OSIS-ish book codes to the names an Orthodox reader would use.
 *
 * The deuterocanonical entries are the reason this table is written out rather
 * than prettified from the code: TOB, JDT, WIS, SIR, BAR, 1MA, 2MA and the rest
 * are scripture in the Orthodox canon, and a generic Bible book table built for
 * a 66-book Protestant canon silently renders them as their raw codes. The
 * Ethiopian additions (1EN, JUB) are here too, for the same reason.
 */
const BOOK_NAMES: Record<string, string> = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth",
  "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
  "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalms",
  PRO: "Proverbs", ECC: "Ecclesiastes", SNG: "Song of Songs",
  ISA: "Isaiah", JER: "Jeremiah", LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel",
  HOS: "Hosea", JOL: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah",
  NAM: "Nahum", HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah",
  MAL: "Malachi",
  // Deuterocanon / anagignoskomena — scripture in the Orthodox canon.
  TOB: "Tobit", JDT: "Judith", ESG: "Esther (Greek)", WIS: "Wisdom of Solomon",
  SIR: "Sirach", BAR: "Baruch", LJE: "Letter of Jeremiah",
  S3Y: "Song of the Three Young Men", SUS: "Susanna", BEL: "Bel and the Dragon",
  "1MA": "1 Maccabees", "2MA": "2 Maccabees", "3MA": "3 Maccabees", "4MA": "4 Maccabees",
  "1ES": "1 Esdras", "2ES": "2 Esdras", MAN: "Prayer of Manasseh",
  PS2: "Psalm 151", ODA: "Odes", PSS: "Psalms of Solomon",
  // Ethiopian Tewahedo canon.
  ENO: "1 Enoch", JUB: "Jubilees",
  // New Testament.
  MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts",
  ROM: "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians",
  EPH: "Ephesians", PHP: "Philippians", COL: "Colossians",
  "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon",
  HEB: "Hebrews", JAS: "James", "1PE": "1 Peter", "2PE": "2 Peter",
  "1JN": "1 John", "2JN": "2 John", "3JN": "3 John", JUD: "Jude", REV: "Revelation",
};

/** "GEN 1:1 In the beginning..." — code, chapter, verse, text. */
const VERSE_LINE = /^([0-9A-Z]{3})\s+(\d+):(\d+)\s+(.*)$/;

interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Segment an eBible verse-per-line text into passages of contiguous verses.
 *
 * `versesPerSection` is deliberately small. Retrieval over scripture behaves
 * differently from retrieval over prose: a question like "who rose from the
 * dead" is answered by a handful of verses, and burying them in a 800-token
 * block of surrounding chapter drags in text about something else, which both
 * dilutes the embedding and makes the citation vaguer than it needs to be.
 * Sections never cross a chapter boundary, so the reference is always real.
 */
export function segmentEbible(raw: string, versesPerSection = 12): Section[] {
  const verses: Verse[] = [];
  for (const line of sanitizeText(raw).split("\n")) {
    const match = VERSE_LINE.exec(line.trim());
    if (!match) continue; // front matter, book headings, blank lines
    const text = match[4].trim();
    if (!text) continue; // verse present in the versification but absent here
    verses.push({
      book: match[1],
      chapter: Number(match[2]),
      verse: Number(match[3]),
      text,
    });
  }

  const sections: Section[] = [];
  let current: Verse[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    const name = BOOK_NAMES[first.book] ?? first.book;
    const range =
      first.verse === last.verse
        ? `${first.chapter}:${first.verse}`
        : `${first.chapter}:${first.verse}-${last.verse}`;
    sections.push({
      reference: `${name} ${range}`,
      book: name,
      // Verse numbers are kept INLINE in the text, not stripped. They cost a
      // few tokens and they let a generated answer quote "as it says in v.14"
      // and be checkable against the passage the citation names.
      text: current.map((v) => `${v.verse}. ${v.text}`).join(" "),
      ordinal: sections.length,
    });
    current = [];
  };

  for (const verse of verses) {
    const previous = current[current.length - 1];
    const newChapter =
      previous && (previous.book !== verse.book || previous.chapter !== verse.chapter);
    if (newChapter || current.length >= versesPerSection) flush();
    current.push(verse);
  }
  flush();

  return sections;
}

// ---------------------------------------------------------------------------
// CCEL: underscore-ruled sections
// ---------------------------------------------------------------------------

/** CCEL rules each subdivision off with a long run of underscores. */
const CCEL_RULE = /^\s*_{20,}\s*$/;

/**
 * Segment a CCEL Schaff volume on its section rules, titling each section from
 * its own first line.
 *
 * The volumes are one 3–5MB file holding dozens of separate works — NPNF2-13
 * alone is Gregory the Great, Ephrem the Syrian and Aphrahat — so without this
 * every citation in the corpus would read "NPNF2-13" and the reader would have
 * no idea which Father, let alone which homily, an answer came from.
 *
 * `volumeTitle` prefixes each reference, so the citation names the volume AND
 * the piece: "NPNF2-13 — Demonstration VII. Of Penitents".
 */
export function segmentCcel(raw: string, volumeTitle: string): Section[] {
  const blocks = sanitizeText(raw)
    .split("\n")
    .reduce<string[][]>(
      (acc, line) => {
        if (CCEL_RULE.test(line)) acc.push([]);
        else acc[acc.length - 1].push(line);
        return acc;
      },
      [[]],
    );

  const sections: Section[] = [];
  for (const block of blocks) {
    const lines = block.map((l) => l.trimEnd());
    const firstIndex = lines.findIndex((l) => l.trim().length > 0);
    if (firstIndex === -1) continue;

    const candidate = lines[firstIndex].trim();
    // A heading is a short line standing alone above a blank. Anything longer
    // is the first line of a paragraph and must stay in the body — losing it
    // would silently drop a sentence from the corpus.
    const isHeading =
      candidate.length <= 100 &&
      (lines[firstIndex + 1] ?? "").trim().length === 0 &&
      !candidate.endsWith(",");

    const title = isHeading ? candidate.replace(/\s+/g, " ") : null;
    const body = (isHeading ? lines.slice(firstIndex + 1) : lines.slice(firstIndex))
      .join("\n")
      .trim();

    // CCEL's table of contents and navigation blocks come through as short
    // stubs. They carry no teaching and would answer questions with a list of
    // chapter names, so anything too small to hold a thought is dropped.
    if (body.length < 200) continue;

    sections.push({
      reference: title ? `${volumeTitle} — ${title}` : volumeTitle,
      book: null,
      text: body,
      ordinal: sections.length,
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Internet Archive OCR
// ---------------------------------------------------------------------------

/**
 * How much of this text reads like real English prose, from 0 to 1.
 *
 * THE PROBLEM THIS SOLVES: `_djvu.txt` is raw OCR of a scanned book, and the
 * books here are the worst case for it — 1900s critical editions set in small
 * type, with Greek, Syriac and Ge'ez in the apparatus, running heads, line
 * numbers and marginalia. Real output from the corpus:
 *
 *   "G* 'and a tree shall be planted \ninit', Is this 'the plant of righteous-"
 *
 * Embedding that does not merely waste a row. It puts a vector with no meaning
 * into the same space as the real passages, where it can out-rank them for a
 * query it happens to sit near, and then be quoted to a person asking about
 * their own life. The corpus is only as trustworthy as its worst retrievable
 * chunk, so text this damaged is dropped at ingestion and never reaches the
 * database.
 *
 * The score is a blunt instrument on purpose: no dictionary, no language model,
 * nothing that can itself be wrong in a subtle way. It asks three things a
 * scanned page of English prose reliably satisfies and OCR mush reliably does
 * not — that most characters are letters or ordinary punctuation, that most
 * "words" are plausible English word shapes, and that the words are not
 * pathologically short.
 */
export function textQuality(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  const words = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((w) => w.length > 0);
  if (words.length < 5) return 0; // too short to judge; not worth embedding

  // 1. Character sanity. Straight quotes and plain punctuation only: the curly
  //    quotes, accents and stray diacritics that OCR sprays over a scan of a
  //    critical edition are exactly what should count against it here.
  const clean = trimmed.match(/[A-Za-z0-9\s.,;:'"()?!\-—–]/g)?.length ?? 0;
  const charScore = clean / trimmed.length;

  // 2. Function words — the real language signal, and the one that does the
  //    work. English prose is 30-50% function words no matter its subject or
  //    century; OCR mush, word lists and transliterated Greek are not. An
  //    earlier version of this scorer tested word SHAPE instead, and rated
  //    "kuelantaha may be corrupt for balaleha" at 0.93, because every token in
  //    it is shaped like a word. Shape is not language.
  const functionWords = words.filter((w) => FUNCTION_WORDS.has(w)).length;
  const functionRatio = functionWords / words.length;
  const functionScore = Math.min(functionRatio / 0.3, 1);

  // 3. Fragmentation: OCR failure shatters words into one- and two-character
  //    pieces. Genuinely short English words are excluded so ordinary prose is
  //    not penalised for containing "of" and "the".
  const junk = words.filter((w) => w.length <= 2 && !SHORT_WORDS.has(w)).length;
  const fragmentScore = 1 - junk / words.length;

  // 4. Digit density. This is what catches the back-of-book index, and it was
  //    added after inspecting the real distribution: at the threshold, the
  //    paragraphs sitting just ABOVE the line were index entries —
  //    "Isaac, 12, 67, 90, 100, 104, 112, 126, 143" — which are shaped like
  //    prose to every other test here and are worthless in an index of
  //    meaning. A reader asking about Isaac should get the passage about him,
  //    not a list of the pages he is mentioned on.
  const numeric = words.filter((w) => /^\d/.test(w)).length;
  const numericScore = 1 - Math.min(numeric / words.length / 0.25, 1);

  // 5. Mean word length, as a backstop for text that is neither function words
  //    nor fragments — a column of surnames, a page of catalogue numbers.
  const meanLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const lengthScore = Math.min(meanLength / 4.5, 1);

  return (
    charScore * 0.25 +
    functionScore * 0.3 +
    fragmentScore * 0.15 +
    numericScore * 0.2 +
    lengthScore * 0.1
  );
}

/**
 * English function words, including the archaic forms this corpus is full of.
 *
 * The archaic entries are not decoration: every translation here is between
 * 1611 and 1928, and "thee/thou/hath/unto/ye" carry the same signal in this
 * corpus that "you/has/to" carry in modern prose. Omitting them would score the
 * King James psalms and the desert fathers as less like English than a modern
 * newspaper, which is the opposite of what this filter is for.
 */
const FUNCTION_WORDS = new Set([
  "the", "of", "and", "to", "a", "in", "that", "is", "was", "he", "for", "it",
  "with", "as", "his", "on", "be", "at", "by", "i", "this", "had", "not", "are",
  "but", "from", "or", "have", "an", "they", "which", "one", "you", "were",
  "her", "all", "she", "there", "would", "their", "we", "him", "been", "has",
  "when", "who", "will", "no", "if", "out", "so", "said", "what", "up", "its",
  "about", "into", "than", "them", "can", "only", "other", "new", "some",
  "could", "these", "then", "do", "first", "any", "my", "now", "such", "like",
  "our", "over", "man", "me", "even", "most", "made", "after", "also", "did",
  "many", "before", "must", "through", "back", "years", "where", "much", "your",
  "may", "well", "down", "should", "because", "each", "just", "those", "how",
  "too", "little", "shall", "upon", "unto", "thou", "thee", "thy", "thine",
  "ye", "hath", "doth", "art", "saith", "himself", "against", "same", "own",
  "under", "while", "both", "us", "come", "came", "let", "say", "god", "lord",
]);

/** Two-letter-or-shorter words that are real English, not OCR debris. */
const SHORT_WORDS = new Set([
  "a", "i", "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is",
  "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we", "ye",
  "am", "ah", "o", "oh",
]);

/**
 * The floor a paragraph must clear to be ingested.
 *
 * Calibrated against the actual corpus rather than chosen for roundness: clean
 * CCEL prose scores ~0.95, the readable body text of the archive scans ~0.75-0.9,
 * and the critical apparatus that motivated this scores ~0.3-0.5. 0.62 sits in
 * the gap, and scripts/inspect-corpus.ts prints the distribution per work so
 * the number can be re-checked against any text added later.
 */
export const MIN_TEXT_QUALITY = 0.72;

/**
 * The shortest OCR paragraph worth considering at all.
 *
 * A LENGTH FLOOR DOES WORK NO QUALITY SCORE CAN. Inspecting the real
 * distribution showed the paragraphs sitting either side of the threshold were
 * not damaged prose at all — they were the back-of-book index, the table of
 * contents and the running heads:
 *
 *   "65. The Sin of Solomon 104"
 *   "345, 347, 838-40 Victor the Alexandrian, 1255"
 *   "SIXTH MONTH — YAKATIT (FEB. 6-MARCH 6) 573"
 *
 * These are perfectly legible. A scorer measuring how much text LOOKS like
 * English will always rate them highly, because they are English; they are
 * simply not prose, and no amount of tuning separates them from a real sentence
 * on those grounds. What does separate them is structural and unambiguous: a
 * paragraph of a book runs to hundreds of characters, and an index line does
 * not. Two cheap independent tests beat one over-tuned one.
 *
 * The cost is losing genuinely short passages — a one-line saying of a desert
 * father standing alone as its own paragraph. That is a real loss, and it is
 * accepted because the sayings collections in this corpus set each saying as a
 * full paragraph with its attribution, which clears this comfortably.
 */
export const MIN_OCR_PARAGRAPH_CHARS = 200;

/**
 * Segment loose OCR text into paragraphs, dropping what is too damaged to use.
 *
 * Returns the kept sections plus a count of what was rejected, because a work
 * that loses most of itself here is a cataloguing problem — a bad scan, or an
 * edition that is mostly apparatus — and that should be visible in the ingest
 * output rather than silently producing a thin, useless document.
 */
/**
 * Drop everything before the line where the work itself begins.
 *
 * Returns the text unchanged when the marker is absent — including when it was
 * given but not found, which is deliberate. A marker that no longer matches
 * (a re-scanned item, a corrected OCR pass) must not silently discard the
 * entire work; ingestion reports the miss instead, and the reader gets the
 * whole book rather than nothing.
 */
export function trimToTextStart(raw: string, marker?: string): { text: string; found: boolean } {
  if (!marker) return { text: raw, found: false };

  // Whitespace in the marker matches ANY run of whitespace. OCR of a printed
  // page routinely doubles the spaces between words — one edition here renders
  // the opening line as "This  is  the  history  of  the  division" — so a
  // literal match silently fails on exactly the works this exists for, and
  // fails in the direction that ingests the front matter anyway.
  const pattern = new RegExp(
    marker.trim().split(/\s+/).map(escapeRegExp).join("\\s+"),
    "gi",
  );

  // The LAST match, not the first. An editor who quotes the work's opening line
  // in their introduction — which is exactly what an introduction to a book
  // does — would otherwise anchor the trim inside the front matter and keep
  // most of it. The text proper always comes after everything written about it.
  let at = -1;
  for (const match of raw.matchAll(pattern)) at = match.index;
  if (at === -1) return { text: raw, found: false };

  return { text: raw.slice(at), found: true };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function segmentOcr(
  raw: string,
  workTitle: string,
  minQuality = MIN_TEXT_QUALITY,
): { sections: Section[]; rejected: number; rejectedChars: number; tooShort: number } {
  const all = sanitizeText(raw)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter((p) => p.length > 0);

  const paragraphs = all.filter((p) => p.length >= MIN_OCR_PARAGRAPH_CHARS);
  const tooShort = all.length - paragraphs.length;

  const sections: Section[] = [];
  let rejected = 0;
  let rejectedChars = 0;

  // Consecutive good paragraphs are merged so a chunk has room to hold a whole
  // argument; a rejected paragraph breaks the run, because gluing across a hole
  // in the text would join two passages that are not actually adjacent.
  let run: string[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    sections.push({
      reference: `${workTitle} (part ${sections.length + 1})`,
      book: null,
      text: run.join("\n\n"),
      ordinal: sections.length,
    });
    run = [];
  };

  for (const paragraph of paragraphs) {
    if (textQuality(paragraph) >= minQuality) {
      run.push(paragraph);
      // Cap a run so one unbroken stretch of good scan does not become a single
      // enormous section; chunking still splits it, but sections are the unit
      // the reference names, so they should stay small enough to be a locator.
      if (run.join("\n\n").length > 6000) flush();
    } else {
      rejected++;
      rejectedChars += paragraph.length;
      flush();
    }
  }
  flush();

  return { sections, rejected, rejectedChars, tooShort };
}
