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

**Next run:** ROADMAP 4 (bring back *Imitation of Christ* and *Grace Abounding*), then
7 (scripture-eval as a retrieval-only PR gate). Item 3 waits on NEEDS_APPROVAL #7.
