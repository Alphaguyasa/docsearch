# CLAUDE.md: Not Alone (repo: docsearch)

This file is the memory of the project. Every daily autonomous run starts with no
memory, so everything a run needs to know is here, in `ROADMAP.md`, `DAILY_LOG.md`
and `NEEDS_APPROVAL.md`. Keep them current; never delete policy text from this file.

## What this is

**Not Alone** is a Christian app for all of Christianity. Its purpose is to teach
people they are not the only ones who sin, through the true, cited stories of holy
people who sinned and were restored. The stories are drawn from the Bible and from
public-domain Christian sources. Someone writes what they are struggling with ("I
keep lying", "I cheated") and gets one or two stories that each run fall → honesty →
restoration, with every claim cited to a verse or a section.

- English and Amharic (full UI, plus the 1962 Amharic Bible on person pages).
- Channels: the website, a Telegram bot (`@U_not_the_only_bot`), and a daily channel post.
- **Scope decision (owner, 2026-10-14):** all of Christianity, with Oriental Orthodox /
  Ethiopian Tewahedo as the **default** view. Eastern Orthodox, Catholic and Protestant
  are opt-in in the church picker. This reverses PR #78's "Oriental Orthodox only".
  The plan is in `PIVOT_PLAN.md`.
- The repo started as DocSearch (cited PDF search). That version is preserved at tag
  `v1-docsearch`. `main` became Not Alone in PR #7 on 2026-10-14.

Deeper docs: `docs/NOT_ALONE.md` (request path, pipelines, bot, env), `docs/PIVOT.md`
(original pivot decisions), `docs/EVAL_HARNESS.md` (the ten-phase eval harness),
`SOURCES.md` (every text and its license).

## Architecture

- **Next.js 15** App Router + TypeScript + Tailwind 4, deployed on Vercel (project
  `not-alone`, scope `alphaguyasa-5358s-projects`) by `.github/workflows/deploy-not-alone.yml`.
- **Supabase Postgres + pgvector** (project `not-alone-scripture`). Migrations are in
  `supabase/migrations/`.
- **Voyage `voyage-4`** embeddings, 1024 dimensions (free tier: 3 req/min, 10K tok/min).
  Changing the model means a full re-index.
- **Generation** goes through `src/lib/llm.ts`, chosen by `GENERATION_PROVIDER`.
  Production runs on Gemini's free tier with a fallback chain (flash → flash-lite →
  gemma). Anthropic is supported but its key is not set. No SDK wrappers beyond the
  official Anthropic SDK; Voyage and Gemini are called over REST with fetch.
- Request path (`POST /api/search`): safety gate (`src/lib/scripture/safety.ts`) →
  site-wide rate limit → struggle → tags (`struggle.ts`) → figure-first retrieval
  (`retrieve-struggle.ts`, optional tradition filter) → cited answer (`src/lib/answer.ts`).
- Corpus: `corpus/scripture/sources.json` → `scripts/fetch-scripture.ts` →
  per-source rules in `src/lib/scripture/sources.ts` → chunks with `ref` and `traditions[]`.
  The canon map is `data/canon.json`; curated people are in `data/figures.seed.json`.
- Data pipelines run on GitHub Actions: `fetch-scripture.yml`, `ingest-scripture.yml`
  (resumable, chains itself) and `scripture-eval.yml`. They commit their bookkeeping
  files straight to the branch they run on. This is by design; see ROADMAP.md about
  re-pointing them from `pivot/scripture` to `main`.

## Commands

```
npm ci                 # install (Node 24 in CI)
npm run dev            # dev server, http://localhost:3000
npm run lint           # ESLint (typescript-eslint + react-hooks; see eslint.config.mjs for why not next/*)
npm run typecheck      # tsc --noEmit
npm test               # unit tests (node:test, tests/**/*.test.ts)
npx vitest run         # eval-harness unit tests (eval/src/**/*.test.ts)
npm run build          # next build; needs env vars, dummy values are fine
npm run scripture:dry  # parse + chunk the corpus, no network
npm run scripture:ask -- "I keep lying" --tradition protestant   # needs real keys
```

