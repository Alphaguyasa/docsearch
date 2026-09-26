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
import { parseSearchStream } from "@/lib/search-stream";
import {
  SITE_URL,
  TEXT,
  collectStream,
  crisisMessage,
  detectLang,
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

  await tg(token, "sendChatAction", { chat_id, action: "typing" }).catch(() => {});
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
  } catch {
    return void (await send(t.failed));
  }
  if (res.status === 429) return void (await send(t.busy));
  if (!res.ok || !res.body) return void (await send(t.failed));

  const result = await collectStream(parseSearchStream(res.body));
  if (result.crisis) return void (await send(crisisMessage(result.crisis, lang)));
  if (result.error || !result.answer.trim()) return void (await send(t.failed));
  for (const part of storyMessages(result, lang)) await send(part);
}
