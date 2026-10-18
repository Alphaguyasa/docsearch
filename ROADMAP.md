# Roadmap

Prioritised backlog. The daily run takes the top open item. Mark an item done with
its PR number and move it to "Done" at the bottom. Priority: P0 (urgent) → P3.
Effort: S (< half a run), M (one run), L (split into several PRs).

Last replan: 2026-10-14 (first audit, after main became Not Alone).

## Open

3. **[P1, M] Split the `orthodox` tag into Eastern and Oriental.** `data/canon.json` and
   the source rules use one `orthodox` tag for both communions. Their canons differ
   (e.g. 3 Maccabees, Psalm 151, Prayer of Manasseh; Ethiopian broader canon), and
   Chalcedon divides them. Add `eastern_orthodox` / `oriental_orthodox` tags (keep
   `orthodox` until Alpha approves removing it), document every book's assignment with
   a reason in canon.json, then point the `orthodox` and `oriental_orthodox` choices in
   `tradition-choice.ts` at the new tags. Ingest now retags done rows in place (3a,
   2026-10-18), so a canon.json change reaches the DB without re-embedding.
   **Waits on NEEDS_APPROVAL #7** (what `oriental_orthodox` means for a book).
4. **[P1, M] Bring back the Western sources removed in PR #78.** *The Imitation of
   Christ* (Catholic) and Bunyan's *Grace Abounding* (Protestant, a first-person story of
   sin and restoration) are public domain. *The Pilgrim's Progress* is allegory, not a
   life, so re-add it only as clearly labelled allegory or leave it out. Recover the
   source rules from git history (`git show 58fbf1f^:corpus/scripture/sources.json`
   and the PR #78 diff), re-tag them, and let fetch/ingest re-run.
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

- 2026-10-18: Item 5. Cited scripture outside some canons is labelled ("In the Catholic, Orthodox and Ethiopian Tewahedo canons; not in the Protestant canon."), EN and AM.
- 2026-10-18: Item 3a. Ingest retags done rows whose tags changed (no re-embed); before, canon.json tag edits never reached the DB.
- 2026-10-16: Item 2. Picker offers Eastern Orthodox, Catholic, Protestant (opt-in); the Telegram bot sends the default church.
- 2026-10-16: Item 1. "Oriental Orthodox" is a real choice (`oriental_orthodox` → tags orthodox + ethiopian_orthodox); saved "all" falls back to it.
- 2026-10-15: Item 0b. ingest-scripture chains with GITHUB_TOKEN + workflow dispatch; no INGEST_PAT.
- 2026-10-15: PR #102. Next.js 15.5.21 → 15.5.27, critical RCE advisories fixed (tag v2026-10-15-1).

- 2026-10-14: Data and deploy workflows run from `main`; old eval.yml manual-only (approved by Alpha).
- 2026-10-14: PR #99. Setup: CI, lint, project-rule tests, memory files (tag v2026-10-14-2).
- 2026-10-14: PR #7. main becomes Not Alone (tag v2026-10-14-1).