CI (`.github/workflows/ci.yml`) runs install, lint, typecheck, both test suites and
the build on every push and PR, with dummy env vars and no real keys.

## Code style

- Match the surrounding code: small modules, plain functions, comments that explain
  *why* rather than restating what the code does.
- TypeScript strict; no `any` (lint error). Validate external input with zod.
- Tests go next to the existing ones (`tests/*.test.ts` with `node:test` + `assert/strict`;
  vitest for `eval/src`). Mock the LLM and the network in tests; never call a real API.
- User-facing copy: plain, gentle, short sentences, in both English and Amharic (`src/app/i18n`).
- Commit messages say what changed for the reader, not "fix stuff".

---

## PROJECT RULES (never break; each has a test in `tests/project-rules.test.ts` or the safety tests)

CONTENT INTEGRITY
- Every story, claim, and quote carries a citation to a real passage (book chapter:verse, or work plus section). Never invent verses, quotes, saints, or history. If you cannot source it, leave it out.
- Use only public-domain or openly licensed texts (for example KJV, WEB, ASV, and public-domain patristic and hagiographic collections). Record the license of every source in SOURCES.md. No copyrighted translations.
- Where traditions differ (Catholic, Orthodox, Protestant, others), show the difference and label the tradition. Do not argue for one denomination.
- Respectful, gentle tone. The app is not pastoral counseling or therapy; where someone may be in distress, it points them to a pastor or local help.
- Never tune retrieval or prompts on the holdout question set. Grow the golden set with scripture questions and keep the holdout untouched.

Carried over from the project's earlier rules, still binding:
- **Never answer from model knowledge.** A question the passages do not cover gets
  the refusal phrase in `src/lib/answer.ts` (`NOT_COVERED_PHRASE`), not a plausible answer.
- **Attribution is part of correctness.** Scripture, a desert elder's saying, one
  Father's opinion and a canon of a council carry different authority. The answer
  labels Scripture vs Church tradition and never presents one as the other.
- **Fetch politely.** CCEL, the Internet Archive, eBible and Gutenberg are
  donation-funded libraries. The fetchers are serialised and delayed on purpose; do
  not parallelise them.

## MERGE POLICY
- Never push directly to main. Always branch, PR, then merge.
- Wait for every CI check to pass.
- All checks pass: squash-merge the PR yourself, then tag the release (v<YYYY-MM-DD>-<n>) so Alpha can roll back.
- A check fails: fix it on the same branch (max 2 attempts). Still failing: do NOT merge. Leave the PR open and report why.
- If branch protection blocks a merge, do not bypass it. Report it.
- Never force-push, rewrite history, or bypass failed checks.
- Split risky or large changes into smaller PRs.

## DEPLOY AND DATABASE POLICY
- Merging to main may auto-deploy. Treat every merge as a release.
- Never change production environment variables, secrets, or hosting settings.
- Database changes need a versioned migration file plus a test. You may apply additive, backward-compatible migrations (new table, new nullable column, new index). Anything destructive (drop, rename, type change, data deletion) goes to NEEDS_APPROVAL.md and waits for Alpha.
- Never delete or overwrite user data.

## MODEL POLICY
- Always use the newest Opus-class model, or any higher tier, that is available to you. Prefer model aliases (such as "opus") over pinned version IDs so you follow the latest one automatically.
- At the start of every run, check Anthropic's official models documentation (https://platform.claude.com/docs/en/about-claude/models/overview) for a newer Opus or higher model. If one exists and you can switch to it (alias, settings, or the scheduled task's model setting), switch and note it in DAILY_LOG.md.
- If you cannot switch yourself, put "ACTION FOR ALPHA: switch the model to <name>" at the top of the report and in NEEDS_APPROVAL.md.
- Switching models must never involve buying, upgrading, or changing a plan.
- As of 2026-10-14 the docs list Claude Fable 5.1 (`claude-fable-5-1`) above Claude Opus 5.5 (`claude-opus-5-5`).

