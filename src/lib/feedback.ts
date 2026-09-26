/**
 * Feedback on stories, shared by the website and the Telegram bot. Only known
 * person ids and vocabulary tags are accepted, so nothing free-form a person
 * wrote can ever be stored through this path.
 */
import { z } from "zod";

import { FIGURES } from "./scripture/figures";
import { VOCABULARY } from "./scripture/struggle";

const figureIds = new Set(FIGURES.map((f) => f.id));

export const feedbackSchema = z.object({
  helpful: z.boolean(),
  figures: z
    .array(z.string().refine((id) => figureIds.has(id)))
    .max(5)
    .default([]),
  tags: z
    .array(z.string().refine((t) => VOCABULARY.includes(t)))
    .max(5)
    .default([]),
  lang: z.enum(["en", "am"]),
});

export type Feedback = z.infer<typeof feedbackSchema> & { channel: "web" | "telegram" };

/** Store one tap. False when the hourly cap is hit or the database is unreachable. */
export async function recordFeedback(f: Feedback): Promise<boolean> {
  // Loaded here, not at the top, so the schema can be used (and tested) without database settings.
  const { db } = await import("./db");
  const { data, error } = await db.rpc("add_feedback", {
    p_helpful: f.helpful,
    p_figures: f.figures,
    p_tags: f.tags,
    p_lang: f.lang,
    p_channel: f.channel,
  });
  if (error) {
    console.warn(`feedback not stored: ${error.message}`);
    return false;
  }
  return data === true;
}
