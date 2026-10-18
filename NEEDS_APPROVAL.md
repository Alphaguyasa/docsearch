# Needs approval

Decisions, money, or risky changes that wait for Alpha. Newest first. When one is
decided, move it to "Decided" with the date and the answer.

## Open

7. **What should the `oriental_orthodox` tag mean for a book?** (blocks ROADMAP 3.)
   The six Oriental Orthodox churches (Coptic, Syriac, Armenian, Ethiopian, Eritrean,
   Malankara) do not share one Old Testament canon; for example the Ethiopian
   Meqabyan are different books from 1-2 Maccabees. Options: (a) a book gets the tag
   when it is scripture in **all six** (matches the picker hint "the books the six
   churches share"; small, conservative); (b) when it is scripture in **any** of them
   (wider, but then the tag says little); (c) tag per church later and keep
   `ethiopian_orthodox` as the only Oriental tag for now. Each book's assignment needs a
   cited reason, and several are already marked NEEDS REVIEW in canon.json, so a priest
   or scholar should check the list either way. No cost. *Default until you decide:
   nothing changes; the default view keeps reading `orthodox` + `ethiopian_orthodox`.*
6. **Should the default "Oriental Orthodox" view hide Ethiopian-only books?** The picker
   hint says "the books the six Oriental Orthodox churches share", and the Ethiopian
   choice says it "adds" the Synaxarium, Enoch, Kebra Nagast and others. But until now
   the default sent no filter, so it has always shown those Ethiopian books (15 of the
   49 people come only from them, e.g. Moses the Ethiopian). Run 3 made the default a
   real filter that keeps today's content (tags `orthodox` + `ethiopian_orthodox`) and
   only shuts out Catholic-only and Protestant-only sources. Options: (a) keep it so
   (then the hint text should change); (b) hide Ethiopian-only books from the default,
   as the hint says. No cost either way. *Default until you decide: (a), unchanged content.*
1. **Amharic Bible (1962) is not public domain.** `data/bible-am.json` is used under the
   Bible Society of Ethiopia's non-commercial permission. The new rule says public-domain
   or openly licensed only. Options: (a) keep it as a documented exception (it's what
   Amharic readers need, and it's non-commercial); (b) remove it and show English only;
   (c) find a public-domain Amharic text. No cost either way. *Default until you decide:
   keep it, documented in SOURCES.md.*
2. **Lausiac History is public domain in the US only** (translator d. 1968). Fine while the
   site is hosted in the US; not fine for a mirror in a life+70 country. Keep / remove?
   *Default: keep.*
3. **Close stale PR #6 (orthodox-library)?** It's the earlier Orthodox-library direction
   and conflicts with main. Closing it loses nothing (the branch stays).
4. **Voyage and Gemini free tiers can't serve real traffic** (about 3 searches a minute;
   about 20 answers a day per Gemini model). Upgrading means adding a payment method
   (Voyage → Tier 1; Gemini paid tier 1, a fraction of a cent per search). Not done,
   per the no-purchases policy. The alternative is to stay on the free tier with the
   current fallbacks and the example cache.
5. **Before public launch** (from docs/NOT_ALONE.md): a priest or pastor reviews the
   `NEEDS REVIEW` items in `data/canon.json` and a sample of answers; rotate the Supabase
   service_role key.

## Decided

- 2026-10-15: **Old Vercel project `alpha-ed50/docsearch`** (docsearch-sand.vercel.app)
  failed a preview on every PR. Alpha disconnected its Git integration and approved
  merging PR #102 past that failing status.
- 2026-10-15: **`INGEST_PAT` no longer needed.** ingest-scripture now chains with the
  default GITHUB_TOKEN (ROADMAP 0b). The secret can be deleted whenever convenient.

- 2026-10-14: **Workflows on main approved.** Every push to `main` deploys; the fetch,
  ingest and eval bots commit their bookkeeping files to `main`.
- 2026-10-14: **No Fable.** The daily routine runs on the `opus` alias (newest Opus).
  Never switch to Fable or any tier above Opus; there's no money for it.
- 2026-10-14: **"Automatically approve"** doesn't exist for routines (Behaviour only has
  "Auto-fix pull requests", which stays off). Nothing to do.
- 2026-10-14: **Scope** is all of Christianity, with Oriental Orthodox as the default view.
- 2026-10-14: **Trunk** is `main`. PR #7 merged.
