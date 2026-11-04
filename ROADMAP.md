# Roadmap

Prioritised backlog. The daily run takes the top open item. Mark an item done with
its PR number and move it to "Done" at the bottom. Priority: P0 (urgent) → P3.
Effort: S (< half a run), M (one run), L (split into several PRs).

Last replan: 2026-11-02 (item 51 added 2026-11-04 from the ESLint 10 upgrade) (audit: code, security, dependencies, localization, tests; items 44-49). Before that 2026-10-29 (items 35-42), 2026-10-27 (dependencies), 2026-10-26 and 2026-10-21.

## Open

28. **[P0, S] Production deploy is red ("The specified scope does not exist").**
    2026-11-02: `vercel@65.2.0` is pinned (PR #150, tests/deploy-workflow.test.ts),
    and 65.2.0 now fails the same way (run 41401554345), so the CLI is not the
    cause: the Vercel token or the team slug changed. Waits on NEEDS_APPROVAL #14
    (Alpha checks both on vercel.com). Mark done once a deploy on main is green.
    Then bump its checkout/setup-node to v7 and Node to 24 and drop it from EXEMPT in tests/workflow-runtimes.test.ts (left out of item 22).
43. **[P2, M] Per-reader share of the web search limit.** The bot has its per-chat
    share (item 39); the website has none. Needs a privacy decision first (a salted,
    hashed IP kept a few minutes, or nothing at all): NEEDS_APPROVAL #11. Waits on it.
50. **[P2, S] Enforce the CSP.** Item 44 sends it report-only. Once Alpha (or a
    run with browser access to production) sees no "Content Security Policy" lines
    in the console on the live site (home, a person, a story, /help, Amharic), and
    the deploy is green again (item 28), rename the header to
    `Content-Security-Policy` and update tests/next-config.test.ts.
32. **[P3, M] TypeScript 7** (the last toolchain major; vitest 5 done 2026-11-03,
    ESLint 10 done 2026-11-04). Waits on typescript-eslint, whose peer range is still
    `>=4.8.4 <6.1.0` (8.72.1). Read the migration guide first; dev-only.
51. **[P3, M] Turn on the three React Compiler lint rules left off** in eslint.config.mjs
    (react-hooks 7): `set-state-in-effect` (10 findings: localStorage and URL state
    read on mount in page.tsx and the person/story pages), `refs` (5: `lastQuestion.current`
    read while rendering in page.tsx), `purity` (1: `Date.now()` in the /stats server
    page). One rule per PR; each fix must keep the behaviour (no flash of the wrong
    church or language on load). Check in a browser under `next start`, EN and AM.
    tests/eslint-config.test.ts lists the rules that are off; update it as each turns on.
47. **[P3, S] Dev-only advisory GHSA-g3hv-75wg-m249** (minimatch <11.0.1, moderate,
    DoS via glob patterns) through eslint 9 and typescript-eslint. No fixed release
    in their ranges (ESLint 10 still uses minimatch 10), and `npm audit --omit=dev`
    is clean, so CI stays green. Watch; update when they move to minimatch 11. Do not
    force an override (minimatch 11 is a major). 2026-11-04: still minimatch 10.2.6
    under ESLint 10.14 and typescript-eslint 8.72.
49. **[P3, M] Read a story aloud (browser speech, free).** A "listen" button on the
    story using `speechSynthesis`, offered only when the browser has a voice for the
    story's language (Amharic voices are rare; hide the button rather than read
    Amharic with an English voice). No server cost. EN/AM labels, keyboard and
    screen-reader friendly, respects a pause/stop.

## Done

- 2026-11-04: Item 32 (ESLint part). eslint 9 → 10.14, @eslint/js 10, eslint-plugin-react-hooks 5 → 7.1, dev only. ESLint 10's new `preserve-caught-error` found two rethrows without `cause` (eval/src/config.ts, scripts/ingest-scripture.ts); both now pass it. react-hooks 7's recommended set adds the React Compiler rules: all on except `set-state-in-effect`, `refs` and `purity`, which flag 16 deliberate patterns and are item 51. tests/eslint-config.test.ts checks the majors, that rules-of-hooks and exhaustive-deps still fire, and exactly which hooks rules are off. Lint, typecheck, npm test 404/404, vitest 339/339, build.

