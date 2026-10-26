# Daily log

## 2026-10-14: run 1 (interactive setup, stopped early at the usage limit)

**Decisions by Alpha (today):**
- Scope: all of Christianity, with Oriental Orthodox / Ethiopian Tewahedo kept as the
  default view. The other traditions are opt-in. This reverses the narrowing in PR #78.
- Trunk: `main`.

**Done**
- PR #7 (pivot/scripture → main) merged with a merge commit, so the history of ~90 PRs
  is kept. Tag `v2026-10-14-1`. Old DocSearch is still at tag `v1-docsearch`.
- Checked locally on main: `tsc` clean, `npm test` 229/229, `next build` passes with
  dummy env, vitest 338/339. The one failure was a timeout: vitest's default is 5s and
  the spawn takes ~20s on a slow machine. Fixed on this branch.
- Model check: the docs list Claude Fable 5.1 as above Opus 5.5.

**Continued after the usage limit reset (same day)**
- PR "Setup": CLAUDE.md (committed now; it was gitignored), ROADMAP.md, NEEDS_APPROVAL.md,
  PIVOT_PLAN.md and SOURCES.md. Also ci.yml (lint, typecheck, both test suites, build
  with dummy env), ESLint: typescript-eslint + react-hooks, because eslint-config-next pulls in an unfixed
  high advisory (braces). 6 `any` errors in scripts/fetch-art.ts and 7 small errors fixed,
  11 warnings left, and tests/project-rules.test.ts (licenses, SOURCES.md coverage, frozen
  holdouts, prompt rules, crisis help).
- Found: `npm audit` reports critical RCE advisories in next@15.5.21 (production).
  It is ROADMAP item 0, done next as its own PR.
- Blocked: re-pointing the deploy/data workflows to `main`, and turning off the old
  eval.yml PR trigger. The auto-mode safety check refused edits that change how
  production deploys. Logged as NEEDS_APPROVAL #1 and ROADMAP item 6. Until then,
  merges to `main` are not deployed.

**Later the same day**
- PR #99 (setup) merged, tag v2026-10-14-2. The daily cloud routine is created:
  `trig_01QURCD5m9PNSijkCLAqKPcU`, 06:30 Nairobi, no connectors.
- Alpha approved the workflows on main. Deploy, fetch, ingest and scripture-eval now run
  from `main`, and the old eval.yml is manual-only.
- Alpha: no Fable (no credit). The routine is switched to the `opus` alias, and
  CLAUDE.md now says never to go above Opus.
- Routines have no "automatically approve" setting, so nothing to do there.
- The Next.js 15.5.27 upgrade was interrupted: Claude Code killed the npm install
  because the PC ran low on memory. Still ROADMAP item 0, first for the next run.

- PR #100 merged (tag v2026-10-14-3). On `main`: deploy-not-alone **succeeded** (first
  production release from main), fetch-scripture, scripture-eval and ci succeeded.
  ingest-scripture **failed at checkout**: the `INGEST_PAT` secret is rejected. No data
  lost (9264/9264 chunks already embedded). Added as ROADMAP 0b and NEEDS_APPROVAL #6.

**Next run:** ROADMAP item 0 (Next.js 15.5.27 security patch), then item 1 (make
"Oriental Orthodox" a real tradition filter).

## 2026-10-15: run 2 (scheduled)

- Main CI green at start. Model check: Opus 5.5 is the newest Opus; the run is on it.
  No switch needed (Fable not used, per policy).
- ROADMAP 0: PR #102 upgrades next 15.5.21 → 15.5.27. No criticals left in
  `npm audit --omit=dev`; remaining highs (postcss inside next, sharp, nanoid,
  source-map-js) stay in item 10. Local: lint 0 errors, typecheck, npm test 237/237,
  vitest 339/339, build OK. GitHub CI green.
- **Blocked:** a Vercel commit status from project `alpha-ed50/docsearch` fails on the
  PR (new today; not the production project). Same failure reproduces on `main` code
  when env vars are missing. Not merged per MERGE POLICY. NEEDS_APPROVAL #7.
- ROADMAP 0b (ingest without INGEST_PAT) not started: one branch per run, and it would
  hit the same Vercel status. Plan stays as written in ROADMAP.
- Note: vitest needs CI's dummy env vars locally (runner.test imports env.ts).

