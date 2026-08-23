# The corpus

What this library contains, where every text came from, and — just as
importantly — what it does **not** contain and why.

## The principle

This is a library for **two communions**: the Eastern Orthodox Church and the
Oriental Orthodox Churches (Coptic, Ethiopian, Syriac, Armenian, Malankara). It
is not a Byzantine library with an Oriental appendix.

Three commitments follow from that, and they are enforced in code, not just
intended:

1. **Everything before Chalcedon (451) belongs to both.** Those works are
   catalogued `tradition: "both"`, and a reader who filters to one side still
   receives them. Filtering an Ethiopian question down to Ethiopian-only texts
   would hide St Athanasius from the Church that claims him.
2. **Where the traditions differ, the answer says so.** The Seven Ecumenical
   Councils are authoritative for Eastern Orthodoxy and the fourth of them is
   rejected by Oriental Orthodoxy. That is recorded on the work, carried onto
   every chunk, and the answer prompt requires it be stated.
3. **The canon is the Orthodox canon.** The Old Testament here is the
   Septuagint, not the Masoretic text. The deuterocanonical books are scripture.
   1 Enoch and Jubilees are scripture *in the Ethiopian Tewahedo canon*, and are
   catalogued as such rather than filed under "apocrypha".

## What is in it

Every text is **public domain**. That is a hard constraint — see
[the gaps](#what-is-missing-and-why).

### Scripture

| Work | Translation | Note |
| --- | --- | --- |
| The Septuagint | Brenton, 1851 | The Orthodox Old Testament. Old Testament only. |
| World English Bible (British, with Deuterocanon) | 2020 | Modern English, full canon, public domain. Supplies the New Testament. |
| King James Version with Apocrypha | 1611 | The idiom the Schaff translations of the Fathers quote in, which is what makes patristic quotations findable by keyword. |
| Douay-Rheims | 1899 | Second witness to the deuterocanonical books. |

### The Ethiopian Tewahedo canon

1 Enoch (Charles, 1912), Jubilees (Charles, 1917), the Kebra Nagast (Budge,
1922), and the Ethiopian Synaxarion (Budge, 1928).

### The Fathers

All 38 volumes of Schaff: the Ante-Nicene Fathers (10), and the Nicene &
Post-Nicene Fathers, Series 1 (14, Augustine and Chrysostom) and Series 2 (14,
the Greek and Eastern Fathers, the church historians, and the Seven Ecumenical
Councils with the canons).

For the Oriental traditions specifically, note **NPNF2-13** (St Ephrem the
Syrian and Aphrahat the Persian Sage), **NPNF2-04** (St Athanasius of
Alexandria), and **ANF-08/09** (the Syriac documents and Tatian's Diatessaron).

### The desert, the liturgy, the histories

The Paradise of the Holy Fathers (Budge, 1907 — the Syriac recension of the
Sayings), the Lausiac History of Palladius, the Book of Governors, Brightman's
*Liturgies Eastern and Western* (the anaphoras of every Eastern rite side by
side), Hapgood's *Service Book*, Dionysius the Areopagite, St John of
Kronstadt's *My Life in Christ*, and Neale's history of the Eastern Church.

Run `npm run corpus:verify` for the live list with sizes.

## What is missing, and why

**Every text here is public domain, and the most-used modern translations are
not.** This is the single most important thing to understand about the library,
because the absences are not random — they are concentrated in exactly the books
a contemporary Orthodox reader is most likely to own:

- **The Philokalia** in the Palmer/Sherrard/Ware translation (1979–1995) — in
  copyright. The Kadloubovsky & Palmer selections (1951) likewise.
- **The Rudder (Pedalion)** in the Cummings translation (1957) — in copyright.
  The canons themselves are here, in NPNF2-14.
- **The Ladder of Divine Ascent** in any modern translation — in copyright.
- **St Isaac the Syrian**, **St Symeon the New Theologian**, **St Gregory
  Palamas**, and **St Nikolai Velimirović** — the standard English translations
  are all in copyright.
- **The Fetha Nagast** and most 20th-century Ethiopian and Syriac scholarship.

Where a work is absent for this reason, the nearest public-domain witness to the
same text is included and the substitution is recorded in the work's `notes`.
The Sayings of the Desert Fathers are the clearest case: the modern Ward
translation is in copyright, so the library carries Budge's 1907 translation of
the Syriac recension instead — the same sayings, an older English.

**Practical consequence:** the library is strong on the Fathers, the councils,
the canons, scripture and the desert literature, and thin on Byzantine
hagiography and modern spiritual writing. An answer that says a subject is *not
covered* often means "not covered by the public-domain sources", not "the
tradition is silent".

## Where the texts come from

| Source | What it serves | Format |
| --- | --- | --- |
| [CCEL](https://ccel.org) | The 38 Schaff volumes | One plain-text file per volume |
| [Internet Archive](https://archive.org) | Scans of pre-1929 editions | OCR (`_djvu.txt`) |
| [eBible.org](https://ebible.org) | Scripture | Zip of verse-per-line files |

These are donation-funded libraries, not CDNs. The fetcher serialises every
request behind one lock with a 2.5s gap, identifies itself with a contact URL,
retries only what is worth retrying, and skips anything already on disk whose
checksum matches. Do not parallelise it.

`corpus/orthodox/manifest.json` records the id, URL, SHA-256 and byte size of
every file. Commit the manifest; the texts themselves are gitignored. Anyone can
rebuild a byte-identical corpus, and a silently changed upstream file becomes a
loud checksum mismatch rather than a quiet shift in what the site says.

## How a text becomes citable

Each source is segmented by its own shape before chunking, so that a chunk never
straddles the boundary its citation names:

- **eBible** → verses, grouped within a chapter. Reference: `Wisdom 3:1-12`.
- **CCEL** → the underscore-ruled sections, titled from their own headings.
  Reference: `NPNF2-13 — Demonstration VII. Of Penitents`.
- **Archive OCR** → paragraphs, filtered (below). Reference: `The Paradise of
  the Holy Fathers (part 14)`.

### OCR quality, and what gets thrown away

The archive scans are 1900s critical editions: small type, Greek and Ge'ez in
the apparatus, running heads, line numbers, and a back-of-book index. Two
independent filters run over them, because neither alone was enough:

1. **A length floor** (`MIN_OCR_PARAGRAPH_CHARS`). Index entries, tables of
   contents and running heads are perfectly legible English — no quality score
   separates them from prose, because they *are* prose-shaped. What separates
   them is that a real paragraph runs to hundreds of characters and an index
   line does not.
2. **A quality score** (`MIN_TEXT_QUALITY`), weighted mostly on English function
   words. This catches the critical apparatus, which is genuinely half-English
   and which a scorer based on word *shape* rates at 0.93.

Run `npm run corpus:inspect -- --samples 8` to see the score distribution per
work with the paragraphs either side of the cut-off. **Re-run it after adding
any work**, and adjust the constants against what it shows rather than by eye.

### Editorial front matter

Some editions are mostly *about* the text. The 1912 Charles edition of 1 Enoch
opens with roughly 6,000 lines of introduction and textual criticism before
chapter I. Ingested whole, a question about the flood retrieves a Victorian
scholar arguing about Maccabean politics — correctly cited, and labelled
`category: "scripture"`, because the work is scripture even though that
paragraph is not.

Such works carry a `textStart` marker in the catalog naming the first line of
the text proper, verified by reading the downloaded file. Matching is
whitespace-flexible (OCR doubles spaces) and anchors on the *last* occurrence
(an introduction quotes the opening line). A marker that stops matching produces
a loud warning at ingestion and keeps the whole work, rather than silently
discarding it.

## Adding a work

1. Add an entry to `src/lib/corpus/catalog.ts`. Get `tradition`, `lineages` and
   `category` right — they drive filtering, grouping, and what the answer is
   allowed to claim.
2. `npm run corpus:verify -- --only <id>` — confirms the source resolves and
   shows the first 200 characters, which is how you catch an identifier that
   works but points at the wrong book.
3. `npm run corpus:orthodox -- --only <id>`
4. `npm run corpus:inspect -- --only <id> --samples 8` — for OCR sources, check
   what is being dropped and whether a `textStart` marker is needed.
5. `npm run ingest:orthodox -- --only <id> --dry-run`, then without `--dry-run`.

Only add public-domain texts. `license` is a required field with one legal
value, so that the claim is auditable rather than assumed.
