# Not Alone — how it works and how to run it

Someone writes what they are struggling with. The app answers with the true,
cited story of a holy person who fell the same way and was restored — from
Scripture (World English Bible with deuterocanon) and the Church Fathers
(Augustine's *Confessions*, the *Lausiac History*, Budge's *Paradise of the
Holy Fathers* and the Ethiopian Synaxarium), plus Thomas à Kempis's *Imitation
of Christ* (Catholic) and Bunyan's *Grace Abounding* (Protestant). Those two
texts number their own paragraphs, so their refs cite them: "Grace Abounding
§45–47", "The Imitation of Christ, Book I, Chapter XIII §2–4".

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

## Running on free tiers

The app is set up to work without paying for any API:

- **Gemini** (free tier: about 20 requests a day per model). Answers use
  `gemini-flash-latest`, then `gemini-flash-lite-latest`, then `gemma-3-27b-it`
  when a model's daily quota is used up or it is overloaded (`src/lib/llm.ts`).
  Safety and struggle-tag classification run on Gemma, whose free quota is the
  largest, so Flash's quota goes to writing answers.
- **Example questions** on the home page are answered once and served from
  memory for six hours (`src/lib/example-cache.ts`). Only those fixed sentences
  are kept; nothing a reader writes is ever stored.
- **Voyage** (free tier) limits the whole site to about 3 searches a minute.

Enabling billing on the Gemini key (paid tier 1) removes the daily cap; a search
costs a small fraction of a cent.

## Before public launch

- A priest or pastor reviews `data/canon.json` items marked NEEDS REVIEW and a sample of answers.
- Add a verified Ethiopian counselling / suicide-prevention line to `data/crisis-resources.json` when one exists.
- ✅ The Amharic line on `/help` ("አደጋ ላይ ከሆኑ፣ አሁኑኑ ሰው ያግኙ።") was checked by the maintainer (Sept 2026).
- Upgrade Voyage (or keep the 3/min limit) — the free tier cannot serve real traffic.
- Rotate the Supabase service_role key and revoke the GitHub token used during the build.

## Telegram bot

The bot is the website in a chat. `POST /api/telegram` is its webhook: each
private message is sent to `/api/search` as the site sends it (safety gate,
rate limit and example cache included) and the story comes back with its
references. `/start` greets, `/help` gives the crisis numbers. Nothing is stored.

- The token lives only in Vercel as `TELEGRAM_BOT_TOKEN` (sensitive, production).
- To register the webhook and the English/Amharic command menu (after changing
  the token or the site URL), print the setup link and open it once:
  `TELEGRAM_BOT_TOKEN=… npx tsx scripts/telegram-setup-url.ts`. The link's key and
  the webhook secret are both derived from the token; without the key the route
  is a 404.

## Feedback

Under each finished story, on the site and in the bot: "Did this story help
you?" One tap stores a row in `feedback` through `add_feedback` (capped at 500
an hour): yes/no, the people and tags the story used, the language and the
channel. Never the question, never anything about the person. Only known
person ids and vocabulary tags are accepted. See how each person's story is
landing in the `feedback_by_figure` view in the Supabase dashboard.

## Telegram channel

Each morning at 06:00 in Addis Ababa (03:00 UTC, `vercel.json` cron) the bot
posts the story of the day to https://t.me/you_r_repenter (override with
`TELEGRAM_CHANNEL`): the painting, the name and summary in Amharic and English,
and a link to the person's page. `/api/telegram/daily` claims the day in
`channel_posts` before posting, so extra calls never post twice; a failed post
releases the day so it can be retried. The bot must stay an admin of the channel.
As a backup in case the cron doesn't fire, from 07:00 Addis time any bot message
or person-page view checks (in the background) that today's post went out and
sends it if not — still at most once a day.

### Morning story in private (/daily)

`/daily` in the bot subscribes that chat: its number and language go into
`bot_subscribers` (nothing the person wrote), today's story is sent at once,
and the same morning run sends it every day after. `/stop` deletes the row, as
does Telegram reporting that the person blocked the bot. Sending claims
subscribers in batches with `claim_daily_subscribers`, which marks the day in
the same statement, so the cron and the 07:00 backup never double-send. The
cron also refreshes the bot's command menu each morning.

## Numbers page (/stats)

`/stats?key=<STATS_KEY>` shows the last 30 days: stories read (web and
Telegram, English and Amharic), crisis answers, "too busy" waits, which
struggles and people came up, "this helped" taps, morning subscribers and
channel posts. The search route bumps plain names in `daily_counts`
(`bump_counts`) after responding — never anything a person wrote. Without the
key, or if `STATS_KEY` is unset, the page is a 404; it is kept out of robots.txt
and the sitemap.

### Sharing a story in any chat (inline mode)

Typing `@U_not_the_only_bot anger` (or a name, in English or Amharic) in any
Telegram chat offers story cards — the painting, the name and summary, a link
to the page and to the bot. `inlinePeople` matches names first, then
struggles; an empty query starts with the story of the day. Needs inline mode
switched on once in @BotFather (`/setinline`), and `inline_query` in the
webhook's allowed updates (`registerWebhook`, refreshed by the morning cron).

### The 40-day journey in the bot (/journey)

`/journey` sends day 1 at once and stores `journey_day = 2` on the chat's
`bot_subscribers` row; each morning's run sends that day's person instead of
the story of the day and moves the day on, and after day 40 says so and falls
back to the story of the day. `/daily` switches back to the story of the day;
`/stop` deletes the row. The order is `JOURNEY` in src/app/journey.ts, the same
as the website's /journey page.

## The Amharic Bible (1962)

`data/bible-am.json` holds the 1962 Amharic Bible (Haile Selassie
translation), built by `scripts/build-amharic-bible.py`: the New Testament
from the e-text published with the Bible Society of Ethiopia's permission for
non-commercial use (its verse numbers match the English), the Old Testament
from github.com/magna25/amharic-bible-json. `lib/scripture/amharic.ts` looks
passages up by our English references and returns null — so the page stays
English — for Jonah 1:17–2 (numbered as in Hebrew), the Prayer of Manasseh
(not in this Bible) and the ~50 Old Testament verses that still carry
transliteration leftovers. Amharic readers see it on person pages (Amharic
first, English below), in the prayers and in "Coming back to God"; every
Amharic line there is checked word for word by tests/amharic-bible.test.ts.
The copyright statement is on /about and under the verses. Non-commercial use
only; commercial use needs the Bible Society of Ethiopia's written permission.
