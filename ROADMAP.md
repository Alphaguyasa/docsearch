# Roadmap

Prioritised backlog. The daily run takes the top open item. Mark an item done with
its PR number and move it to "Done" at the bottom. Priority: P0 (urgent) → P3.
Effort: S (< half a run), M (one run), L (split into several PRs).

Last replan: 2026-10-27 (short dependency audit: `npm outdated`; `npm audit` clean). Before that 2026-10-26 and 2026-10-21. The next replan should be a full one (code, security, UX, accessibility, Amharic gaps).

## Open

28. **[P0, S] Production deploy is red (Vercel CLI 65.3.1, "scope does not exist").**
    Waits on NEEDS_APPROVAL #10: with Alpha's OK, pin `vercel@65.2.0` in
    deploy-not-alone.yml and add a test that pins it; otherwise check first whether
    a re-run on a newer CLI passes. (2026-10-27: a re-run on 65.4.0 failed the same
    way.) Once the deploy is green, bump its checkout/setup-node to v7 and Node to 24
    and drop it from EXEMPT in tests/workflow-runtimes.test.ts (left out of item 22).
11. **[P3, S] Close stale PR #6 (orthodox-library)** once Alpha agrees (NEEDS_APPROVAL.md #3).
13. **[P3, S] Make ingest's retag robust to statement timeouts.** On 2026-10-19 one
    batch of 100 row updates hit Supabase's statement timeout (each update rewrites
    the HNSW and tsv index entries). The chained rerun recovered, but retag should use
    smaller batches and split a batch in half on a timeout.
31. **[P3, S] @types/node 20 → 24.** CI, deploy and the data workflows run on Node 24
    since item 22, but the types still describe Node 20. Typecheck may surface fixes.
34. **[P3, M] @anthropic-ai/sdk 0.114 → 1.x** (major). Only the optional Anthropic
    provider in src/lib/llm.ts uses it, and its key is not set in production. Read the
    migration notes; tests mock it, so no API calls.
32. **[P3, L] Toolchain majors, one PR each:** ESLint 10 (+ @eslint/js 10,
    react-hooks plugin 7, which adds new rules), vitest/coverage-v8 5, TypeScript 7.
    Read each migration guide first; dev-only, so no runtime risk.

## Done

