# Needs approval

Decisions, money, or risky changes that wait for Alpha. Newest first. When one is
decided, move it to "Decided" with the date and the answer.

## Open

1. **Let the data and deploy workflows run from `main`** (ROADMAP item 6).
   Since PR #7, `main` is the app, but `deploy-not-alone.yml` still deploys only from
   `pivot/scripture`. So nothing merged to `main` reaches the live site. The fix is to
   make every push to `main` deploy, and to let the ingest/fetch/eval bots commit their
   progress files straight to `main`, as they did on `pivot/scripture`. The automatic
   safety check blocked me from making this change without you, because it changes
   how production deploys. **To approve:** reply "approve workflows on main", or allow
   the edit when the daily run asks.
2. **Amharic Bible (1962) is not public domain.** `data/bible-am.json` is used under the
   Bible Society of Ethiopia's non-commercial permission. The new rule says public-domain
   or openly licensed only. Options: (a) keep it as a documented exception (it's what
   Amharic readers need, and it's non-commercial); (b) remove it and show English only;
   (c) find a public-domain Amharic text. No cost either way. *Default until you decide:
   keep it, documented in SOURCES.md.*
3. **Lausiac History is public domain in the US only** (translator d. 1968). Fine while the
   site is hosted in the US; not fine for a mirror in a life+70 country. Keep / remove?
   *Default: keep.*
4. **Model for the daily task:** the docs list Claude Fable 5.1 above Opus 5.5. If the
   scheduled task can't be set to Fable, please switch it in the task's settings.
   **ACTION FOR ALPHA: switch the model to Claude Fable 5.1** if the report says it wasn't set.
5. **Close stale PR #6 (orthodox-library)?** It's the earlier Orthodox-library direction
   and conflicts with main. Closing it loses nothing (the branch stays).
6. **Voyage and Gemini free tiers can't serve real traffic** (about 3 searches a minute;
   about 20 answers a day per Gemini model). Upgrading means adding a payment method
   (Voyage → Tier 1; Gemini paid tier 1, a fraction of a cent per search). Not done,
   per the no-purchases policy. The alternative is to stay on the free tier with the
   current fallbacks and the example cache.
7. **Before public launch** (from docs/NOT_ALONE.md): a priest or pastor reviews the
   `NEEDS REVIEW` items in `data/canon.json` and a sample of answers; rotate the Supabase
   service_role key.

## Decided

- 2026-10-14: **Scope** is all of Christianity, with Oriental Orthodox as the default view.
- 2026-10-14: **Trunk** is `main`. PR #7 merged.
