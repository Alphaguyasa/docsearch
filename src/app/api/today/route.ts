/**
 * GET /api/today — the id of today's person, as the Telegram channel posted it
 * (see todaysFigure). The home page asks, so it shows the same person as the
 * channel and the bot. Cached briefly at the edge.
 */
import { todaysFigure } from "@/lib/channel";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const f = await todaysFigure().catch(() => null);
  return Response.json(
    { id: f?.id ?? null },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
