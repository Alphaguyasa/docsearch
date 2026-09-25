# Not Alone — how it works and how to run it

Someone writes what they are struggling with. The app answers with the true,
cited story of a holy person who fell the same way and was restored — from
Scripture (World English Bible with deuterocanon) and the Church Fathers
(Augustine's *Confessions*, the *Lausiac History*, Budge's *Paradise of the
Holy Fathers* and the Ethiopian Synaxarium).

## Request path (`POST /api/search`)

| Step | Code | Notes |
|---|---|---|
| 1. Safety gate | `src/lib/scripture/safety.ts` | Self-harm, abuse victims, harm to others (English + Amharic). Returns a crisis card, never a story. Fails safe. |
| 2. Rate limit | `src/lib/scripture/rate-limit.ts` | Site-wide, in Postgres (`take_search_slot`). Default 3/min = Voyage free tier. Set `SEARCH_PER_MINUTE` after upgrading. |
| 3. Struggle → tags | `src/lib/scripture/struggle.ts` | Synonym table (Ethiopic homophones folded), LLM fallback limited to 26 tags. |
| 4. Figures first | `src/lib/scripture/retrieve-struggle.ts` | Fall/restoration passages of matching figures, then hybrid search fills the rest. Optional tradition filter. |
| 5. Answer | `src/lib/answer.ts` | 1–2 stories, every claim cited, never declares forgiveness, replies in the user's language. |

## Data pipeline (all on GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| `fetch-scripture.yml` | changes to sources/parsers | Downloads the public-domain corpus, commits `manifest.json`, `report.md`, `chunks-report.md` |
| `ingest-scripture.yml` | changes to ingest code, or its own progress push | Embeds into Supabase for up to 320 min per run, then chains the next run. Opens an issue on completion. |
| `scripture-eval.yml` | ingestion complete, or golden-set changes | Runs `eval/scripture-golden.json`, commits `eval/scripture-results.md`, comments on the PR |

## Environment (Vercel project)

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://krifziflchwxjpunlpvo.supabase.co` (project `not-alone-scripture`) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key of that project (sensitive) |
| `VOYAGE_API_KEY` | same key as the GitHub secret |
| `GENERATION_PROVIDER` | `gemini` (or `anthropic` + `ANTHROPIC_API_KEY`) |
| `GEMINI_API_KEY` | same key as the GitHub secret |
| `SEARCH_PER_MINUTE` | optional; default 3 |
| `SHOW_DOCUMENTS` | leave unset (upload routes stay off) |

## Local commands

```
npm run scripture:fetch     # download corpus
npm run scripture:dry       # parse + chunk, no network, writes chunks-report.md
npm run scripture:ingest    # embed (resumable)
npm run scripture:ask -- "I keep lying" --tradition protestant
npm run scripture:eval -- --generate 10
```

## Before public launch

- A priest or pastor reviews `data/canon.json` items marked NEEDS REVIEW and a sample of answers.
- Add a verified Ethiopian counselling / suicide-prevention line to `data/crisis-resources.json` when one exists.
- Upgrade Voyage (or keep the 3/min limit) — the free tier cannot serve real traffic.
- Rotate the Supabase service_role key and revoke the GitHub token used during the build.