**Later the same day (Alpha in the session)**
- Alpha confirmed the failing project was the old `alpha-ed50/docsearch`
  (docsearch-sand.vercel.app), disconnected its Git integration, and approved merging
  #102 past its status. #102 squash-merged as 5921ad3; ci and deploy-not-alone on main
  succeeded, so production runs next 15.5.27.
- Tag `v2026-10-15-1` could not be pushed from the cloud session (the git proxy only
  allows the session branch; the tags API is blocked too). Alpha to create it, or the
  next run with `gh`.
- ROADMAP 0b: ingest-scripture checks out with GITHUB_TOKEN, chains with
  `gh workflow run ... --ref main` (`actions: write`), and skips the progress step
  when checkout failed. tests/ingest-workflow.test.ts pins it. Not exercised for real
  until the next ingest run (it triggers on the workflow change when merged).

**Next run:** item 1 (make "Oriental Orthodox" a real tradition filter), then item 2.

## 2026-10-16: run 3 (scheduled)

- Main CI green at start. Model check: Opus 5.5 is still the newest Opus; the run is on
  it. No switch needed (Fable not used, per policy).
- ROADMAP 1: PR #105. "Oriental Orthodox" is a real choice, `oriental_orthodox`, which
  reads tags `orthodox` + `ethiopian_orthodox` (today's corpus, unchanged) and never
  Catholic-only or Protestant-only sources. The site always sends its choice; a saved
  `all` falls back to it. An omitted `tradition` in the API (Telegram bot) still means
  no filter; folded into ROADMAP item 2. Local: lint 0 errors (11 warnings), typecheck,
  npm test 246/246, vitest 339/339, build OK. GitHub CI green.
- New question for Alpha: NEEDS_APPROVAL #6 (should the default hide Ethiopian-only
  books, as the picker hint says?). Default: keep showing them.
- PR #105 squash-merged as a809b4a. Tag `v2026-10-16-1` made locally but the push was
  refused (the cloud git proxy only allows the session branch, as on 2026-10-15).
  Alpha to create it: `git tag -a v2026-10-16-1 a809b4a -m "..." && git push origin v2026-10-16-1`.
- ROADMAP 2: the picker offers Eastern Orthodox, Catholic and Protestant after the two
  Oriental choices (labels and hints already existed in EN and AM). The Telegram bot now
  sends `tradition: oriental_orthodox` and filters its fallback people the same way, so
  Western-only sources stay out of it. Tests pin the picker order, that every option
  reads the protocanon, the Protestant option excludes the deuterocanon and
  Ethiopian-only figures, and the bot request. Note: until item 3 splits the
  `orthodox` tag, "Eastern Orthodox" reads every book tagged `orthodox`.

## 2026-10-18: run 4 (scheduled)

- Main CI green at start (ci and deploy on 54d9430). Model check: Opus 5.5 is still the
  newest Opus; the run is on it. No switch needed (Fable not used, per policy).
- ROADMAP 3 (split `orthodox`): found that ingest only compared content, so a tag edit
  in canon.json never reached rows already embedded. **PR #107** (3a): ingest now
  retags done rows in place, grouped by new tags, with no re-embedding. Squash-merged as
  f62f31a. Its merge starts one ingest run, which should report `retag 0`.
  The split itself is **blocked on NEEDS_APPROVAL #7**: the six Oriental churches do not
  share one canon, so what `oriental_orthodox` means for a book is Alpha's call, and
  every assignment needs a cited reason.
- ROADMAP 4 (Western sources) skipped for now: it is M and needs a full run. ROADMAP 5
  went next.
- ROADMAP 5: under each cited scripture passage that not every church reads, a line such as
  "In the Catholic, Orthodox and Ethiopian Tewahedo canons; not in the Protestant
  canon." (EN and AM), from the passage's canon.json tags. Tests in
  tests/canon-note.test.ts. Local: lint 0 errors (11 warnings), typecheck, npm test
  256/256, vitest 339/339, build OK.
- Tags `v2026-10-18-1` (f62f31a) and `-2` could not be pushed (the cloud git proxy
  refuses tags, as before). Alpha to create them.

- After merge: the ingest run for #107 reported `retag 0` (DB tags already matched).

**Later the same day (Alpha in the session)**
- Alpha answered NEEDS_APPROVAL #7: `oriental_orthodox` = books all six Oriental
  churches share (option a). That also settles #6: the default hides Ethiopian-only
  books. ROADMAP 3 is unblocked.

