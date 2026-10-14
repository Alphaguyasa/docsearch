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

**Not done yet (next run starts here, on branch claude/setup)**
1. Re-point the workflows from `pivot/scripture` to `main`: deploy-not-alone, fetch-,
   ingest- and scripture-eval. ingest-scripture.yml lines 131-138 push to
   pivot/scripture, and scripture-eval.yml line 74 looks up the PR by that head.
   Until then, production deploys still come only from pivot/scripture.
2. Add `.github/workflows/ci.yml`: npm ci, lint, `tsc --noEmit`, `npm test`,
   `npx vitest run`, and `next build` with dummy env. There is no ESLint yet. The plan
   is eslint@9 + eslint-config-next@15.5 via FlatCompat; how many existing issues it
   reports has not been measured.
3. Write CLAUDE.md with every policy from the brief, plus ROADMAP.md,
   NEEDS_APPROVAL.md, PIVOT_PLAN.md and SOURCES.md. Add tests for the project rules.
   Open items for NEEDS_APPROVAL: the Amharic Bible is non-commercial with permission,
   not PD; the Lausiac History is PD in the US only; the "orthodox" tag mixes Eastern
   and Oriental; the old paper-search eval.yml spends Gemini quota on PRs; PR #6 is stale.
4. Top roadmap item: make "Oriental Orthodox" a real tradition filter (today the
   default means "no filter"), then add Eastern Orthodox, Catholic and Protestant as
   opt-in choices.
5. Create the 06:30 Nairobi cloud scheduled task.
