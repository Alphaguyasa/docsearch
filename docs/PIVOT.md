# DocSearch → Scripture pivot (working name: *Not Alone*)

Purpose: someone describes a struggle ("I keep lying", "I cheated", "I feel too far gone")
and gets the true, cited story of a holy person who fell the same way — and how they were restored.
Every answer follows one arc: **the fall → the honesty → the restoration**, cited to exact verses/sources.

## What stays (verified in repo @ 018bd0c)

| Keep as-is | Why |
|---|---|
| `src/lib/embed.ts` (voyage-4, 1024-d, token-packed batches, 429 backoff) | Already tuned for the 3 RPM / 10K TPM free tier |
| `src/lib/ratelimit.ts`, `transient.ts`, `paginate.ts` | Generic |
| `src/lib/llm.ts` provider interface (`GENERATION_PROVIDER`) | Anthropic ↔ Gemini swap still needed |
| `src/lib/retrieve.ts` hybrid fusion | Extend with filters, don't rewrite |
| `eval/**` harness, judges, gates, `.github/workflows/eval.yml` | Reuse; only the golden set and corpus loader change |
| `sanitizeText` + NFC in `chunk.ts` | Needed for Ge'ez/Greek names in sources |

## What changes

| Area | From | To |
|---|---|---|
| Corpus | 90 arXiv PDFs (`corpus/manifest.json`) | Public-domain Christian texts, `corpus/scripture/manifest.json` |
| Input format | PDF via `unpdf` | Plain text / USFM / HTML → normalized JSON |
| Citation unit | `page_number` | `ref` e.g. `2 Samuel 11:1-27`, `Confessions 8.12` |
| Chunking | 800-token windows | Section/pericope-bounded; never splits a verse |
| Filters | none | `traditions` on every chunk |
| Structure | none | Curated `figures` layer (seed: `data/figures.seed.json`) |
| Prompt | neutral cited QA | Pastoral, fall→restoration arc, never declares forgiveness |
| Safety | none | Crisis-resource path before any story |

## Decisions (locked)

1. **Old DocSearch is preserved.** Tag `v1-docsearch` before any change. Work on branch `pivot/scripture`.
2. **New Supabase project.** Corpora must never share a `chunks` table (mixed corpora = meaningless retrieval). Secrets: `SCRIPTURE_SUPABASE_URL`, `SCRIPTURE_SUPABASE_SERVICE_ROLE_KEY`. Existing `SUPABASE_*` secrets stay untouched so the old demo and CI keep working.
3. **Tradition tags** (array per chunk): `protestant`, `catholic`, `orthodox`, `ethiopian_orthodox`. Protocanonical Bible = all four. Deuterocanon = per-book (e.g. Prayer of Manasseh = orthodox + ethiopian_orthodox only). Church-father / saint texts = tagged by who venerates the figure; the UI labels them "Church tradition", never "Scripture".
4. **Public domain only.** Every manifest entry records `license`, `source_url`, `sha256`, `retrieved_at`. No modern copyrighted translations. Amharic Bible deferred until licensing is confirmed in writing.
5. **Resumable ingestion on GitHub Actions**, not on a laptop and not inside a Claude session. Chunk-level idempotency; a cron re-run continues where the last run stopped; a GitHub issue is opened on completion (this is the phone notification).

## Corpus v1 (Claude Code must verify each URL + license before committing)

| id | Text | Likely source | Traditions |
|---|---|---|---|
| `web` | World English Bible incl. deuterocanon | ebible.org (eng-web, USFM) | per book |
| `kjv` | King James Version | ebible.org (eng-kjv) | protestant |
| `confessions` | Augustine, *Confessions* (Pusey tr.) | Project Gutenberg | all |
| `lausiac` | Palladius, *Lausiac History* (Clarke 1918) — Moses the Ethiopian | archive.org / CCEL | all |
| `paradise` | Budge, *Paradise of the Holy Fathers* (1907) | archive.org | orthodox, ethiopian_orthodox, catholic |
| `synaxarium` | Budge, *Book of the Saints of the Ethiopian Church* (1928) | archive.org | ethiopian_orthodox |

Scope guard: do **not** ingest all 38 volumes of Schaff. Token budget for v1 ≈ 2–3M tokens → roughly 4–6 hours of embedding at 10K TPM. If Voyage limits are raised on the account, update `VOYAGE_RPM` / `VOYAGE_TPM` secrets; nothing else changes.

## Schema additions (new migration, new project)

```sql
alter table documents add column source_id text, add column license text,
  add column source_url text, add column kind text check (kind in ('scripture','tradition'));
alter table chunks add column ref text, add column book text,
  add column chapter_start int, add column verse_start int, add column verse_end int,
  add column traditions text[] not null default '{}';
create index on chunks using gin (traditions);

create table figures (
  id text primary key, name text not null, kind text not null,  -- 'scripture' | 'tradition'
  sins text[] not null, summary text not null, traditions text[] not null
);
create table figure_passages (
  figure_id text references figures(id) on delete cascade,
  role text check (role in ('fall','restoration','context')),
  ref text not null, source_id text not null, primary key (figure_id, ref)
);
-- match_chunks / keyword_chunks gain: filter_traditions text[] default null
--   where filter_traditions is null or c.traditions && filter_traditions
```

## Answer contract (replaces SYSTEM_PROMPT in `answer.ts`)

- Only from passages. Every claim cited `[n]`. Keep `NOT_COVERED_PHRASE` mechanics for evals.
- Structure: who they were → what they did (plainly, not softened) → how they faced it → how they were restored.
- Never say "you are forgiven" or speak for God. Point to the text, confession, and the user's own church/priest/pastor.
- Label tradition sources as tradition. Flag textual notes (e.g. John 7:53–8:11 is absent from the earliest manuscripts).
- **Safety first:** if the query signals self-harm, hopelessness about living, or abuse, return crisis guidance and a prompt to contact a trusted person *before* any story. Detected by a cheap classifier call + keyword list; tested in evals.

## Done means

- `select count(*) from chunks where embedding is null` = 0 on the new project
- `/` answers "I lied to protect myself" with Abraham/Jacob/Peter, verse-cited
- Tradition filter verifiably excludes deuterocanon for `protestant`
- New golden set ≥ 60 questions, holdout ≥ 15, CI gates green
