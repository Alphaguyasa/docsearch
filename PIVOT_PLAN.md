# Pivot plan: from Oriental Orthodox to all of Christianity

## Where the pivot stands (2026-10-14)

The first pivot is done: DocSearch (cited PDF search) became **Not Alone**. That work
was planned in `docs/PIVOT.md` and built over ~90 PRs on `pivot/scripture`, then
merged to `main` in PR #7. What exists:

- A corpus of 20 public-domain sources (WEB + KJV Bibles, Augustine, the desert
  fathers, the Syriac fathers, and the Ethiopian books), chunked by verse or section,
  each chunk tagged with `traditions[]`. See `SOURCES.md`.
- A curated layer of people (`data/figures.seed.json`): each person's fall and
  restoration passages, and the struggles they match.
- Safety gate first, then struggle tagging, figure-first retrieval, and a cited answer
  that never declares forgiveness.
- English and Amharic; web, Telegram bot and channel; journey, journal, Lent companion.
- Evals: `eval/scripture-golden.json` (dev 35, holdout 10, frozen) gated in CI by
  `scripture-eval.yml`. There is also the ten-phase DocSearch harness in `eval/src`.

PR #78 then narrowed the site to the Oriental Orthodox churches only. On 2026-10-14
the owner set a new scope: **all of Christianity, with Oriental Orthodox / Ethiopian
Tewahedo as the default view**, and the other traditions opt-in.

## What reuse looks like

Nothing is rebuilt. The tradition machinery already exists end to end: tags on every
chunk, `filter_traditions` in SQL, `filterTraditions` in retrieval, `TRADITIONS` in
`canon.ts`, and a picker. The broadening is mostly about **what the default filter
means**, **which tags exist**, and **which books are in the corpus**.

## Steps (each is a ROADMAP item, small PRs, in order)

1. **Default = Oriental Orthodox, as a real filter.** Today the default sends no filter.
   That only worked because the corpus held nothing else.
2. **Opt-in picker** for Eastern Orthodox, Catholic and Protestant (English + Amharic).
3. **Split `orthodox` into `eastern_orthodox` and `oriental_orthodox`** in canon.json
   and the source rules, with a reason recorded for every book. Additive migration only.
4. **Western sources back:** *Imitation of Christ*, *Grace Abounding* (and maybe *Pilgrim's
   Progress*, labelled as allegory), then more public-domain lives (e.g. *The Little Flowers
   of St Francis*, Wesley's and Newton's journals): each one verified PD and added to
   SOURCES.md before fetching.
5. **Differences shown, not argued:** citation labels say which traditions hold a book as
   scripture, and the answer prompt names the tradition of any non-scriptural story.
6. **New people** from those sources, each with cited fall and restoration passages and
   a check that every ref resolves to a chunk.
7. **Golden set** grows in the dev split for each tradition; the holdout stays frozen.

## Done means

- The default view shows only books the Oriental churches read (test).
- Each tradition's filter returns only its canon, e.g. Protestant never gets the
  deuterocanon (test).
- Every Western source is listed in SOURCES.md with a PD license (test).
- An answer that cites a disputed book says which traditions hold it (test).
