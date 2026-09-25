# Pivot sessions — paste one per Claude Code session

Every session: start on branch `pivot/scripture`, read `docs/PIVOT.md` first, open a PR at the end.
Every prompt below tells Claude Code which work to fan out to **parallel subagents**; the main
agent integrates, runs tests, and commits. If a session hits a usage limit, re-paste the same
prompt after the reset — each prompt starts with "resume from the last commit".

---

## Session 0 — You, on your phone (~10 min, no Claude)

1. GitHub → Releases/Tags → create tag `v1-docsearch` on `main`.
2. Upload this pack via GitHub web: `docs/PIVOT.md`, `docs/SESSIONS.md`, `data/figures.seed.json`,
   `supabase/migrations/20260925160000_scripture_base.sql` → commit to new branch `pivot/scripture`.
3. ✅ DONE by Claude: Supabase project `not-alone-scripture` (ref `krifziflchwxjpunlpvo`, eu-central-1)
   created; base + scripture schema, eval tables, and all 22 figures / 55 passages already loaded.
4. Supabase dashboard → project → Settings → API: copy the URL and service_role key.
   Repo → Settings → Secrets → add `SCRIPTURE_SUPABASE_URL`, `SCRIPTURE_SUPABASE_SERVICE_ROLE_KEY`.
5. Open Claude Code from the Claude app, pick this repo, branch `pivot/scripture`.

---

## Session 1 — Schema + source manifest + fetchers

```
Resume from the last commit on pivot/scripture. Read docs/PIVOT.md fully first.

Goal: schema for the new Supabase project, and a reproducible scripture corpus manifest.

Fan out in parallel with subagents:
- Subagent A: the schema is ALREADY APPLIED to the new project from
  supabase/migrations/20260925160000_scripture_base.sql. Do not re-create it. Update
  src/lib/retrieve.ts types for the new returned columns (ref, traditions) and pass
  filter_traditions through as an optional option; existing tests must pass.
- Subagents B1..B6: one per corpus row in PIVOT.md. Each one: find the real public-domain
  source, VERIFY license from the source page, pick the most structured format (USFM > XML
  > plain text > HTML), and return {id, title, source_url, license, format, notes}.
  If a source cannot be verified as public domain, return status "blocked" — do not guess.
- Subagent C: write the tradition map for WEB books: every book id -> traditions[] per
  decision 3. Output data/canon.json. Cite the reasoning for each deuterocanonical book
  in a comment field.

Then (main agent): write scripts/fetch-scripture.ts that downloads each non-blocked source
into corpus/scripture/raw/ (gitignored), records sha256 + bytes + retrieved_at into
corpus/scripture/manifest.json (committed), and is idempotent on sha256.
Tests for canon.json shape and manifest validation. Report blocked sources in the PR body.
```

---

## Session 2 — Parsers + scripture-aware chunking

```
Resume from the last commit on pivot/scripture. Read docs/PIVOT.md.

Goal: every raw source -> normalized JSON -> chunks with refs. No network, no embeddings.

Normalized unit (src/lib/scripture/types.ts):
  { sourceId, book, chapter, verse | null, section | null, text, ref }

Fan out in parallel with subagents, one per format actually present in the manifest
(USFM parser, Gutenberg plain-text parser, archive.org OCR-text parser, ...). Each subagent
owns its parser file + unit tests with real fixtures sliced from the raw files.
OCR sources: strip page headers/footers with the existing stripRepeatedLines logic, and
flag OCR confidence problems rather than silently passing them through.

Main agent: add chunkScripture() in src/lib/chunk.ts (keep sanitizeText, keep countTokens):
- Bible: chunk by section heading (\s in USFM) when present; otherwise by chapter,
  split at verse boundaries to stay <= 800 tokens. NEVER split inside a verse.
  ref = "Book C:V1-V2" (or "C1:V1-C2:V2" across chapters).
- Tradition texts: chunk by the text's own chapter/section; ref = "Confessions 8.12".
- Every chunk carries traditions[] from data/canon.json or the manifest.
Add `npm run scripture:dry` that prints chunk count, mean tokens, and total tokens per
source (this is the embedding-time estimate). Put that table in the PR body.
```

---

## Session 3 — Resumable ingestion on GitHub Actions

