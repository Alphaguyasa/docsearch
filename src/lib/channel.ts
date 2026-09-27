/**
 * The daily post to the Telegram channel, shared by the cron route and the
 * self-healing backup. The Addis Ababa day is claimed in the database before
 * posting (claim_channel_day), so the channel gets at most one post a day
 * however many callers race; a failed post releases the day for a retry.
 */
import credits from "../../public/art/credits.json";
import { db } from "./db";
import { FIGURES, type Figure } from "./scripture/figures";
import { addisDay, addisHour, personOfTheDay } from "./scripture/today";
import { JOURNEY } from "../app/journey";
import { CHANNEL, SITE_URL, TEXT, channelCaption, journeyCaption, tg, todayCaption, type BotLang } from "./telegram";

function hasPainting(id: string): boolean {
  return (credits as { credits: { id: string }[] }).credits.some((a) => a.id === id);
}

export type DailyResult =
  | { ok: true; posted: true; figure: string; day: number }
  | { ok: true; posted: false; reason: string; figure: string }
  | { ok: false; error: string };

export async function postDailyStory(now = new Date()): Promise<DailyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "bot not configured" };
  const day = addisDay(now);
  const f = personOfTheDay(now);
  const { data: claimed, error } = await db.rpc("claim_channel_day", { p_day: day, p_figure: f.id });
  if (error) return { ok: false, error: "could not claim the day" };
  if (!claimed) return { ok: true, posted: false, reason: "already posted today", figure: f.id };

  const caption = channelCaption(f);
  const hasArt = hasPainting(f.id);
  try {
    if (hasArt) {
      await tg(token, "sendPhoto", {
        chat_id: CHANNEL,
        photo: `${SITE_URL}/art/og/${f.id}.jpg`,
        caption,
        parse_mode: "HTML",
      });
    } else {
      await tg(token, "sendMessage", {
        chat_id: CHANNEL,
        text: caption,
        parse_mode: "HTML",
        link_preview_options: { url: `${SITE_URL}/people/${f.id}` },
      });
    }
  } catch (err) {
    await db.rpc("release_channel_day", { p_day: day });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, posted: true, figure: f.id, day };
}

/**
 * Backup for the morning cron: from 07:00 in Addis Ababa, any bot message or
 * person-page view makes sure today's post went out. Cheap when it has (one
 * claim that returns false), and never posts twice.
 */
export async function ensureDailyStory(now = new Date()): Promise<void> {
  if (addisHour(now) < 7) return;
  const r = await postDailyStory(now);
  if (!r.ok) console.error("daily channel backup:", r.error);
  // Anyone the morning run didn't reach; a cheap empty claim when everyone has it.
  await sendToSubscribers(now, 20_000).catch((err) => console.error("daily subscribers backup:", err));
}

/**
 * /daily: start (or restart, in a new language) the morning story in this
 * chat. /journey: the same, but each morning brings the next of the 40 days;
 * `journeyDay` is the day tomorrow's message will carry.
 */
export async function subscribe(chatId: number, lang: BotLang, now = new Date(), journeyDay: number | null = null): Promise<void> {
  // Today's message is sent at once by the caller, so start counting from today.
  const { error } = await db
    .from("bot_subscribers")
    .upsert({ chat_id: chatId, lang, last_day: addisDay(now), journey_day: journeyDay }, { onConflict: "chat_id" });
  if (error) throw new Error(error.message);
}

/** /stop, or the person blocked the bot: forget the chat. */
export async function unsubscribe(chatId: number): Promise<void> {
  const { error } = await db.from("bot_subscribers").delete().eq("chat_id", chatId);
  if (error) throw new Error(error.message);
}

/**
 * Today's person as the channel posted it, so the site, /today and the
 * morning messages all agree even if people were added since the morning
 * (which shifts the computed rotation). Falls back to the rotation.
 */
export async function todaysFigure(now = new Date()): Promise<Figure> {
  const { data } = await db.from("channel_posts").select("figure").eq("day", addisDay(now)).maybeSingle();
  return FIGURES.find((f) => f.id === data?.figure) ?? personOfTheDay(now);
}

/** The story of the day in one private chat, with the painting when there is one. */
export async function sendToday(
  token: string,
  chatId: number,
  lang: BotLang,
  now = new Date(),
  f?: Figure,
): Promise<void> {
  f ??= await todaysFigure(now);
  await sendCard(token, chatId, f, todayCaption(f, lang));
}

/** Day `day` of the 40-day journey in one private chat. */
export async function sendJourneyDay(token: string, chatId: number, lang: BotLang, day: number): Promise<void> {
  const f = FIGURES.find((x) => x.id === JOURNEY[day - 1]);
  if (f) await sendCard(token, chatId, f, journeyCaption(f, lang, day));
}

/** A person's card: the painting with the caption, or the caption alone. */
async function sendCard(token: string, chatId: number, f: Figure, caption: string): Promise<void> {
  const text = () =>
    tg(token, "sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  if (!hasPainting(f.id)) return void (await text());
  await tg(token, "sendPhoto", {
    chat_id: chatId,
    photo: `${SITE_URL}/art/og/${f.id}.jpg`,
    caption,
    parse_mode: "HTML",
  }).catch((err) => (isGone(err) ? Promise.reject(err) : text()));
}

/** Telegram's answer when a person blocked the bot or deleted their account. */
function isGone(err: unknown): boolean {
  return err instanceof Error && /blocked|deactivated|chat not found|403/i.test(err.message);
}

/**
 * Sends today's story to everyone who asked for it with /daily, in batches
 * claimed from the database (so parallel callers never double-send), at about
 * 20 messages a second — under Telegram's limit. Stops before `budgetMs` so
 * the function never times out; whoever calls next picks up the rest.
 */
export async function sendToSubscribers(now = new Date(), budgetMs = 40_000): Promise<{ sent: number; gone: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const out = { sent: 0, gone: 0 };
  if (!token) return out;
  const day = addisDay(now);
  const f = await todaysFigure(now);
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    const { data, error } = await db.rpc("claim_daily_subscribers", { p_day: day, p_limit: 50 });
    if (error || !data?.length) break;
    for (const s of data as { chat_id: number; lang: BotLang; journey_day: number | null }[]) {
      const lang = s.lang === "am" ? "am" : "en";
      try {
        if (s.journey_day) {
          await sendJourneyDay(token, s.chat_id, lang, s.journey_day);
          const next = s.journey_day < JOURNEY.length ? s.journey_day + 1 : null;
          if (!next) await tg(token, "sendMessage", { chat_id: s.chat_id, text: TEXT[lang].journeyDone });
          await db.from("bot_subscribers").update({ journey_day: next }).eq("chat_id", s.chat_id);
        } else {
          await sendToday(token, s.chat_id, lang, now, f);
        }
        out.sent++;
      } catch (err) {
        if (isGone(err)) {
          out.gone++;
          await unsubscribe(s.chat_id).catch(() => {});
        } else console.error("daily subscriber:", err);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return out;
}
