# Roadmap

Prioritised backlog. The daily run takes the top open item. Mark an item done with
its PR number and move it to "Done" at the bottom. Priority: P0 (urgent) → P3.
Effort: S (< half a run), M (one run), L (split into several PRs).

Last replan: 2026-10-14 (first audit, after main became Not Alone).

## Open

0. **[P0, S] Upgrade Next.js 15.5.21 → 15.5.27 (security).** `npm audit` reports two
   critical unauthenticated RCE advisories (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4,
   fixed in 15.5.24) and two cache-poisoning advisories (fixed in 15.5.27). It's a patch
   upgrade that also lifts the bundled sharp/postcss. Remaining audit items (vitest
   moderate, nanoid, source-map-js) go to item 10.
0b. **[P1, S] Make ingestion work without `INGEST_PAT`.** `ingest-scripture.yml` checks
   out with `secrets.INGEST_PAT`, which GitHub now rejects ("could not read Username",
   run 38589684822, 2026-10-14). All 9264 chunks are already embedded, so nothing is lost
   today, but no new book can be ingested (blocks item 4). Fix without touching secrets:
   check out with the default `GITHUB_TOKEN`, push progress with it, and chain the next
   run with `gh workflow run ingest-scripture.yml --ref main` (GITHUB_TOKEN can dispatch
   workflows; it can't trigger them by push). Needs `permissions: actions: write`. Also
   make the "Record progress" step exit cleanly when checkout failed, instead of crashing.
1. **[P0, S] Make "Oriental Orthodox" a real filter.** Today the default picker choice
   `all` sends no tradition filter, so it means "everything in the database". Once
   Western books return (item 4), they would appear under the label "Oriental Orthodox".
   Add an `oriental_orthodox` choice that maps to the tags Oriental churches read,
   keep it as the default, and make an old saved `all` value fall back to it. Test that
   Protestant-only and Catholic-only sources are excluded from the default.
2. **[P0, S] Opt-in picker for the other traditions.** Add Eastern Orthodox, Catholic and
   Protestant to the church picker (English and Amharic labels) after Oriental Orthodox
   and Ethiopian Tewahedo. The Protestant filter must exclude the deuterocanon; there is
   already a canon test for that, so extend it to the picker → filter mapping.
3. **[P1, M] Split the `orthodox` tag into Eastern and Oriental.** `data/canon.json` and
   the source rules use one `orthodox` tag for both communions. Their canons differ
   (e.g. 3 Maccabees, Psalm 151, Prayer of Manasseh; Ethiopian broader canon), and
   Chalcedon divides them. Add `eastern_orthodox` / `oriental_orthodox` tags with an
   additive migration (new array values only, no rewrite of existing rows until approved),
   and document every book's assignment with a reason in canon.json.
4. **[P1, M] Bring back the Western sources removed in PR #78.** *The Imitation of
   Christ* (Catholic) and Bunyan's *Grace Abounding* (Protestant, a first-person story of
   sin and restoration) are public domain. *The Pilgrim's Progress* is allegory, not a
   life, so re-add it only as clearly labelled allegory or leave it out. Recover the
   source rules from git history (`git show 58fbf1f^:corpus/scripture/sources.json`
   and the PR #78 diff), re-tag them, and let fetch/ingest re-run.
5. **[P1, S] Show where traditions differ.** When an answer cites a book that is scripture
   for some traditions but not others (e.g. the deuterocanon, Enoch), label it in the
   citation panel ("Scripture for Catholic and Orthodox; not in the Protestant canon")
   from `canon.json`, with a test.
7. **[P2, S] Port the paper-search eval gate to the scripture app.** `eval.yml` grades the
   retired arXiv corpus, so it is now manual-only. Make `scripture-eval` a PR gate,
   retrieval-only (no Gemini calls) in CI.
8. **[P2, S] Fix the 11 ESLint warnings** (7 unused vars, 4 hook deps), then make
   warnings fail CI (`eslint --max-warnings 0`).
9. **[P2, M] Grow the golden set with scripture questions** for each new tradition
   (Catholic, Protestant, Eastern Orthodox struggles and filter checks). Add to the dev
   split only; the holdout stays frozen (hash-pinned in tests/project-rules.test.ts).
10. **[P2, S] `npm audit` and dependency review.** Record findings; upgrade only patch and
    minor versions with clear licenses.
11. **[P3, S] Close stale PR #6 (orthodox-library)** once Alpha agrees (NEEDS_APPROVAL.md #3).
12. **[P3, M] Slow `/status/[id]/[lang]` prerender.** Locally each image route takes over
    60s to build (16 retries in one build). Find out why (fonts fetched per route?) and
    cache them, so builds stay fast and don't time out on Vercel.

## Done

- 2026-10-14: Data and deploy workflows run from `main`; old eval.yml manual-only (approved by Alpha).
- 2026-10-14: PR #99. Setup: CI, lint, project-rule tests, memory files (tag v2026-10-14-2).
- 2026-10-14: PR #7. main becomes Not Alone (tag v2026-10-14-1).
