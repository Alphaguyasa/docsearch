# Roadmap

Prioritised backlog. The daily run takes the top open item. Mark an item done with
its PR number and move it to "Done" at the bottom. Priority: P0 (urgent) → P3.
Effort: S (< half a run), M (one run), L (split into several PRs).

Last replan: 2026-10-14 (first audit, after main became Not Alone).

## Open

4. **[P1, M] Bring back the Western sources removed in PR #78.** *The Imitation of
   Christ* (Catholic) and Bunyan's *Grace Abounding* (Protestant, a first-person story of
   sin and restoration) are public domain. *The Pilgrim's Progress* is allegory, not a
   life, so re-add it only as clearly labelled allegory or leave it out. Recover the
   source rules from git history (`git show 58fbf1f^:corpus/scripture/sources.json`
   and the PR #78 diff), re-tag them, and let fetch/ingest re-run.
7. **[P2, S] Port the paper-search eval gate to the scripture app.** `eval.yml` grades the
   retired arXiv corpus, so it is now manual-only. Make `scripture-eval` a PR gate,
   retrieval-only (no Gemini calls) in CI.
9. **[P2, M] Grow the golden set with scripture questions** for each new tradition
   (Catholic, Protestant, Eastern Orthodox struggles and filter checks). Add to the dev
   split only; the holdout stays frozen (hash-pinned in tests/project-rules.test.ts).
10. **[P2, S] `npm audit` and dependency review.** Record findings; upgrade only patch and
    minor versions with clear licenses.
11. **[P3, S] Close stale PR #6 (orthodox-library)** once Alpha agrees (NEEDS_APPROVAL.md #3).
12. **[P3, M] Slow `/status/[id]/[lang]` prerender.** Locally each image route takes over
    60s to build (16 retries in one build). Find out why (fonts fetched per route?) and
    cache them, so builds stay fast and don't time out on Vercel.

13. **[P3, S] Make ingest's retag robust to statement timeouts.** On 2026-10-19 one
    batch of 100 row updates hit Supabase's statement timeout (each update rewrites
    the HNSW and tsv index entries). The chained rerun recovered, but retag should use
    smaller batches and split a batch in half on a timeout.

## Done

- 2026-10-19: Item 8. The 11 ESLint warnings are fixed (unused imports and vars removed; two deliberate hook deps documented) and `npm run lint` runs with `--max-warnings 0`.
- 2026-10-19: Item 3. `orthodox` split: canon.json tags `eastern_orthodox` / `oriental_orthodox` with a cited basis per book (PR #110); the default reads `oriental_orthodox`, "Eastern Orthodox" reads `eastern_orthodox` (PR B). `orthodox` stays until Alpha approves removing it.
- 2026-10-18: Item 5. Cited scripture outside some canons is labelled ("In the Catholic, Orthodox and Ethiopian Tewahedo canons; not in the Protestant canon."), EN and AM.
- 2026-10-18: Item 3a. Ingest retags done rows whose tags changed (no re-embed); before, canon.json tag edits never reached the DB.
- 2026-10-16: Item 2. Picker offers Eastern Orthodox, Catholic, Protestant (opt-in); the Telegram bot sends the default church.
- 2026-10-16: Item 1. "Oriental Orthodox" is a real choice (`oriental_orthodox` → tags orthodox + ethiopian_orthodox); saved "all" falls back to it.
- 2026-10-15: Item 0b. ingest-scripture chains with GITHUB_TOKEN + workflow dispatch; no INGEST_PAT.
- 2026-10-15: PR #102. Next.js 15.5.21 → 15.5.27, critical RCE advisories fixed (tag v2026-10-15-1).

- 2026-10-14: Data and deploy workflows run from `main`; old eval.yml manual-only (approved by Alpha).
- 2026-10-14: PR #99. Setup: CI, lint, project-rule tests, memory files (tag v2026-10-14-2).
- 2026-10-14: PR #7. main becomes Not Alone (tag v2026-10-14-1).