**Next run:** ROADMAP 3 (split the `orthodox` tag, per the decision), then 4 (bring
back *Imitation of Christ* and *Grace Abounding*).

## 2026-10-19: run 5 (scheduled)

- Main CI green at start (ci and deploy on 81e8b8b). Model check: Opus 5.5 is still the
  newest Opus; the run is on it. No switch needed (Fable not used, per policy).
- ROADMAP 3 (split `orthodox`), in two PRs so the site never filters on tags the DB
  lacks:
  - **PR #110** (squash-merged as e912bbc): canon.json gets `eastern_orthodox` (same
    books as `orthodox`) and `oriental_orthodox` (books all six Oriental churches read),
    with a `references` table and a cited `basis` per book; the validator enforces it.
    No visible change. Then ingest-scripture was dispatched to retag the DB. The
    first run failed (`retag 5008`, then "canceling statement due to statement
    timeout"; Paradise raw files were also missing that run). It chained itself, and
    the next run retagged 6137 rows and finished 9264/9264. A third, verification run
    reported `retag 0`. Only after that was PR B merged.
  - **PR B**: the default reads `oriental_orthodox` and "Eastern Orthodox" reads
    `eastern_orthodox`. Canon notes name Eastern Orthodox, and never say "not in the
    Oriental Orthodox canon" (a missing tag can mean NEEDS REVIEW, not absent).
  - Now hidden from the default: 2 Peter, 2-3 John, Jude and Revelation, plus the Letter
    of Jeremiah and the Song of the Three (all NEEDS REVIEW); 1-3 Maccabees, 1-2 Esdras
    and the Prayer of Manasseh; and every Ethiopian-only source and figure
    (Synaxarium etc.), as Alpha decided. New question: NEEDS_APPROVAL #8.
  - The canon reference sites were blocked from the cloud session (proxy 403), so each
    basis was written from search-result excerpts and cites the page it came from.
- Local: lint 0 errors (11 warnings), typecheck, npm test 265/265, vitest 339/339,
  build OK.
- **PR #111** squash-merged as fe64d02 after the verification run. Tags `v2026-10-19-1`
  (e912bbc) and `v2026-10-19-2` (fe64d02) were refused by the cloud git proxy and the
  refs API (403), as on earlier days. Alpha to create them.
- ROADMAP 8 (lint): the 11 warnings are fixed and `npm run lint` now passes
  `--max-warnings 0`. Unused imports, vars and an arg were removed (no behaviour
  change). Motion's effect now lists its stable `ref`. CandleScene and Passages keep
  their deliberate deps, with a reason in an eslint-disable line.
- Note: restarting the session branch after each squash-merge needed a
  `--force-with-lease` push. The branch held only already-merged history, so no
  unmerged work was rewritten.

**Report**
| Field | Content |
|---|---|
| Done | ROADMAP 3: #110 (tags + cited basis), #111 (filters use them). ROADMAP 8: lint PR |
| Merged | #110 yes, #111 yes; lint PR, see PR. Tags not pushed (proxy 403) |
| Failed or blocked | First retag run hit a statement timeout (recovered by its chained run); tag pushes blocked |
| Roadmap | 7 open (4, 7, 9, 10, 11, 12, 13). No replan needed |
| Model | Opus 5.5, still the newest Opus. No action |
| Needs approval | New #8 (what the default now hides, incl. Revelation), plus #1-5 |
| Next | ROADMAP 4 (Imitation of Christ, Grace Abounding), then 7 (scripture eval gate) |

**Next run:** ROADMAP 4, then 7.

## 2026-10-20: run 6 (scheduled)

- Main CI green at start (ci and deploy on 090bff5). Model check: Opus 5.5 is still the
  newest Opus on the models page; the run is on it. No switch needed (Fable not used, per policy).
- ROADMAP 4 (Western sources): **PR #113**, squash-merged as 7ec9c4f. *The Imitation of
  Christ* (tags catholic, protestant) and *Grace Abounding* (protestant) are back in
  sources.json. Their parse rules and tests are restored unchanged from before PR #78.
  New: a "Catholic and Protestant books" group in the library, About and footer lines
  (EN, AM), and SOURCES.md rows. A passage that only Western churches read is labelled
  "Church tradition (Protestant)" in the answer prompt. *The Pilgrim's Progress* stays
  out (allegory). The merge starts fetch-scripture (Gutenberg, serialised) and then ingest.
- ROADMAP 7 (scripture eval gate): new `scripture-eval-pr.yml` and a `--retrieval-only`
  flag for `scripts/scripture-eval.ts`. The job never gets the Gemini key. Without the
  LLM, questions that need it are skipped and reported, not counted: 3 of 35 dev and 4
  of 10 holdout struggles, 1 of 4 tradition checks, 0 of 8 crisis. Path filters keep it
  off PRs that don't touch retrieval, because Voyage's free tier is shared with the site.
  Tests are in tests/scripture-eval-mode.test.ts. See its PR for the merge.
- Local: lint 0 warnings, typecheck, npm test 272/272, vitest 339/339, build OK.
- Tag `v2026-10-20-1` (7ec9c4f) was refused by the cloud git proxy, as on earlier days.
  Alpha to create it.

**Next run:** ROADMAP 9 (grow the golden set for Catholic, Protestant and Eastern
Orthodox; dev split only), then 10 (npm audit). Check that the fetch and ingest of the
two new sources finished.

## 2026-10-21: run 7 (scheduled)

- Main at start: ci and deploy green on 8102d27. The post-merge **scripture-eval was red**
  ("generation s02"): every generated answer after s01 was cut off mid-sentence. The
  eval capped answers at 900 tokens and Gemini spends them thinking. The live stream
  has no cap, so readers were not affected. **PR #115** removes the cap; squash-merged
  as eb1e95b. Its merge re-runs the full eval on main.
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- Last run said the merge of #113 would start ingest. It did not: fetch-scripture's
  manifest commit is a GITHUB_TOKEN push, which triggers nothing. The Imitation of
  Christ and Grace Abounding were fetched but not embedded. ingest-scripture was
  dispatched by hand (run 39539583131, still running at log time). The permanent
  fix is ROADMAP 17.
- ROADMAP 9 (golden set): **PR #116**, squash-merged as 4035450. 6 dev struggles with
  a church filter (Catholic, Protestant, Eastern Orthodox) and 4 filter checks
  (including the Oriental Orthodox default vs the Western-only books). Holdout
  untouched. New tests/scripture-golden.test.ts. The retrieval-only PR gate passed.
  One push-triggered CI build failed on a Google Fonts fetch inside next/font, which
  the PR does not touch; one rerun passed.
- ROADMAP 10 (npm audit): 9 advisories (5 high) → 2 (1 high, 1 moderate), all in-range
  upgrades: sharp 0.35.5, vite 8.3.4, nanoid, source-map-js, postcss 8.5.31, vitest
  4.1.12. Left: postcss 8.4.31 pinned by next 15 (needs next 16, ROADMAP 21). npm 10
  crashes on this tree ("reading 'edgesOut'"); npm 11 works. Local on the upgrade:
  lint 0 warnings, typecheck, npm test 272/272, vitest 339/339, build OK. See its PR
  for the merge.
- **Replan** (only 3 items would have been left): a code, security and i18n audit added
  ROADMAP 14-23. Top: **14 (P0), the safety classifier fails open on an empty
  reply** (verified in safety.ts:81), and 15, the crisis message is English only.
- Tags `v2026-10-21-1` (eb1e95b) and `-2` (4035450) were refused by the cloud git
  proxy, as on earlier days. Alpha to create them.

**Report**
| Field | Content |
|---|---|
| Done | Main fix: #115 (eval cap). ROADMAP 9: #116. ROADMAP 10: npm audit PR |
| Merged | #115 yes, #116 yes; audit PR, see PR. Tags not pushed (proxy) |
| Failed or blocked | Ingest of #113's sources never started (dispatched today); tag pushes refused |
| Roadmap | Replanned: 13 open; top is 14 (P0 safety fail-open) |
| Model | Opus 5.5, still the newest Opus. No action |
| Needs approval | New #9 (CRON_SECRET), plus #1-5, #8 |
| Next | ROADMAP 14 (safety fail-open), then 15 (Amharic crisis message) |

**Next run:** ROADMAP 14, then 15. Check that ingest finished and the full eval on main is green.


## 2026-10-22: run 8 (scheduled)

- Main at start: ci and deploy green on 2fdc120. The full scripture-eval on main
  passed, and the hand-dispatched ingest finished (9615/9615), so The Imitation of
  Christ and Grace Abounding are now embedded.
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- ROADMAP 14 (P0): **PR #119**, squash-merged as 6ea37af. `checkSafety` now clears a
  distress message only on an explicit NONE; an empty, blocked or garbled reply is
  treated as SELF_HARM, like a thrown error. One push-triggered CI build failed on the
  known Google Fonts fetch inside next/font (ROADMAP 12); the PR-triggered run on the
  same commit had passed, and one rerun passed.
- ROADMAP 15: the crisis message, steps and resource details are in Amharic on the
  site (crisis card, /help) and the bot (crisis reply, /help). crisis-resources.json
  moves to v3 with `en`/`am` per step and `detail_am` per resource. The search API
  keeps sending English; the card picks the reader's language from the kind. Tests
  check every Amharic line is Ethiopic, the numbers and links match English, and
  English stays the default. Wording needs a native speaker's read (NEEDS_APPROVAL #5).
  Local: lint 0 warnings, typecheck, npm test 279/279, vitest 339/339, build OK. See
  its PR for the merge.
- Tag `v2026-10-22-1` (6ea37af) was refused by the cloud git proxy, as on earlier
  days. Alpha to create it.

**Next run:** ROADMAP 16 (Gemini finishReason), then 17 (fetch-scripture starts ingest).


## 2026-10-23: run 9 (scheduled)

- Main at start: **ci was red** on a9c5e17 (#120), deploy green. The build failed on
  the Google Fonts download inside next/font ("next/font/google queries have exactly one
  entry"), the third time in three days. Fixed first: **PR #121**, squash-merged as
  1089c4e. The four faces (OFL 1.1, @fontsource 5.3.0) are self-hosted in src/app/fonts
  via next/font/local, same weights and subsets; tests/fonts.test.ts. A full local build
  now takes 44s with no retries, so ROADMAP 12 (slow prerender) is closed with it.
- Also red on main: fetch-scripture for a9c5e17. Two merges 3 minutes apart queued two
  fetch runs; the second rebased its manifest commit onto the first's and conflicted in
  manifest.json and report.md. The first run's manifest landed (9fabbf2), so nothing is
  missing. Folded into ROADMAP 17 (same workflow).
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- ROADMAP 16: the Gemini stream reads `finishReason` and `promptFeedback.blockReason`.
  Anything but STOP (MAX_TOKENS, SAFETY, RECITATION, a blocked prompt, or a stream that
  closes with no finish reason) throws after the text already sent, so /api/search ends
  with an error line instead of "done" and does not cache the half-story. A last SSE
  event with no trailing newline is no longer dropped. tests/llm-stream.test.ts (10
  tests, stubbed fetch). Local: lint 0 warnings, typecheck, npm test 292/292, vitest
  339/339. See its PR for the merge.
- Tag `v2026-10-23-1` (1089c4e) was refused by the cloud git proxy, as on earlier days.
  Alpha to create it.

**Next run:** ROADMAP 17 (fetch-scripture starts ingest, and resolves the manifest
rebase conflict), then 18 (friendly error codes; the new "stopped before the answer
was finished" error is one of the messages to map).


## 2026-10-24: run 10 (scheduled)

- Main at start: ci and deploy green on cd0451f (#122).
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- `gh` is not logged in from the cloud session (GH_TOKEN rejected); GitHub work went
  through the GitHub connector instead.
- ROADMAP 17: **PR #123**, squash-merged as a9821ea. fetch-scripture dispatches
  ingest-scripture after a clean fetch whose manifest commit was pushed, and the
  manifest commit re-applies the run's own files on the latest tip instead of
  `git pull --rebase` (simulated the two-run conflict on a scratch repo: second run
  lands, a rerun is a no-op). The merge touches the workflow, so fetch-scripture ran
  on main straight away. This is the first real test of the dispatch.
- ROADMAP 18: /api/search errors carry a code (`busy`, `retrieval`, `generation`) and a
  plain English line; the upstream detail goes to the server log. The page shows
  `t.story.errors[code]` in English or Amharic. Local: lint 0 warnings, typecheck,
  npm test 299/299, build OK. See its PR for the merge.
- Tag `v2026-10-24-1` (a9821ea) not pushed: the cloud git proxy refuses tags, as on
  earlier days. Alpha to create it.

**Next run:** ROADMAP 19 (auth on /api/telegram/daily; the code can land and skip the
check while CRON_SECRET is unset), then 20 (Gemini key in a header). Check that the
fetch-scripture run for a9821ea dispatched ingest and that ingest finished.


## 2026-10-25: run 11 (scheduled)

- Main at start: ci and deploy green on 36b0f5d (#124). The fetch-scripture run for
  a9821ea dispatched ingest-scripture by itself (run 56, success; 9615/9615), so the
  ROADMAP 17 dispatch works.
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- ROADMAP 19: **PR #125**, squash-merged as 218bed4. /api/telegram/daily answers 401
  unless the request carries `Authorization: Bearer $CRON_SECRET`; while the secret is
  unset it stays open. Webhook and setup secrets compare in constant time
  (`src/lib/safe-equal.ts`, shared with the middleware). tests/cron-auth.test.ts.
  **Alpha: set `CRON_SECRET` in Vercel to switch the check on** (NEEDS_APPROVAL #9).
- ROADMAP 20: the Gemini key goes in the `x-goog-api-key` header instead of `?key=`,
  in src/lib/llm.ts and the eval harness provider. Local: lint 0 warnings, typecheck,
  npm test 305/305, vitest 329/329. See its PR for the merge.
- Tag `v2026-10-25-1` (218bed4) not pushed: the cloud git proxy refuses tags, as on
  earlier days. Alpha to create it.
- Roadmap: 5 open items (21, 22, 23, 11, 13), so no replan yet.

**Next run:** ROADMAP 21 (Next 16, to clear the postcss advisories; own PR, full
build first), then 22 (workflow actions on Node 24).


## 2026-10-26: run 12 (scheduled)

- Main at start: ci and deploy green on eb8039e (#126).
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- ROADMAP 21: **PR #127**, squash-merged as 0859ecc. Next.js 15.5.27 → 16.4.3; its
  postcss 8.5.23 clears the two postcss advisories. Since the last run a **critical**
  Next advisory had been published against the version in production
  (GHSA-2464-fhr4-w9xw, RCE in the image optimizer with SVG); 16.4.3 fixes it too.
  `src/middleware.ts` → `src/proxy.ts` (Next 16 convention); tests/proxy.test.ts.
  Local: lint 0 warnings, typecheck, npm test 309/309, vitest 339/339, build with no
  warnings, `next start` smoke test of 13 routes.
- ROADMAP 24 (new today): zod 4.4.3 → 4.6.7 for GHSA-mrhx-c7xc-m3w5 (high). `npm audit`
  now reports 0 vulnerabilities. See its PR for the merge.
- Replan: 4 items were left after these two, so a short audit added 25 (CI fails on
  high/critical advisories, since today's two arrived with CI green), 26 (turn off
  the unused image optimizer endpoint) and 27 (drop the redundant `--turbopack` flags).
- Tag `v2026-10-26-1` (0859ecc) not pushed: the cloud git proxy refuses tags, as on
  earlier days. Alpha to create it.

**Next run:** ROADMAP 25 (npm audit gate in CI), then 26 (image optimizer off).


## 2026-10-26: run 13 (scheduled)

- Main at start: ci and deploy green on 9f3f144 (#128).
- Model check: Opus 5.5 is still the newest Opus on the models page; the run is on it.
  No switch (Fable not used, per policy).
- ROADMAP 25: **PR #129**, squash-merged as b16ba9d. ci.yml runs
  `npm audit --omit=dev --audit-level=high` after install; tests/ci-workflow.test.ts.
  npm 11 audit: 0 vulnerabilities.
- ROADMAP 26: `images: { unoptimized: true }` in next.config.ts; `next start` answers
  404 on /_next/image (home 200). tests/next-config.test.ts. Local: lint 0 warnings,
  typecheck, npm test 314/314, build OK. See its PR for the merge.
- Tag `v2026-10-26-2` (b16ba9d) not pushed: the cloud git proxy refuses tags, as on
  earlier days. Alpha to create it (and `v2026-10-26-1` on 0859ecc).
- Roadmap: 5 open items (22, 27, 23, 11, 13), so no replan yet.

**Next run:** ROADMAP 22 (workflow actions on Node 24), then 27 (drop `--turbopack`).
