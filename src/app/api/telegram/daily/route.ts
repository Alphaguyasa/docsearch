/**
 * GET /api/telegram/daily — posts the story of the day to the Telegram
 * channel. Called by the Vercel cron in vercel.json each morning.
 *
 * Safe to call by anyone, any number of times: the Addis Ababa day is claimed
 * in the database before posting (claim_channel_day), so the channel gets at
 * most one post a day. If the post fails the claim is released for a retry.
 */
import credits from "../../../../../public/art/credits.json";
import { db } from "@/lib/db";
import { addisDay, personOfTheDay } from "@/lib/scripture/today";
import { CHANNEL, SITE_URL, channelCaption, tg } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ ok: false, error: "bot not configured" }, { status: 503 });

  const now = new Date();
  const day = addisDay(now);
  const f = personOfTheDay(now);
  const { data: claimed, error } = await db.rpc("claim_channel_day", { p_day: day, p_figure: f.id });
  if (error) return Response.json({ ok: false, error: "could not claim the day" }, { status: 502 });
  if (!claimed) return Response.json({ ok: true, posted: false, reason: "already posted today", figure: f.id });

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
    const message = err instanceof Error ? err.message : String(err);
    console.error("channel post failed:", message);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
  return Response.json({ ok: true, posted: true, figure: f.id, day });
}