```
Resume from the last commit on pivot/scripture. Read docs/PIVOT.md decision 5.

Goal: ingestion that runs for hours on GitHub Actions with nobody watching.

Fan out in parallel with subagents:
- Subagent A: scripts/ingest-scripture.ts — reads normalized chunks, upserts documents by
  source_id, and inserts ONLY chunks whose (document_id, chunk_index) does not already have
  a non-null embedding. Reuse embedDocuments() unchanged. Commit progress to the DB after
  every batch so a killed run loses at most one batch. --dry-run makes zero network calls.
- Subagent B: .github/workflows/ingest-scripture.yml
    on: workflow_dispatch + schedule every 6 hours
    concurrency: group ingest-scripture, cancel-in-progress: false
    timeout-minutes: 350
    env maps SCRIPTURE_SUPABASE_URL -> SUPABASE_URL, SCRIPTURE_SUPABASE_SERVICE_ROLE_KEY ->
      SUPABASE_SERVICE_ROLE_KEY, plus VOYAGE_API_KEY and VOYAGE_RPM/TPM.
    Steps: fetch -> parse -> ingest. First step exits 0 early if the DB reports
      zero remaining chunks AND a "done" marker issue already exists.
    Final step: if remaining == 0, open a GitHub issue titled
      "Scripture ingestion complete — <chunk count> chunks" (skip if one exists).
      On failure, open/update an issue "Scripture ingestion failed" with the log tail.
- Subagent C: tests for the resume logic using a fake DB: run, kill mid-way, run again,
  assert no duplicate rows and no re-embedded chunks.

Main agent: integrate, run tests, merge-ready PR. After merge I will trigger the
workflow manually once; the cron keeps it going until the completion issue appears.
```

---

## Session 4 — Figures layer + filtered retrieval

```
Resume from the last commit on pivot/scripture. Read docs/PIVOT.md.

Fan out in parallel with subagents:
- Subagent A: figures are ALREADY seeded in the DB. Write scripts/seed-figures.ts anyway
  (idempotent upsert from data/figures.seed.json) so the seed is reproducible. Validate every ref resolves to at least one chunk; fail loudly listing
  any that don't.
- Subagent B: src/lib/struggle.ts — map a user message to sin tags from the fixed
  vocabulary in figures.seed.json. First pass: keyword/synonym table (English + a small
  Amharic list). Second pass only if zero tags: one cheap LLM call via getLlm(),
  constrained to the vocabulary. Unit tests with 30 phrasings.
- Subagent C: extend retrieve.ts with filterTraditions and a figure-first mode:
  tags -> matching figures -> their fall/restoration passages ranked first, then hybrid
  results fill the rest. Keep existing modes working; existing tests must still pass.
```

---

## Session 5 — Answer prompt + safety

```
Resume from the last commit on pivot/scripture. Read the "Answer contract" in PIVOT.md.

Fan out in parallel with subagents:
- Subagent A: replace SYSTEM_PROMPT in src/lib/answer.ts per the contract. Keep
  NOT_COVERED_PHRASE and buildMessages() shape so the eval harness is untouched.
  Label each passage [n] (ref — Scripture|Church tradition).
- Subagent B: src/lib/safety.ts — keyword list + one classifier call; returns
  {crisis: boolean}. When true, the search route returns crisis guidance and a prompt
  to reach a trusted person BEFORE any story. Do not hard-code one country's hotline;
  make resources a config list. Tests for true/false cases including indirect phrasing.
- Subagent C: 20 hand-written answer snapshot tests (mocked LLM) that assert structure:
  cites present, no "you are forgiven", tradition label present when used.
```

---

## Session 6 — UI (mobile-first)

```
Resume from the last commit on pivot/scripture.

Fan out in parallel with subagents:
- Subagent A: home page — one input "What are you struggling with?", tradition picker
  (All / Protestant / Catholic / Orthodox / Ethiopian Orthodox), stored in localStorage.
- Subagent B: story view — reuse AnswerView/CitationPanel; citation panel shows the
  full verse range text and the source + license line.
- Subagent C: /figures browse page (list + per-figure page from the figures table).
Hide /documents upload routes behind an env flag. Keep /evals.
```

---

## Session 7 — New golden set + CI

```
Resume from the last commit on pivot/scripture. Read docs/EVAL_HARNESS.md.

Fan out in parallel with subagents:
- Subagent A: generate candidate questions from figures + chunks: struggle phrasings,
  "who in the Bible…", tradition-filter checks, and unanswerable ones. Target 75 dev /
  15 holdout. Write via the existing golden-set scripts.
- Subagent B: add eval checks: tradition leakage (protestant filter never returns
  deuterocanon), crisis routing, "never declares forgiveness".
- Subagent C: update eval.yml to read SCRIPTURE_* secrets and regenerate the CI baseline.
Then run the full eval, commit EVAL_RESULTS.md, and list the 10 worst answers in the PR
for my human review with a priest/pastor.
```
