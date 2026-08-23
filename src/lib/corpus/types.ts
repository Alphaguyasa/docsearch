/**
 * The metadata model for the Orthodox corpus.
 *
 * WHY THIS EXISTS AT ALL: the previous corpus was arXiv papers, where a
 * document is a flat unit and "title + page" is a sufficient citation. Neither
 * holds here. A user asking "what do the Fathers say about despair" is asking
 * across ~1,700 years, two communions and six liturgical lineages, and an
 * answer that cites "npnf201.txt, p.412" is useless to them — they need
 * "St John Chrysostom, Homilies on Matthew 33.4". A user asking "does the
 * Ethiopian Church accept Enoch as scripture" needs the answer to know that
 * 1 Enoch is canonical in Tewahedo and not in Byzantine use.
 *
 * So every work carries the provenance needed to (a) cite it the way an
 * Orthodox reader expects, (b) filter or group retrieval by tradition, and
 * (c) say honestly which tradition a given passage speaks for.
 */

/**
 * The two communions this site serves. Most of the corpus is `both`: everything
 * written before Chalcedon (451) is shared inheritance, and saying otherwise
 * would misrepresent it. Only post-schism material is marked one-sided.
 */
export type Tradition = "eastern" | "oriental" | "both";

/**
 * The particular Church or rite a work belongs to. Orthogonal to `Tradition`:
 * the Coptic, Ethiopian, Syriac, Armenian and Malankara Churches are all
 * Oriental Orthodox, and Greek, Slavic, Antiochian, Georgian and Romanian use
 * is all Eastern Orthodox — but "what does the Ethiopian Church say" is a real
 * question that `Tradition` alone cannot answer.
 *
 * `undivided` marks the pre-Chalcedonian inheritance both communions claim.
 */
export type Lineage =
  | "undivided"
  | "greek"
  | "byzantine"
  | "slavic"
  | "antiochian"
  | "georgian"
  | "coptic"
  | "ethiopian"
  | "syriac"
  | "armenian"
  | "malankara"
  | "latin"; // Western Fathers the East reads and venerates (Ambrose, Leo, Cassian)

/**
 * What kind of book this is. Drives both retrieval weighting and how an answer
 * is allowed to speak: a canon of an Ecumenical Council carries a different
 * authority from one desert elder's saying, and the answer must not flatten
 * the two into a single undifferentiated "the Church teaches".
 */
export type Category =
  | "scripture" // Old and New Testament, in the canon of the tradition
  | "deuterocanon" // books canonical in some Orthodox canons, not all
  | "patristic" // the Fathers: treatises, homilies, letters
  | "ascetic" // the spiritual/monastic tradition: sayings, ladders, chapters
  | "liturgical" // service books, anaphoras, hymnography
  | "canon-law" // canons of councils and Fathers
  | "council" // acts and definitions of the Ecumenical Councils
  | "hagiography" // lives of the saints, synaxaria, martyrologies
  | "history"; // church history and chronicles

/** Where the text is fetched from, and how its URL is built. */
export type Source =
  /**
   * Christian Classics Ethereal Library. Serves each Schaff volume as one
   * pre-rendered plain-text file at a stable /cache/ path. This is the spine of
   * the corpus: the 38 Ante-Nicene and Nicene & Post-Nicene volumes are the
   * standard English Fathers, and they are public domain (1885–1900).
   */
  | { kind: "ccel"; ref: string } // ref e.g. "schaff/anf01"
  /**
   * Internet Archive full text. `_djvu.txt` is OCR, so quality varies with the
   * scan — see cleanText() in ingest for what that costs and how it is handled.
   */
  | { kind: "archive"; identifier: string }
  | { kind: "gutenberg"; ebookId: number }
  /**
   * eBible.org "verse per line" archive: one zip per translation, one file per
   * book, one verse per line prefixed with its OSIS reference. The only source
   * here that gives scripture real chapter:verse structure, which is what makes
   * a citation like "Wisdom 3:1" possible instead of a page number.
   */
  | { kind: "ebible"; translationId: string };

export interface Work {
  /** Stable slug. Used as the on-disk filename and the document key. */
  id: string;
  title: string;
  /** Author as an Orthodox reader names them, e.g. "St John Chrysostom". */
  author: string | null;
  tradition: Tradition;
  lineages: Lineage[];
  category: Category;
  /**
   * Century the work was composed, as a number (4 = 300s). Null for
   * compilations spanning centuries. Lets an answer say "a 4th-century
   * Egyptian monk" rather than treating all sources as contemporaries.
   */
  century: number | null;
  /** Year of the English translation — the thing that is public domain. */
  translationYear: number | null;
  translator: string | null;
  source: Source;
  /**
   * Why this text is legal to redistribute. Every entry must be public domain;
   * this field records the reason so the claim is auditable rather than
   * assumed. Modern translations still in copyright are deliberately absent —
   * see docs/CORPUS.md for the notable gaps that causes.
   */
  license: "public-domain";
  /**
   * Ingestion order override. Lower goes first; omitted means "use the default
   * for this category".
   *
   * Needed because embedding the corpus is a day of wall-clock time against a
   * rate limit, so the order decides what the site can answer in its first
   * hour. Category alone gets that wrong in one specific way: the four scripture
   * translations are near-duplicates of each other, and ingesting all four
   * before a single Father costs eight hours to answer questions that two of
   * them already answer. Brenton (the Orthodox Old Testament) and the World
   * English Bible (which supplies the New Testament Brenton lacks) go first; the
   * King James and Douay-Rheims are second witnesses and can wait.
   */
  priority?: number;
  /**
   * Where the work itself begins, for editions padded with editorial matter.
   *
   * WHY THIS EXISTS. The public-domain editions of 1 Enoch and Jubilees are
   * scholars' critical editions: a 6,000-line introduction on Maccabean
   * politics and textual recensions, and only then the text. Ingested whole,
   * the introduction is the majority of the file, so a question about the flood
   * retrieves R. H. Charles arguing about Hellenism in 1902 — correctly cited,
   * and labelled `category: "scripture"`, because the WORK is scripture in the
   * Ethiopian canon even though this particular paragraph is a Victorian
   * scholar's opinion. That is not a citation error the reader can catch; the
   * label is doing the lying.
   *
   * So the catalog names the first line of the text proper, verified by reading
   * the downloaded file, and everything before it is dropped. Left undefined,
   * the whole file is ingested — which is right for every source that is not
   * padded this way.
   */
  textStart?: string;
  /** Anything a reader should know: OCR quality, abridgement, partial canon. */
  notes?: string;
}
