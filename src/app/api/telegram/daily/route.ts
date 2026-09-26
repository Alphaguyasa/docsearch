/**
 * GET /api/telegram/daily — posts the story of the day to the Telegram
 * channel. Called by the Vercel cron in vercel.json each morning; safe to call
 * any number of times (see src/lib/channel.ts).
 */
import { postDailyStory } from "@/lib/channel";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const r = await postDailyStory();
  return Response.json(r, { status: r.ok ? 200 : r.error === "bot not configured" ? 503 : 502 });
}
