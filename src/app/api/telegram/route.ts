/**
 * POST /api/telegram — the Telegram bot's webhook.
 *
 * Telegram sends every message here. We answer 200 at once (so Telegram never
 * retries) and do the work after the response: the text is sent to
 * /api/search exactly as the website sends it — safety gate, rate limit and
 * example cache included — and the story comes back to the chat. Only private
 * chats are answered; nothing is stored.
 */
import { after } from "next/server";

import resources from "../../../../data/crisis-resources.json";
import { feedbackSchema, recordFeedback } from "@/lib/feedback";
import { peopleFor } from "@/lib/scripture/people-for";
import { crisisResponse, phraseCheck } from "@/lib/scripture/safety";
import { parseSearchStream } from "@/lib/search-stream";
import {
  SITE_URL,
  TEXT,
  collectStream,
  crisisMessage,
  detectLang,
  fallbackMessage,
  feedbackKeyboard,
  parseFeedbackData,
  storyMessages,
  tg,
  webhookSecret,
  type BotLang,
} from "@/lib/telegram";

export const maxDuration = 60;

interface Update {
  message?: {
    chat: { id: number; type: string };
    from?: { first_name?: string; language_code?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

export async function POST(request: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response("Bot not configured", { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret(token)) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = (await request.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (msg && msg.chat.type === "private") {
    after(() => handle(token, msg).catch((err) => console.error("telegram:", err)));
  }
  const cb = update.callback_query;
  if (cb) after(() => handleFeedback(token, cb).catch((err) => console.error("telegram feedback:", err)));
  return new Response("ok");
}

async function handle(token: string, msg: NonNullable<Update["message"]>): Promise<void> {
  const chat_id = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const lang: BotLang = detectLang(text, msg.from?.language_code);
  const t = TEXT[lang];
  const send = (html: string) =>
    tg(token, "sendMessage", { chat_id, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });

  if (!text) return void (await send(t.textOnly));
  if (text.startsWith("/start")) return void (await send(t.welcome(msg.from?.first_name)));
  if (text.startsWith("/help")) {
    return void (await send(
      crisisMessage({ message: t.helpTitle, steps: resources.always, resources: resources.global }, lang),
    ));
  }
  if (text.length > 1000) return void (await send(t.tooLong));

  // No story could be written: still send the people who carried this, or — if the
  // server never answered, so its safety gate never ran — check for crisis first.
  const fallback = async (busy: boolean, people = peopleFor(text), checked = false) => {
    const kind = checked ? undefined : phraseCheck(text);
    if (kind) return void (await send(crisisMessage(crisisResponse(kind), lang)));
    const msg = fallbackMessage(people, lang, busy);
    await send(msg ?? (busy ? t.busy : t.failed));
  };

  await tg(token, "sendChatAction", { chat_id, action: "typing" }).catch(() => {});
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
  } catch {
    return fallback(false);
  }
  // A 429 comes after the server's safety gate, so the message was already checked.
  if (res.status === 429) return fallback(true, peopleFor(text), true);
  if (!res.ok || !res.body) return fallback(false);

  const result = await collectStream(parseSearchStream(res.body)).catch(() => null);
  if (!result) return fallback(false);
  if (result.crisis) return void (await send(crisisMessage(result.crisis, lang)));
  if (result.error || !result.answer.trim()) {
    return fallback(false, result.figures.length ? result.figures : peopleFor(text), true);
  }
  const parts = storyMessages(result, lang);
  for (const [i, part] of parts.entries()) {
    if (i < parts.length - 1) await send(part);
    else
      await tg(token, "sendMessage", {
        chat_id,
        text: part,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: feedbackKeyboard(result, result.tags, lang),
      });
  }
}

/** A tap on "This helped" / "Not really": store it, thank them, remove the buttons. */
async function handleFeedback(token: string, cb: NonNullable<Update["callback_query"]>): Promise<void> {
  const fb = parseFeedbackData(cb.data ?? "");
  if (!fb) return void (await tg(token, "answerCallbackQuery", { callback_query_id: cb.id }));
  const parsed = feedbackSchema.safeParse(fb);
  if (parsed.success) await recordFeedback({ ...parsed.data, channel: "telegram" });
  await tg(token, "answerCallbackQuery", { callback_query_id: cb.id, text: TEXT[fb.lang].thanks });
  if (cb.message) {
    await tg(token, "editMessageReplyMarkup", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => {});
  }
}
