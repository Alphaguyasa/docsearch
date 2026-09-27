/**
 * The curated Orthodox corpus.
 *
 * SCOPE: everything here is public domain and freely redistributable. That is a
 * hard constraint, not a preference — and it shapes the corpus in ways a reader
 * must understand, so the gaps are documented in docs/CORPUS.md rather than
 * hidden. The short version: the Fathers, the councils, the canons, the Orthodox
 * scriptural canon, the desert literature and the historic service books are all
 * here in full. The standard MODERN translations (the Palmer/Sherrard/Ware
 * Philokalia, the Cummings Rudder, most 20th-century Ethiopian and Syriac
 * scholarship) are still in copyright and are NOT here. Where a work is absent
 * for that reason, the nearest public-domain witness to the same text is
 * included and marked in `notes`.
 *
 * CURATION PRINCIPLE: this is a corpus for two communions, not one with an
 * appendix. Oriental Orthodox material — Coptic, Ethiopian, Syriac, Armenian —
 * is catalogued as a first-class body of texts, not as a footnote to Byzantine
 * sources. Where the traditions share a Father (everyone before 451), the work
 * is marked `tradition: "both"`, because that is the historical fact and
 * assigning it to one side would be a claim neither Church makes.
 */
import type { Category, Lineage, Tradition, Work } from "./types";

