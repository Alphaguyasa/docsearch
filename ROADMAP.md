# Roadmap

Prioritised backlog. The daily run takes the top open item. Mark an item done with
its PR number and move it to "Done" at the bottom. Priority: P0 (urgent) → P3.
Effort: S (< half a run), M (one run), L (split into several PRs).

Last replan: 2026-10-21 (second audit: code, security, i18n, workflows, deps).

## Open

16. **[P1, M] Detect Gemini truncation and blocking.** llm.ts never reads
    `finishReason`. A story cut off at MAX_TOKENS still sends `done`, and an example
    question caches it for later readers (search/route.ts `cacheExample`). A blocked
    reply shows passages with no story. Treat anything but STOP as an error and skip
    the cache. Add stream-parser tests with a stubbed fetch (no test covers llm.ts).
17. **[P1, S] fetch-scripture should start ingest.** Its manifest commit is a
    GITHUB_TOKEN push, which never triggers ingest-scripture, so the sources from #113
    sat fetched but unembedded for a day (dispatched by hand on 2026-10-21). End
    fetch-scripture with `gh workflow run ingest-scripture.yml` when the manifest changed.
18. **[P2, S] Friendly errors, not raw upstream text.** search/route.ts:170 and :199
    send messages like "Gemini request failed (…): 429" to readers, in English even in
    the Amharic UI. Log the detail; send a code mapped to `t.story.errors.*`.
19. **[P2, S] Auth on `/api/telegram/daily`.** Anyone can call it repeatedly (claims,
    setWebhook, setCommands). Check `Authorization: Bearer $CRON_SECRET` (Vercel cron
    sends it; free), and compare webhook/setup secrets with `timingSafeEqual`
    (middleware.ts has `safeEqual`). Needs a new secret set by Alpha (NEEDS_APPROVAL).
20. **[P2, S] Gemini key in a header.** llm.ts puts the key in the URL query string,
    where proxies and logs record it. Send `x-goog-api-key` instead.
21. **[P2, M] Next 16 to clear the last npm advisories.** next 15.5.x pins postcss
    8.4.31 (GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849, source-map path traversal at
    build time on our own CSS, so low real risk). Only next 16 fixes it: a major
    upgrade, own PR, full build and smoke test first.
22. **[P2, S] Workflows on Node 24 actions.** All 8 workflows use checkout@v4,
    setup-node@v4 (cache, upload-artifact too), deprecated with Node 20; deploy and the
    data workflows build on Node 22 while CI tests on 24. Bump majors; align Node.
23. **[P3, S] Remove the legacy DocSearch routes** (api/upload, process, documents,
    documents/[id], app/documents). Dead behind SHOW_DOCUMENTS, but with it on they
    could list and delete corpus books via the service-role client. ROADMAP entry
    here explains the removal, as the safety rules require.
11. **[P3, S] Close stale PR #6 (orthodox-library)** once Alpha agrees (NEEDS_APPROVAL.md #3).
12. **[P3, M] Slow `/status/[id]/[lang]` prerender.** Locally each image route takes over
    60s to build (16 retries in one build). Find out why (fonts fetched per route?) and
    cache them, so builds stay fast and don't time out on Vercel. (2026-10-21: one CI
    build failed on a Google Fonts fetch, "next/font/google queries have exactly one
    entry"; a rerun passed. Self-hosting the fonts would fix both.)
13. **[P3, S] Make ingest's retag robust to statement timeouts.** On 2026-10-19 one
    batch of 100 row updates hit Supabase's statement timeout (each update rewrites
    the HNSW and tsv index entries). The chained rerun recovered, but retag should use
    smaller batches and split a batch in half on a timeout.

## Done

- 2026-10-22: Item 15. The crisis card, /help and the bot's crisis and /help replies are in Amharic for Amharic readers: message, steps and every resource detail (crisis-resources.json v3 has `en`/`am` per line). The search API still sends English; the card re-renders it in the reader's language. A native speaker should check the wording (NEEDS_APPROVAL #5).
- 2026-10-22: Item 14. The safety classifier no longer fails open: only an explicit NONE clears a distress message; an empty, blocked or garbled reply counts as SELF_HARM, like a thrown error.
- 2026-10-21: Item 10. npm audit: 9 advisories (5 high) → 2. sharp 0.35.5 (libvips CVEs), vite 8.3.4, nanoid, source-map-js, postcss 8.5.31, vitest and coverage-v8 4.1.12; no majors, licenses unchanged. Left for item 21: postcss 8.4.31 pinned inside next 15. (npm 10 crashes on this tree with "reading 'edgesOut'"; use npm 11, as CI does.)
- 2026-10-21: PR #115. The scripture eval no longer caps generated answers at 900 tokens (Gemini spends them thinking; answers came back cut off and the main eval failed).
- 2026-10-21: Item 9. The scripture golden set gains 6 dev struggles read through Catholic, Protestant and Eastern Orthodox (Augustine, Miriam, Nebuchadnezzar, Abraham, Noah, Thais/Rahab) and 4 filter checks (Eastern Orthodox, Catholic, Protestant and the Oriental Orthodox default, which must not show the Western-only books). The holdout is unchanged. tests/scripture-golden.test.ts checks that every figure, source, book and tradition the set names exists, and that a check never forbids what that church reads.
- 2026-10-20: Item 7. `scripture-eval-pr.yml` runs the scripture eval as a PR gate in `--retrieval-only` mode: no Gemini key is given to the job, questions that need the LLM tagger or classifier are skipped and reported, and it only runs on PRs touching retrieval, figures, canon, safety or the golden set (Voyage free tier is shared with the site).
- 2026-10-20: Item 4. *The Imitation of Christ* (Catholic + Protestant) and *Grace Abounding* (Protestant) are back as opt-in sources, with their parse rules and tests, a library group, About/footer lines (EN, AM) and SOURCES.md rows. Western-only passages are labelled "Church tradition (Protestant)" in the answer prompt. *The Pilgrim's Progress* stays out (allegory, not a life).
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
