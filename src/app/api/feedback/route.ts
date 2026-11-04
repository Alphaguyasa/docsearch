/**
 * POST /api/feedback — "Was this helpful?". Stores yes/no with the people and
 * tags the story used; never the question, never anything about the person.
 *
 * Body: { helpful: boolean, figures: string[], tags: string[], lang: "en"|"am" }
 * 204 on success, 400 on a bad body, 413 on an oversized one, 429 when the
 * hourly cap is reached.
 */
import { feedbackSchema, recordFeedback } from "@/lib/feedback";
import { BODY_LIMITS, readJsonCapped } from "@/lib/read-body";

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonCapped(request, BODY_LIMITS.feedback);
  if (!body.ok && body.reason === "too_large") {
    return Response.json({ error: "Feedback too large." }, { status: 413 });
  }
  const parsed = feedbackSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return Response.json({ error: "Invalid feedback." }, { status: 400 });
  const ok = await recordFeedback({ ...parsed.data, channel: "web" });
  return ok ? new Response(null, { status: 204 }) : Response.json({ error: "Try again later." }, { status: 429 });
}
