# Sources and licenses

Every text the stories are drawn from, with its license. The corpus is defined in
`corpus/scripture/sources.json`; `tests/project-rules.test.ts` fails if a source there is
missing from this file or has no public-domain / open license.

Only public-domain or openly licensed texts are allowed. A source whose status is
anything other than plain worldwide public domain is flagged below and listed in
`NEEDS_APPROVAL.md`.

## Texts

| id | Text | License | Status |
|---|---|---|---|
| `web` | World English Bible with Deuterocanon | Public domain (eBible.org dedication; 'World English Bible' is a trademark — unaltered text only) | verified |
| `confessions` | The Confessions of Saint Augustine (tr. E. B. Pusey) | Public domain (Project Gutenberg #3296; Pusey d. 1882) | verified-at-fetch |
| `enoch` | The Book of Enoch (tr. R. H. Charles, 1917) | Public domain (published 1917; Charles d. 1931) | verified |
| `kebra_nagast` | The Kebra Nagast: The Queen of Sheba and her only son Menyelek (tr. E. A. Wallis Budge, 1922) | Public domain (published 1922; Budge d. 1934) | verified |
| `jubilees` | The Book of Jubilees (tr. R. H. Charles, 1917) | Public domain (published 1917; Charles d. 1931) | verified |
| `adam_and_eve` | The Book of Adam and Eve, also called the Conflict of Adam and Eve with Satan (tr. S. C. Malan, 1882) | Public domain (published 1882; Malan d. 1894) | verified |
| `miracles_of_mary` | The Miracles of the Blessed Virgin Mary (tr. E. A. Wallis Budge, 1900, from the Lady Meux Ethiopic manuscripts) | Public domain (published 1900; Budge d. 1934) | verified |
| `takla_haymanot` | The Life of Takla Haymanot (tr. E. A. Wallis Budge, 1906, from the Dabra Libanos manuscript) | Public domain (published 1906; Budge d. 1934) | verified |
| `baralam` | Baralam and Yewasef, the Ethiopic version of the Story of Barlaam and Josaphat (tr. E. A. Wallis Budge, 1923) | Public domain (published 1923, before 1929; Budge d. 1934) | verified |
| `ephrem` | Ephrem the Syrian, Three Homilies (tr. A. E. Johnston, NPNF II/13) | Public domain (Schaff's Nicene and Post-Nicene Fathers, 1886-1900; CCEL marks it 'Rights: Public Domain') | verified-at-fetch |
| `aphrahat` | Aphrahat, Select Demonstrations (tr. J. Gwynn, NPNF II/13) | Public domain (Schaff's Nicene and Post-Nicene Fathers, 1886-1900; CCEL marks it 'Rights: Public Domain') | verified-at-fetch |
| `isaac` | Mystic Treatises by Isaac of Nineveh (tr. A. J. Wensinck, 1923) | Public domain (published Amsterdam 1923; Wensinck d. 1939) | verified |
| `philoxenus` | The Discourses of Philoxenus, Bishop of Mabbogh (tr. E. A. Wallis Budge, 1894), vol. II | Public domain (published 1894; Budge d. 1934) | verified |
| `cyril_repentance` | Cyril of Jerusalem, Catechetical Lecture II: On Repentance (NPNF II/7) | Public domain (Schaff's Nicene and Post-Nicene Fathers, 1886-1900; CCEL marks it 'Rights: Public Domain') | verified-at-fetch |
| `chrysostom_theodore` | John Chrysostom, Letters to Theodore after his Fall (NPNF I/9) | Public domain (Schaff's Nicene and Post-Nicene Fathers, 1886-1900; CCEL marks it 'Rights: Public Domain') | verified-at-fetch |
| `antony` | Athanasius, Life of Antony (tr. H. Ellershaw, NPNF II/4) | Public domain (Schaff's Nicene and Post-Nicene Fathers, 1886-1900; CCEL marks it 'Rights: Public Domain') | verified-at-fetch |
| `synaxarium` | The Book of the Saints of the Ethiopian Church (tr. E. A. Wallis Budge, 1928) | Public domain in the US (published 1928) and in life+70 countries (Budge d. 1934) | verified |
| `paradise` | The Paradise or Garden of the Holy Fathers (tr. E. A. Wallis Budge, 1907) | Public domain (published 1907; Budge d. 1934) | verified |
| `lausiac` | The Lausiac History of Palladius (tr. W. K. Lowther Clarke, 1918) | Public domain in the US only (published 1918). Translator d. 1968: NOT PD in life+70 countries until 2039. Serve from US hosting only. | verified |
| `kjv` | King James Version | Public domain outside the UK | deferred |

### Flagged

- **`lausiac`**: public domain in the US only. Clarke died in 1968, so in life+70
  countries the translation stays in copyright until 2039. The site is served from US
  hosting. See NEEDS_APPROVAL.md.
- **`kjv`**: public domain everywhere except the UK, where Crown letters patent apply.
- **`web`**: public domain. "World English Bible" is a trademark, so the text must
  stay unaltered.

## Not public domain: the Amharic Bible (1962)

`data/bible-am.json` (Haile Selassie translation) is **not public domain**. The New
Testament e-text is published with the Bible Society of Ethiopia's permission for
non-commercial use; the Old Testament comes from github.com/magna25/amharic-bible-json.
It is shown on /about and under the verses with its copyright statement. It predates
the "public domain or openly licensed only" rule and is listed in NEEDS_APPROVAL.md
for the owner to decide.

## Paintings

Artwork comes from Wikimedia Commons through `scripts/fetch-art.ts`. That script only
accepts files whose license is public domain, CC0 or CC BY / BY-SA, and credits each
file at `/credits`. The per-image artist and license are in `public/art/credits.json`
and `public/art/fetch-report.md`.
