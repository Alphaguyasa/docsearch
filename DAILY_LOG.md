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

**Next run:** ROADMAP item 0 (Next.js 15.5.27 security patch), then item 1 (make
"Oriental Orthodox" a real tradition filter).
