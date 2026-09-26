/**
 * The daily post to the Telegram channel, shared by the cron route and the
 * self-healing backup. The Addis Ababa day is claimed in the database before
 * posting (claim_channel_day), so the channel gets at most one post a day
 * however many callers race; a failed post releases the day for a retry.
 */
import credits from "../../public/art/credits.json";
import { db } from "./db";
import { addisDay, addisHour, personOfTheDay } from "./scripture/today";
import { CHANNEL, SITE_URL, channelCaption, tg } from "./telegram";

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
  const hasArt = (credits as { credits: { id: string }[] }).credits.some((a) => a.id === f.id);
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
}
