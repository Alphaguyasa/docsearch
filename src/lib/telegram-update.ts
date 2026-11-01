/**
 * The parts of a Telegram webhook update the bot reads, checked with zod.
 *
 * Telegram sends many update kinds (edited messages, channel posts, chat
 * member changes...) and the message shapes vary. Before this, the route cast
 * the JSON to a type and read `msg.chat.type`, which threw (a 500, and Telegram
 * retries) on a message without `chat`. Each part is parsed on its own and a
 * malformed one becomes undefined, so a bad message never drops a good button
 * press in the same update, and nothing here ever throws.
 */
import { z } from "zod";

const message = z.object({
  chat: z.object({ id: z.number().int(), type: z.string() }),
  from: z.object({ first_name: z.string().optional(), language_code: z.string().optional() }).optional(),
  text: z.string().optional(),
});

const inlineQuery = z.object({
  id: z.string(),
  query: z.string(),
  from: z.object({ language_code: z.string().optional() }).optional(),
});

const callbackQuery = z.object({
  id: z.string(),
  data: z.string().optional(),
  message: z.object({ chat: z.object({ id: z.number().int() }), message_id: z.number().int() }).optional(),
});

const updateSchema = z.object({
  message: message.optional().catch(undefined),
  inline_query: inlineQuery.optional().catch(undefined),
  callback_query: callbackQuery.optional().catch(undefined),
});

export type Update = z.infer<typeof updateSchema>;

/** Never throws: anything that is not an object, or a part that does not fit, is left out. */
export function parseUpdate(json: unknown): Update {
  const r = updateSchema.safeParse(json);
  return r.success ? r.data : {};
}
