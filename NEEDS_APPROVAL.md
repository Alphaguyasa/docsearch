# Needs approval

Decisions, money, or risky changes that wait for Alpha. Newest first. When one is
decided, move it to "Decided" with the date and the answer.

## Open

9. **A `CRON_SECRET` for `/api/telegram/daily` (ROADMAP 19, 2026-10-21).** The daily
   bot route has no auth, so anyone can make it call Telegram repeatedly. Vercel cron
   sends `Authorization: Bearer $CRON_SECRET` for free once the env var exists. Setting
   production env vars is yours (policy). No cost. *Default until you decide: the route
   stays open; the code change can land first and skip the check while the secret is
   unset.*
8. **Books the default view now hides (ROADMAP 3, 2026-10-19).** Following the
   "all six churches" rule, the Oriental Orthodox default no longer shows:
   - **2 Peter, 2 and 3 John, Jude, Revelation**: NEEDS REVIEW. The Syriac Peshitta
     lacks them and Syriac churches still do not read them in the liturgy
     (syriacorthodoxresources.org). I could not confirm whether the Syriac Orthodox
     Church counts them as scripture today.
   - **Letter of Jeremiah, Song of the Three**: NEEDS REVIEW. Not named separately in
     the Coptic list or the Syriac base text.
   - 1-3 Maccabees, 1-2 Esdras and the Prayer of Manasseh: one church's list lacks them.
   They stay under "Ethiopian Orthodox Tewahedo" (and Eastern Orthodox where they
   apply). Two assumptions to check: the Eritrean church keeps the Ethiopian canon, and
   the Malankara church keeps the Syriac one. The Paradise of the Holy Fathers (not
   scripture) keeps its readers in the default. The canon sites could not be opened
   from the cloud session, so each basis comes from search-result excerpts; the
   pre-launch review (#5) should check them. *Default: as above. To show any of these
   books in the default, remove "NEEDS REVIEW" from its `basis` in data/canon.json and
   add `oriental_orthodox`.*
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
   Also: a native Amharic speaker reads the crisis wording (safety.ts `MESSAGES.am`, the
   `am` and `detail_am` lines in data/crisis-resources.json, added 2026-10-22).

## Decided

- 2026-10-18: **`oriental_orthodox` means the books all six Oriental Orthodox churches
  share** (Alpha chose (a) for #7). This also settles #6 as (b): the default view hides
  Ethiopian-only books such as Enoch and Jubilees, which stay under "Ethiopian Orthodox
  Tewahedo", as the picker hint already says. A priest or scholar still checks the final
  book list before launch (#5).
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