- 2026-11-04: Item 48. Request bodies are capped before parsing (src/lib/read-body.ts): the declared Content-Length is checked first, then the stream is read chunk by chunk and the read stops once it passes the cap, so a chunked body with no length is not buffered whole either. Caps: /api/search 16 KB, /api/feedback 4 KB (both answer 413), /api/telegram 256 KB (an oversized update is dropped with a 200, like a malformed one, so Telegram does not retry). /stats/session uses the same reader. tests/read-body.test.ts and route tests; checked under `next start` with curl (2 MB body, plain and chunked: 413).

- 2026-11-03: Item 46. /stats no longer takes its key in the URL. Without the stats cookie it shows a one-field form that posts to /stats/session, which sets `na_stats`: an HMAC-SHA256 of the key (never the key), httpOnly, Secure, SameSite=Strict, Path=/stats, 30 days; "Sign this browser out" clears it, and changing STATS_KEY signs everyone out. An old `/stats?key=…` link is answered by the proxy with a 303 to /stats without the key (cookie set only if it was right); the Basic auth gate still runs first. The page's own timingSafeEqual is gone (src/lib/stats-auth.ts uses safeEqual and Web Crypto). The form body is capped before parsing. With STATS_KEY unset the page is still a 404. tests/stats-auth.test.ts; tests/proxy.test.ts awaits the now-async proxy. Checked under `next start` with curl and Chromium (wrong key, right key, sign out; no console or CSP errors).
- 2026-11-03: Item 32 (vitest part, PR #152). vitest and @vitest/coverage-v8 4.1.12 → 5.1.0, dev only. Read the 5.0 migration guide: the eval tests use no mocks, `sequential`, `toThrow("")`, unawaited `resolves`, or removed entry points, and the coverage include patterns were already root-relative, so no config change. vitest 339/339 and an identical coverage report (same files, same figures) before and after. tests/vitest-version.test.ts keeps the two packages on one release.
- 2026-11-02: Item 34. @anthropic-ai/sdk 0.114 → 1.3.0 (Alpha approved, NEEDS_APPROVAL #13). 1.x sends API version 2026-10-21, which rejects sampling parameters, so the eval's Anthropic provider no longer sends `temperature` (the Gemini path keeps 0, and the disk cache keeps re-runs identical). llm.ts needed no change (`thinking: disabled` is accepted on claude-sonnet-5). Typecheck, npm test, vitest 339/339; `npm audit --omit=dev` 0. tests/anthropic-sdk.test.ts.
- 2026-11-02: Item 11. Stale PR #6 (orthodox-library) closed with Alpha's OK; the branch is kept.

- 2026-11-02: Item 44. Every response carries `Content-Security-Policy-Report-Only` (src/lib/csp.ts, sent from next.config.ts): same-origin only for scripts, styles, images, fonts, fetches, workers and the manifest; `'unsafe-inline'` for scripts and styles (Next's inline bootstrap, the JSON-LD block); no eval in production; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. A `next start` browser smoke test of 12 pages (EN and AM) logged no violations; an injected off-site image was reported, so the check works. tests/next-config.test.ts. Enforcing it is item 50.

- 2026-11-02: Item 45. tests/feedback-today-routes.test.ts calls POST /api/feedback and GET /api/today with the db mocked: a good tap is stored through `add_feedback` with numbers and ids only (204); a body that is not JSON, a wrong type, an unknown language, free text in place of a person id, an unknown tag or more than 5 people is a 400 that never reaches the db; the hourly cap and a db error are a 429; today returns the posted person, falls back to the person of the day, and gives `id: null` (200) when the db throws.

- 2026-11-01: Item 42. The Telegram webhook body is parsed with zod (`parseUpdate` in src/lib/telegram-update.ts). Each part (message, inline query, button press) is checked on its own, and a malformed part is dropped, so a message without `chat` or a body that is not JSON gets a 200 and no reply, where before it threw a 500 and Telegram retried. A bad part never drops a good one in the same update. tests/telegram-update.test.ts and a route test in tests/api-routes.test.ts.

- 2026-11-01: Item 41. The unused DocSearch components are gone (SearchInput, CitationTargets, `IdleExamples` and the "ingest PDFs" `EmptyState`, and the unused `Quote` icon). The Basic auth realm says "Not Alone", and the proxy matcher skips /api/telegram/* (webhook, setup, daily cron), which cannot send Basic credentials and check their own secrets, so setting APP_PASSWORD no longer silences the bot. The home page metadata follows the reader's language (`generateMetadata` in layout.tsx, src/app/site-meta.ts; the Amharic line is the bot's own Amharic description). tests/components-used.test.ts (every exported component is used somewhere, metadata in both languages) and two proxy tests.

- 2026-10-31: Item 40. Example answers are also kept in a shared table, `example_answers` (migration 20261031090000, additive: a table with RLS and two service-role-only functions, `get_example` and `put_example`, 6-hour TTL). A cold instance reads the answer back instead of spending Gemini quota on it again. Only keys made by `exampleKey` (the fixed questions) can reach the table. The answer is saved after "done" and before the stream closes. Until the migration is applied, or on any db error, the memory cache works alone as before. tests/example-cache.test.ts (shared read, fallback, key guard, migration checks) and a route test.

- 2026-10-31: Item 39 (bot part). Each Telegram chat may start 2 searches per 3 minutes (`ChatLimiter` in src/lib/chat-limit.ts: pure, injectable clock, in memory, at most 10,000 chats, only chat numbers and times). Over its share a chat gets "please wait a few minutes" (EN, AM) with the matching people and no call to /api/search; a crisis phrase is still answered at once, and the fixed example questions are not counted. tests/chat-limit.test.ts and a route test in tests/api-routes.test.ts. The web per-reader limit is item 43 (NEEDS_APPROVAL #11).

- 2026-10-30: Item 38. tests/api-routes.test.ts calls POST /api/search and /api/telegram directly, with the db and the network mocked and `after()` run inside a minimal Next request scope that counts deferred tasks: 400 on bad, empty, over-long input or an unknown church (no slot taken); a crisis answered before the rate limit; a cached example served without a slot; 429 with `code: "busy"`; 503 without a bot token; 403 on a wrong webhook secret; only private chats get a reply.
- 2026-10-30: Item 37 (PR #142). The streamed story `<article>` has `aria-busy` while it streams, an always-mounted sr-only `role="status"` says "Your story is ready." (EN, AM) when it finishes, and its `lang` follows the story's majority script (`textLang` in src/lib/script-lang.ts), so an Amharic story under the English UI gets an Amharic voice. The bot's `detectLang` uses the same Ethiopic check. tests/script-lang.test.ts.
- 2026-10-29: Item 36. When a search fails outright, `retrieveForStruggle` keeps the figure passages it already found and marks the result degraded (`topUpWithSearch`); it still throws when there are none. The document-id lookup throws on a db error and caches only successful lookups (`memoizeSuccess`), so a transient error no longer hides a source until a cold start. tests/retrieve-struggle.test.ts.
- 2026-10-29: Item 35 (PR #140). A story part Telegram rejects is resent as plain text with its keyboard (`sendHtml` in src/lib/telegram.ts); italics no longer cross a tag (`**a *b** c*` was mis-nested), and splitMessage's hard cut backs off before a partial entity. tests/telegram.test.ts.
- 2026-10-29: Item 31. @types/node 20 → 24.19.2 (undici-types 7.24.6), matching the Node 24 that CI and the workflows run. Typecheck needed no code changes. tests/workflow-runtimes.test.ts checks the types major equals ci.yml's node-version.
- 2026-10-29: Item 13. Ingest retags in batches of 25 rows (was 100), and a batch that hits a statement timeout is split in half and retried, down to one row (`applyInBatches` in src/lib/scripture/plan.ts). Other errors still fail at once. tests/scripture-plan.test.ts, with a mocked update.
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