/** Terse constructor for the 38 Schaff volumes, which share most metadata. */
function ccel(
  id: string,
  ref: string,
  title: string,
  author: string | null,
  century: number | null,
  lineages: Lineage[],
  opts: { tradition?: Tradition; category?: Category; notes?: string } = {},
): Work {
  return {
    id,
    title,
    author,
    tradition: opts.tradition ?? "both",
    lineages,
    category: opts.category ?? "patristic",
    century,
    translationYear: 1890,
    translator: "Philip Schaff et al.",
    source: { kind: "ccel", ref },
    license: "public-domain",
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}

/**
 * Ante-Nicene Fathers (1885). Everything before Nicaea — the shared inheritance
 * of every apostolic Church, with no confessional division possible.
 */
const ANTE_NICENE: Work[] = [
  ccel("anf01", "schaff/anf01", "Ante-Nicene Fathers, Vol. 1: The Apostolic Fathers with Justin Martyr and Irenaeus", null, 2, ["undivided"]),
  ccel("anf02", "schaff/anf02", "Ante-Nicene Fathers, Vol. 2: Fathers of the Second Century (Hermas, Tatian, Athenagoras, Theophilus, Clement of Alexandria)", null, 2, ["undivided", "coptic"]),
  ccel("anf03", "schaff/anf03", "Ante-Nicene Fathers, Vol. 3: Latin Christianity — Tertullian", "Tertullian", 3, ["undivided", "latin"]),
  ccel("anf04", "schaff/anf04", "Ante-Nicene Fathers, Vol. 4: Tertullian Part IV; Minucius Felix; Commodian; Origen", null, 3, ["undivided", "coptic", "latin"]),
  ccel("anf05", "schaff/anf05", "Ante-Nicene Fathers, Vol. 5: Hippolytus; Cyprian; Caius; Novatian", null, 3, ["undivided", "latin"]),
  ccel("anf06", "schaff/anf06", "Ante-Nicene Fathers, Vol. 6: Gregory Thaumaturgus; Dionysius the Great; Julius Africanus; Anatolius; Methodius; Arnobius", null, 3, ["undivided", "greek", "coptic"]),
  ccel("anf07", "schaff/anf07", "Ante-Nicene Fathers, Vol. 7: Lactantius; Venantius; Asterius; Victorinus; Dionysius; Apostolic Teaching and Constitutions; Homily; Liturgies", null, 4, ["undivided"], {
    category: "liturgical",
    notes: "Contains the Apostolic Constitutions and the earliest liturgical texts, including the Clementine Liturgy — the ancestor of every Orthodox anaphora.",
  }),
  ccel("anf08", "schaff/anf08", "Ante-Nicene Fathers, Vol. 8: The Twelve Patriarchs, Excerpts and Epistles, The Clementina, Apocrypha, Decretals, Memoirs of Edessa and Syriac Documents", null, 3, ["undivided", "syriac"], {
    notes: "The Syriac documents here (the Doctrine of Addai, the Edessene material) are foundational for the Syriac Orthodox tradition.",
  }),
  ccel("anf09", "schaff/anf09", "Ante-Nicene Fathers, Vol. 9: The Gospel of Peter, The Diatessaron of Tatian, The Apocalypse of Peter, and Origen's Commentaries", null, 3, ["undivided", "syriac", "coptic"], {
    notes: "The Diatessaron of Tatian was the gospel text of the Syriac Church for two centuries.",
  }),
  ccel("anf10", "schaff/anf10", "Ante-Nicene Fathers, Vol. 10: Bibliographic Synopsis and General Index", null, null, ["undivided"], {
    notes: "Index volume — useful for lookup, thin on doctrinal content.",
  }),
];

/**
 * Nicene & Post-Nicene Fathers, Series 1 (1886–1890): Augustine and Chrysostom.
 *
 * On Augustine: the East reads him as Blessed Augustine, a Father received with
 * discernment rather than a doctrinal authority on par with the Cappadocians.
 * He is here in full because he is genuinely read, and his pastoral writing is
 * among the most useful in the corpus for someone in distress — but `lineages`
 * marks him Latin so an answer can be honest about where he stands.
 */
const NPNF1: Work[] = [
  ccel("npnf101", "schaff/npnf101", "NPNF1-01: Augustine — Prolegomena, Confessions, Letters", "Blessed Augustine of Hippo", 5, ["latin"], {
    notes: "The Confessions: the classic account of conversion, grief and restless longing. Heavily used for questions a person asks about their own life.",
  }),
  ccel("npnf102", "schaff/npnf102", "NPNF1-02: Augustine — City of God, On Christian Doctrine", "Blessed Augustine of Hippo", 5, ["latin"]),
  ccel("npnf103", "schaff/npnf103", "NPNF1-03: Augustine — On the Holy Trinity, Doctrinal Treatises, Moral Treatises", "Blessed Augustine of Hippo", 5, ["latin"]),
  ccel("npnf104", "schaff/npnf104", "NPNF1-04: Augustine — Writings Against the Manichaeans and Against the Donatists", "Blessed Augustine of Hippo", 5, ["latin"]),
  ccel("npnf105", "schaff/npnf105", "NPNF1-05: Augustine — Anti-Pelagian Writings", "Blessed Augustine of Hippo", 5, ["latin"]),
  ccel("npnf106", "schaff/npnf106", "NPNF1-06: Augustine — Sermon on the Mount, Harmony of the Gospels, Homilies on the Gospels", "Blessed Augustine of Hippo", 5, ["latin"]),
  ccel("npnf107", "schaff/npnf107", "NPNF1-07: Augustine — Homilies on the Gospel of John, Homilies on the First Epistle of John, Soliloquies", "Blessed Augustine of Hippo", 5, ["latin"]),
  ccel("npnf108", "schaff/npnf108", "NPNF1-08: Augustine — Expositions on the Book of Psalms", "Blessed Augustine of Hippo", 5, ["latin"], {
    notes: "Psalm-by-psalm commentary. The Psalter is the backbone of Orthodox prayer, so this is a dense source for lament and consolation.",
  }),
  ccel("npnf109", "schaff/npnf109", "NPNF1-09: St John Chrysostom — On the Priesthood, Ascetic Treatises, Select Homilies and Letters, Homilies on the Statues", "St John Chrysostom", 4, ["greek", "byzantine", "antiochian"]),
  ccel("npnf110", "schaff/npnf110", "NPNF1-10: St John Chrysostom — Homilies on the Gospel of St Matthew", "St John Chrysostom", 4, ["greek", "byzantine", "antiochian"]),
  ccel("npnf111", "schaff/npnf111", "NPNF1-11: St John Chrysostom — Homilies on the Acts of the Apostles and the Epistle to the Romans", "St John Chrysostom", 4, ["greek", "byzantine", "antiochian"]),
  ccel("npnf112", "schaff/npnf112", "NPNF1-12: St John Chrysostom — Homilies on First and Second Corinthians", "St John Chrysostom", 4, ["greek", "byzantine", "antiochian"]),
  ccel("npnf113", "schaff/npnf113", "NPNF1-13: St John Chrysostom — Homilies on Galatians, Ephesians, Philippians, Colossians, Thessalonians, Timothy, Titus and Philemon", "St John Chrysostom", 4, ["greek", "byzantine", "antiochian"]),
  ccel("npnf114", "schaff/npnf114", "NPNF1-14: St John Chrysostom — Homilies on the Gospel of St John and the Epistle to the Hebrews", "St John Chrysostom", 4, ["greek", "byzantine", "antiochian"]),
];

/**
 * Nicene & Post-Nicene Fathers, Series 2 (1890–1900): the Greek and Eastern
 * Fathers, the church historians, and the Seven Ecumenical Councils.
 *
 * This is the most important series for BOTH communions. Note vol. 13:
 * St Ephrem the Syrian and Aphrahat the Persian Sage are the two great early
 * Syriac Fathers, revered in the Syriac Orthodox Church above almost anyone.
 */
const NPNF2: Work[] = [
  ccel("npnf201", "schaff/npnf201", "NPNF2-01: Eusebius — Church History, Life of Constantine, Oration in Praise of Constantine", "Eusebius of Caesarea", 4, ["greek", "undivided"], { category: "history" }),
  ccel("npnf202", "schaff/npnf202", "NPNF2-02: Socrates and Sozomenus — Ecclesiastical Histories", null, 5, ["greek", "byzantine"], { category: "history" }),
  ccel("npnf203", "schaff/npnf203", "NPNF2-03: Theodoret, Jerome, Gennadius, Rufinus — Historical Writings", null, 5, ["greek", "syriac", "latin"], { category: "history" }),
  ccel("npnf204", "schaff/npnf204", "NPNF2-04: St Athanasius — Select Works and Letters", "St Athanasius the Great", 4, ["coptic", "undivided", "greek"], {
    notes: "The Pope of Alexandria whom both communions claim absolutely. Contains On the Incarnation and the Life of St Antony — the founding text of monasticism East and West.",
  }),
  ccel("npnf205", "schaff/npnf205", "NPNF2-05: St Gregory of Nyssa — Dogmatic Treatises, Ascetic and Moral Works, Letters", "St Gregory of Nyssa", 4, ["greek", "byzantine", "undivided"]),
  ccel("npnf206", "schaff/npnf206", "NPNF2-06: St Jerome — Letters and Select Works", "St Jerome", 5, ["latin"]),
  ccel("npnf207", "schaff/npnf207", "NPNF2-07: St Cyril of Jerusalem — Catechetical Lectures; St Gregory Nazianzen — Select Orations", null, 4, ["greek", "byzantine", "undivided"], {
    notes: "The Catechetical Lectures are the earliest full explanation of the mysteries (sacraments) as the Church still celebrates them.",
  }),
  ccel("npnf208", "schaff/npnf208", "NPNF2-08: St Basil the Great — Letters and Select Works", "St Basil the Great", 4, ["greek", "byzantine", "undivided"], {
    notes: "Includes the Hexaemeron and the ascetic rules that shaped all Orthodox monasticism. His canonical letters are received as canon law in both communions.",
  }),
  ccel("npnf209", "schaff/npnf209", "NPNF2-09: St Hilary of Poitiers; St John of Damascus", null, 8, ["greek", "byzantine", "latin"], {
    notes: "The Exact Exposition of the Orthodox Faith — the closest thing Eastern Orthodoxy has to a systematic dogmatics, and the definitive defence of the holy icons.",
  }),
  ccel("npnf210", "schaff/npnf210", "NPNF2-10: St Ambrose — Select Works and Letters", "St Ambrose of Milan", 4, ["latin"]),
  ccel("npnf211", "schaff/npnf211", "NPNF2-11: Sulpitius Severus, Vincent of Lerins, St John Cassian", null, 5, ["latin", "undivided"], {
    category: "ascetic",
    notes: "Cassian carried the teaching of the Egyptian desert fathers westward. His Institutes and Conferences are the primary source on the eight thoughts (logismoi) — the Orthodox analysis of the passions.",
  }),
  ccel("npnf212", "schaff/npnf212", "NPNF2-12: St Leo the Great; St Gregory the Great (the Dialogist)", null, 6, ["latin", "byzantine"], {
    notes: "The Tome of Leo is the document Chalcedon adopted — the precise point at which the Eastern and Oriental communions divided. Read it alongside the Oriental sources before drawing conclusions.",
  }),
  ccel("npnf213", "schaff/npnf213", "NPNF2-13: St Gregory the Great II; St Ephrem the Syrian; Aphrahat the Persian Sage", null, 4, ["syriac", "undivided"], {
    notes: "The two great Syriac Fathers in English. St Ephrem is the Harp of the Spirit, the central hymnographer of the Syriac Orthodox tradition.",
  }),
  ccel("npnf214", "schaff/npnf214", "NPNF2-14: The Seven Ecumenical Councils", null, null, ["byzantine", "greek", "undivided"], {
    category: "council",
    tradition: "eastern",
    notes: "Eastern Orthodoxy receives all seven councils. Oriental Orthodoxy receives the first three only and rejects Chalcedon (the fourth), so this volume is authoritative for one communion and contested by the other. It also carries the canons of the Fathers, which function as canon law in both.",
  }),
];

/**
 * Scripture, in the Orthodox canon.
 *
 * The Orthodox Old Testament is the SEPTUAGINT, not the Hebrew Masoretic text
 * the Protestant canon follows — a different book order, a different text, and
 * books the Protestant canon omits entirely. Brenton's 1851 translation is the
 * standard English Septuagint and is public domain. Douay-Rheims is included
 * alongside it because it carries the deuterocanon in a familiar English and
 * gives a second witness for comparison.
 */
const SCRIPTURE: Work[] = [
  {
    id: "lxx-brenton",
    title: "The Septuagint (Brenton's English Translation), with the Apocrypha",
    author: null,
    tradition: "both",
    lineages: ["undivided"],
    category: "scripture",
    century: null,
    translationYear: 1851,
    translator: "Sir Lancelot C. L. Brenton",
    priority: 0,
    source: { kind: "ebible", translationId: "eng-Brenton" },
    license: "public-domain",
    notes: "THE Old Testament of the Orthodox Church. The Fathers quote this text, the lectionary reads it, and its numbering (the Psalms especially) is what Orthodox service books use.",
  },
  {
    id: "kjv-apocrypha",
    title: "The King James Version with the Apocrypha",
    author: null,
    tradition: "both",
    lineages: ["undivided"],
    category: "scripture",
    century: null,
    translationYear: 1611,
    translator: null,
    source: { kind: "ebible", translationId: "eng-kjv" },
    priority: 8,
    license: "public-domain",
    notes: "Included because the 1885–1900 Schaff translations of the Fathers quote scripture in this idiom, so KJV wording is what makes a patristic quotation findable by keyword search.",
  },
  {
    id: "web-deuterocanon",
    title: "The World English Bible, British Edition, with the Deuterocanon",
    author: null,
    tradition: "both",
    lineages: ["undivided"],
    category: "scripture",
    century: null,
    translationYear: 2020,
    translator: null,
    source: { kind: "ebible", translationId: "eng-webbe" },
    priority: 0,
    license: "public-domain",
    notes: "The only modern-English scripture here that is public domain and carries the deuterocanon. The other three are 17th- to 19th-century English; someone in real distress should not have to parse Jacobean syntax to read the passage an answer cites.",
  },
  {
    id: "douay-rheims",
    title: "The Douay-Rheims Bible, with the Deuterocanonical Books",
    author: null,
    tradition: "both",
    lineages: ["undivided"],
    category: "deuterocanon",
    century: null,
    translationYear: 1899,
    translator: null,
    source: { kind: "ebible", translationId: "engDRA" },
    priority: 8,
    license: "public-domain",
    notes: "A second witness to the deuterocanonical books — Tobit, Judith, Wisdom, Sirach, Baruch, 1–2 Maccabees — which the Orthodox canon receives as scripture.",
  },
];

/**
 * The broader Ethiopian Tewahedo canon.
 *
 * The Ethiopian Orthodox Tewahedo Church has the largest biblical canon of any
 * Church in the world. 1 Enoch and Jubilees are not apocrypha there — they are
 * SCRIPTURE, read as canonical. A site claiming to serve Oriental Orthodoxy
 * while omitting them has quietly imposed a Byzantine canon on an Ethiopian
 * question, which is exactly the failure this corpus is built to avoid.
 */
const ETHIOPIAN_CANON: Work[] = [
  {
    id: "enoch-charles",
    title: "The Book of Enoch (1 Enoch)",
    author: null,
    tradition: "oriental",
    lineages: ["ethiopian"],
    category: "scripture",
    century: null,
    translationYear: 1912,
    translator: "R. H. Charles",
    source: { kind: "archive", identifier: "cu31924067146773" },
    license: "public-domain",
    // Chapter I verse 1 of Enoch. Everything above it in this edition is
    // R. H. Charles's introduction and textual criticism — some 6,000 lines.
    textStart: "The words of the blessing of Enoch",
    notes: "Canonical scripture in the Ethiopian Orthodox Tewahedo Church, and quoted as prophecy in the Epistle of Jude. It survives complete only in Ge'ez. This is a critical edition, so its footnotes discuss variant readings alongside the text.",
  },
  {
    id: "jubilees-charles",
    title: "The Book of Jubilees (The Little Genesis)",
    author: null,
    tradition: "oriental",
    lineages: ["ethiopian"],
    category: "scripture",
    century: null,
    translationYear: 1902,
    translator: "R. H. Charles",
    // The 1902 edition (cu31924060029984) is three-quarters introduction and
    // textual apparatus; this 1917 printing is the translation itself.
    source: { kind: "archive", identifier: "bookofjubileesor01char" },
    license: "public-domain",
    textStart: "This is the history of the division of the days",
    notes: "Canonical in the Ethiopian Tewahedo canon. Like Enoch, it survives complete only in Ge'ez.",
  },
  {
    id: "kebra-nagast",
    title: "The Kebra Nagast (The Glory of Kings)",
    author: null,
    tradition: "oriental",
    lineages: ["ethiopian"],
    category: "history",
    century: 14,
    translationYear: 1922,
    translator: "E. A. Wallis Budge",
    source: { kind: "archive", identifier: "queenofshebahero00budgrich" },
    license: "public-domain",
    notes: "The national epic of Ethiopian Christianity: the Queen of Sheba, Menelik, and the Ark. Central to how the Ethiopian Church understands itself.",
  },
  {
    id: "ethiopian-synaxarion",
    title: "The Book of the Saints of the Ethiopian Church (the Ethiopian Synaxarion)",
    author: null,
    tradition: "oriental",
    lineages: ["ethiopian"],
    category: "hagiography",
    century: null,
    translationYear: 1928,
    translator: "E. A. Wallis Budge",
    source: { kind: "archive", identifier: "bookofsaintsofet00yait" },
    license: "public-domain",
    notes: "The daily commemorations of the saints as the Ethiopian Church reads them liturgically. OCR of a Ge'ez-English edition, so text quality varies.",
  },
];

/**
 * Coptic and Egyptian: the desert, and the Church of Alexandria.
 *
 * The Egyptian desert is where Christian monasticism began, and its literature
 * is the single richest source in this corpus for someone bringing a real
 * difficulty — despair, anger, lust, grief, being wronged. The elders answer
 * concretely and briefly, which is what a person in distress can actually hear.
 */
const COPTIC: Work[] = [
  {
    id: "paradise-fathers-1",
    title: "The Paradise, or Garden of the Holy Fathers, Vol. 1",
    author: null,
    tradition: "both",
    lineages: ["coptic", "syriac", "undivided"],
    category: "ascetic",
    century: 4,
    translationYear: 1907,
    translator: "E. A. Wallis Budge",
    source: { kind: "archive", identifier: "ParadiseOfTheHolyFathersV1" },
    license: "public-domain",
    notes: "Budge translated the SYRIAC recension — the Sayings of the Desert Fathers as the Syriac Orthodox received them. The modern Ward translation is in copyright; this is the public-domain witness to the same sayings.",
  },
  {
    id: "paradise-fathers-2",
    title: "The Paradise, or Garden of the Holy Fathers, Vol. 2",
    author: null,
    tradition: "both",
    lineages: ["coptic", "syriac", "undivided"],
    category: "ascetic",
    century: 4,
    translationYear: 1907,
    translator: "E. A. Wallis Budge",
    source: { kind: "archive", identifier: "ParadiseOfTheHolyFathersV2" },
    license: "public-domain",
    notes: "Volume 2 carries the Sayings proper (the Apophthegmata), arranged by subject: patience, humility, fornication, accidie, discernment.",
  },
  {
    id: "lausiac-history",
    title: "The Lausiac History of Palladius",
    author: "Palladius of Galatia",
    tradition: "both",
    lineages: ["coptic", "undivided"],
    category: "hagiography",
    century: 5,
    translationYear: 1918,
    translator: "W. K. Lowther Clarke",
    source: { kind: "archive", identifier: "lausiachistoryof013039mbp" },
    license: "public-domain",
    notes: "An eyewitness account of the Egyptian and Palestinian monks by someone who lived among them.",
  },
];

/** Syriac Orthodox, beyond the Ephrem and Aphrahat in NPNF2-13. */
const SYRIAC: Work[] = [
  {
    id: "book-of-governors",
    title: "The Book of Governors: The Historia Monastica of Thomas of Marga",
    author: "Thomas, Bishop of Marga",
    tradition: "oriental",
    lineages: ["syriac"],
    category: "history",
    century: 9,
    translationYear: 1893,
    translator: "E. A. Wallis Budge",
    source: { kind: "archive", identifier: "bookofgovernorsh01thom" },
    license: "public-domain",
    notes: "Syriac monastic history: the lives and sayings of the East Syrian monastic fathers.",
  },
];

/** Liturgy: the texts of the services themselves, Eastern and Oriental. */
const LITURGICAL: Work[] = [
  {
    id: "hapgood-service-book",
    title: "Service Book of the Holy Orthodox-Catholic Apostolic Church",
    author: null,
    tradition: "eastern",
    lineages: ["byzantine", "slavic", "antiochian"],
    category: "liturgical",
    century: null,
    translationYear: 1922,
    translator: "Isabel Florence Hapgood",
    source: { kind: "archive", identifier: "gtu_A32400004109975B" },
    license: "public-domain",
    notes: "The complete Byzantine services in English: the Divine Liturgy, Vespers, Matins, baptism, marriage, unction, and the funeral service. Commissioned by the Russian Church and still in parish use.",
  },
  {
    id: "brightman-liturgies",
    title: "Liturgies Eastern and Western, Vol. 1: Eastern Liturgies",
    author: null,
    tradition: "both",
    lineages: ["byzantine", "coptic", "syriac", "armenian", "ethiopian"],
    category: "liturgical",
    century: null,
    translationYear: 1896,
    translator: "F. E. Brightman",
    source: { kind: "archive", identifier: "liturgieseastern00brig" },
    license: "public-domain",
    notes: "The most valuable single liturgical source here: the anaphoras of ALL the Eastern rites side by side — Byzantine (Chrysostom and Basil), Coptic (St Mark/St Cyril), Syriac (St James), Armenian, and Ethiopian. Exactly the book for asking what each tradition says in its own liturgy.",
  },
];

/** Eastern Orthodox spiritual and pastoral writing. */
const EASTERN_SPIRITUAL: Work[] = [
  {
    id: "dionysius-areopagite",
    title: "The Works of Dionysius the Areopagite",
    author: "St Dionysius the Areopagite",
    tradition: "both",
    lineages: ["greek", "syriac", "undivided"],
    category: "patristic",
    century: 6,
    translationYear: 1897,
    translator: "John Parker",
    source: { kind: "archive", identifier: "worksofdionysius00dionuoft" },
    license: "public-domain",
    notes: "The Divine Names, the Mystical Theology, and the two Hierarchies — the source of apophatic theology for both communions.",
  },
  {
    id: "my-life-in-christ",
    title: "My Life in Christ",
    author: "St John of Kronstadt",
    tradition: "eastern",
    lineages: ["slavic"],
    category: "ascetic",
    century: 19,
    translationYear: 1897,
    translator: "E. E. Goulaeff",
    source: { kind: "archive", identifier: "mylifeinchristex00serguoft" },
    license: "public-domain",
    notes: "A parish priest's diary in short entries on prayer, doubt, despondency, anger and daily struggle. The most directly pastoral text in the corpus.",
  },
  {
    id: "neale-eastern-church-1",
    title: "A History of the Holy Eastern Church, Vol. 1",
    author: "John Mason Neale",
    tradition: "eastern",
    lineages: ["byzantine", "greek", "coptic"],
    category: "history",
    century: 19,
    translationYear: 1847,
    translator: null,
    source: { kind: "archive", identifier: "historyofholyeas01neal" },
    license: "public-domain",
    notes: "A 19th-century Anglican historian's account, valuable for its detailed treatment of the Patriarchate of Alexandria. Read with awareness of its author's outside vantage point.",
  },
];

/** The whole catalog, in one list. */
export const CATALOG: Work[] = [
  ...SCRIPTURE,
  ...ETHIOPIAN_CANON,
  ...ANTE_NICENE,
  ...NPNF1,
  ...NPNF2,
  ...COPTIC,
  ...SYRIAC,
  ...LITURGICAL,
  ...EASTERN_SPIRITUAL,
];

/** Look up a work by its slug. Returns undefined for an unknown id. */
export function workById(id: string): Work | undefined {
  return CATALOG.find((w) => w.id === id);
}

/**
 * Works belonging to a tradition. Passing "both" returns the whole catalog;
 * passing one side returns that side PLUS the shared inheritance, because a
 * question asked from the Ethiopian side still wants St Athanasius.
 */
export function worksByTradition(tradition: Tradition): Work[] {
  if (tradition === "both") return CATALOG;
  return CATALOG.filter((w) => w.tradition === tradition || w.tradition === "both");
}
