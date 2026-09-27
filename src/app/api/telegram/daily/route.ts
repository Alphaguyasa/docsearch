/**
 * GET /api/telegram/daily — posts the story of the day to the Telegram
 * channel and to everyone who asked the bot for it (/daily). Called by the Vercel cron in vercel.json each morning; safe to call
 * any number of times (see src/lib/channel.ts).
 */
import { postDailyStory, sendToSubscribers } from "@/lib/channel";
import { setCommands } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  const r = await postDailyStory();
  const subscribers = await sendToSubscribers().catch(() => ({ sent: 0, gone: 0 }));
  // Keep the bot's command menu in step with the code (cheap, once a day).
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) await setCommands(token).catch(() => {});
  return Response.json(
    { ...r, subscribers },
    { status: r.ok ? 200 : r.error === "bot not configured" ? 503 : 502 },
  );
}