- 2026-10-28: Item 23. The legacy DocSearch upload and document routes are gone (api/upload, api/process, api/documents, api/documents/[id], app/documents), with the SHOW_DOCUMENTS gate, nav link, robots entry and DocumentSummary type. With the flag on they could list and delete corpus books through the service-role client; the corpus is curated and ingested by CI. The CLI ingest (scripts/ingest.ts, src/lib/pipeline.ts) stays. tests/proxy.test.ts checks the routes stay removed. The README says it describes v1 (tag v1-docsearch).
- 2026-10-28: Item 33. When retrieval names figures, the answer prompt repeats rule 10 right after the message: tell their stories, do not send the not-covered sentence. Off-topic questions name no one, so their refusal is unchanged. Read offline (no LLM calls): s09 had David, Abraham and Jacob named and Genesis 12 retrieved, yet refused, with rule 10 far up the system prompt. tests/scripture-safety.test.ts. The post-merge scripture eval shows whether it holds.
- 2026-10-28: Item 30. React and react-dom 19.1.0 → 19.3.1 (scheduler 0.28), still pinned exactly. tests/react-version.test.ts checks the two stay equal and match what is installed. Build clean; a browser smoke test of 12 pages had no page or console errors.
- 2026-10-28: Item 29. In-range updates, lockfile only: supabase-js 2.118.0, tsx 4.23.15, typescript-eslint 8.72.1, unpdf 1.9.1, @types/react(-dom) 19.3.0. No packages added or removed; `npm audit` 0. Lint, typecheck, npm test 318/318, vitest 339/339, build, and a `next start` smoke test (/, /about, /help 200; /_next/image 404).
- 2026-10-27: Item 27. `dev` and `build` call `next dev` / `next build` without `--turbopack`; Next 16 uses Turbopack by default (the build banner still says "Turbopack"). tests/next-config.test.ts pins the scripts.
- 2026-10-27: Item 22. Every workflow but deploy-not-alone uses the Node 24 actions (checkout@v7, setup-node@v7, cache@v6, upload-artifact@v7) and builds on Node 24, as CI tests. The deploy workflow waits on item 28. tests/workflow-runtimes.test.ts.
- 2026-10-26: Item 26. next.config.ts sets `images: { unoptimized: true }`, so `/_next/image` (where GHSA-2464-fhr4-w9xw lived) answers 404; no page uses next/image. tests/next-config.test.ts pins both. Checked with `next start`: home 200, /_next/image 404.
- 2026-10-26: Item 25 (PR #129). ci.yml runs `npm audit --omit=dev --audit-level=high` right after install, so a new high or critical advisory in a production dependency turns main red and the next run fixes it first. tests/ci-workflow.test.ts pins the step and its place.
- 2026-10-26: Item 24. zod 4.4.3 → 4.6.7 (GHSA-mrhx-c7xc-m3w5, high: memory exhaustion on oversized constrained collections; the API routes validate request bodies with zod). With item 21, `npm audit` reports 0 vulnerabilities.
- 2026-10-26: Item 21. Next.js 15.5.27 → 16.4.3 (React 19.1 unchanged). Its postcss is 8.5.23, so the two postcss advisories are gone, and so is a critical Next advisory published since the last run (GHSA-2464-fhr4-w9xw, RCE in the image optimizer with SVG). PR #127. `src/middleware.ts` is now `src/proxy.ts` (Next 16 renamed the convention; the old name still ran but was deprecated). tsconfig gains Next 16's `jsx: react-jsx` and `.next/dev/types`. tests/proxy.test.ts checks the gate still runs under the new name. Build and a `next start` smoke test of 13 pages were clean.
- 2026-10-25: Item 20. Gemini calls (src/lib/llm.ts and the eval harness's provider) send the key in the `x-goog-api-key` header instead of `?key=` in the URL, where proxies and request logs record it. tests/llm-stream.test.ts checks both the stream and `complete()`.
- 2026-10-25: Item 19. /api/telegram/daily answers 401 unless the request carries `Authorization: Bearer $CRON_SECRET` (Vercel cron sends it); while the secret is unset the route stays open, so the bot keeps posting until Alpha sets it (NEEDS_APPROVAL #9). The webhook and setup secrets now compare in constant time through `src/lib/safe-equal.ts`, shared with the middleware. tests/cron-auth.test.ts.
- 2026-10-24: Item 18. /api/search sends a code (`busy`, `retrieval`, `generation`) with every error, and a plain English line instead of the upstream text; the detail goes to the server log. The page shows `t.story.errors[code]`, so Amharic readers get Amharic. tests/search-errors.test.ts.
- 2026-10-24: Item 17. fetch-scripture dispatches ingest-scripture (`actions: write`) after a clean fetch whose manifest commit was pushed, so new sources and canon.json tag edits reach the database without a hand dispatch. The manifest commit re-applies the run's own regenerated files on the latest tip each attempt instead of `git pull --rebase`, so two queued fetch runs no longer conflict. tests/fetch-workflow.test.ts pins both.
- 2026-10-23: Item 16. The Gemini stream reads `finishReason` and `promptFeedback.blockReason`: anything but STOP (MAX_TOKENS, SAFETY, RECITATION, a blocked prompt, or a stream that closes with no finish reason) throws after the text already sent, so /api/search ends with an error line instead of "done" and does not cache the half-story. A last event with no trailing newline is no longer dropped. tests/llm-stream.test.ts covers the parser with a stubbed fetch. `complete()` is unchanged (the classifiers rely on short capped replies).
- 2026-10-23: Item 12. The site fonts are self-hosted with next/font/local (src/app/fonts, OFL 1.1 from @fontsource 5.3.0: same faces, weights and subsets). The build no longer downloads from Google Fonts, which had failed CI on main ("next/font/google queries have exactly one entry"). A full local build now takes 44s with no retries, so the slow image prerender is gone too. tests/fonts.test.ts keeps it that way.
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
