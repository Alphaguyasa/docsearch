/**
 * POST /api/feedback — "Was this helpful?". Stores yes/no with the people and
 * tags the story used; never the question, never anything about the person.
 *
 * Body: { helpful: boolean, figures: string[], tags: string[], lang: "en"|"am" }
 * 204 on success, 400 on a bad body, 429 when the hourly cap is reached.
 */
import { feedbackSchema, recordFeedback } from "@/lib/feedback";

export async function POST(request: Request): Promise<Response> {
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid feedback." }, { status: 400 });
  const ok = await recordFeedback({ ...parsed.data, channel: "web" });
  return ok ? new Response(null, { status: 204 }) : Response.json({ error: "Try again later." }, { status: 429 });
}