## NO PURCHASES POLICY
- Never buy, subscribe to, or upgrade anything. Never enter payment details.
- Do not register domains, or pay for API keys, SDKs, cloud services, app-store fees, or libraries. Use free and open-source tools only.
- Do not enable any service that can create a bill (paid API tiers, extra cloud resources, paid CI minutes beyond the free tier).
- If a feature would need money or a paid account, do not do it. Write it in NEEDS_APPROVAL.md with the cost and the alternatives, and move on.
- Anthropic API calls cost money and Voyage's free tier is rate-limited. Unattended runs and CI must not call paid APIs. Use mocks, cached fixtures, or the Gemini free tier, with backoff to respect rate limits. Never run the full eval harness against a paid API.
- The Gemini free tier is shared with the live site (same key), and allows only about
  20 requests a day per model. Anything that spends it (evals, judges) competes with
  real readers, so keep it rare and small.

## SAFETY RULES
- No secrets, API keys, or keystores in the repo. Use the platform's secret storage.
- Do not add dependencies with unclear licenses or known vulnerabilities.
- Do not remove existing features without a ROADMAP entry that explains why.
- If a build or test fails and you cannot fix it, say so plainly. Never hide failures or fake results.
- If something is ambiguous and risky, do the safe version and log the question in NEEDS_APPROVAL.md instead of guessing.

---

## THE DAILY LOOP (every run)
1. Read CLAUDE.md, ROADMAP.md, DAILY_LOG.md and NEEDS_APPROVAL.md. Check CI on main. If main is broken, fixing it is the first task.
2. MODEL CHECK (see MODEL POLICY).
3. Pick the top ROADMAP item. Plan, implement on a branch, add tests, open a PR, follow the MERGE POLICY, log it.
4. Repeat for the next item until the PER-RUN LIMIT.
5. REPLAN: when ROADMAP.md has fewer than 5 open items, or is empty, do a fresh audit and write a new roadmap:
   - Re-read the code: bugs, crashes, bad error handling, dead code.
   - Security review (auth, input validation, storage, network, dependencies with known vulnerabilities).
   - Performance, UX, accessibility, and localization gaps.
   - Test coverage gaps and tech debt.
   - New features that add the most value for the real users of this project, ordered by value and effort.
   Write the new items into ROADMAP.md with priority and effort, then continue. Never end a run with "nothing left to do".
6. Update DAILY_LOG.md, then send the REPORT.

## PER-RUN LIMIT
Up to 2 roadmap items per run, or stop earlier if blocked, out of time, or CI keeps failing. Small, safe, tested changes.

## REPORT (after every run, as the notification and in DAILY_LOG.md)
| Field | Content |
|---|---|
| Done | Items completed, with PR links |
| Merged | Yes/No per PR, and release tag |
| Failed or blocked | What and why |
| Roadmap | Items left, and whether a replan happened |
| Model | Model used; any "ACTION FOR ALPHA" |
| Needs approval | Anything in NEEDS_APPROVAL.md |
| Next | What the next run will do |

## Practical notes for runs
- `gh` is the way to work with GitHub (PRs, checks, merges, tags). Pushes that touch
  `.github/workflows/` need a token with `workflow` scope.
- Releases: `git tag -a v<YYYY-MM-DD>-<n> <merge-sha> -m "<PR title>" && git push origin <tag>`.
  `n` counts up from 1 within the day; check `git tag -l "v$(date +%F)-*"` first.
- Every workflow that spends API quota must skip cleanly when its secret is absent.
- Never run `scripts/ingest-scripture.ts` or the eval runner with real keys from an
  unattended run. The data pipelines run on GitHub Actions, triggered by their own path
  filters.
