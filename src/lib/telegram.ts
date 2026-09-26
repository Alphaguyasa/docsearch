/**
 * Not Alone on Telegram: turning a message into a search and the search's
 * stream into Telegram messages. The HTTP side lives in
 * src/app/api/telegram/route.ts; everything here is pure except `tg`.
 *
 * Nothing a person writes is stored: the text goes to /api/search exactly as
 * it would from the website, and the reply goes straight back to the chat.
 */
import { createHmac } from "node:crypto";

import { figureText } from "../app/i18n/dict";
import { FIGURES } from "./scripture/figures";
import type { CrisisPayload, FigureSummary, SearchStreamMessage, SourceChunk } from "./search-stream";

export type BotLang = "en" | "am";

/** Telegram's hard limit is 4096 characters; stay under it with room for tags. */
export const MAX_MESSAGE = 3900;

/** The public channel the bot posts the story of the day to. */
export const CHANNEL = process.env.TELEGRAM_CHANNEL || "@you_r_repenter";

export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://not-alone-seven.vercel.app";

/**
 * The secret Telegram echoes back on every webhook call, so the route can tell
 * real updates from forged ones. Derived from the bot token, so there is only
 * one secret to keep.
 */
export function webhookSecret(token: string): string {
  return createHmac("sha256", token).update("not-alone-telegram-webhook").digest("hex").slice(0, 48);
}

/** The key that unlocks /api/telegram/setup, derived from the token like the webhook secret. */
export function setupKey(token: string): string {
  return createHmac("sha256", token).update("not-alone-telegram-setup").digest("hex").slice(0, 32);
}

/** Amharic if the message is written in Ethiopic script, or the phone is set to Amharic. */
export function detectLang(text: string, languageCode?: string): BotLang {
  if (/[ሀ-፿]/.test(text)) return "am";
  if (/^[a-z]/i.test(text)) return "en";
  return languageCode?.startsWith("am") ? "am" : "en";
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The answer's light markdown (**bold**, *italic*) as Telegram HTML. */
export function markdownToHtml(md: string): string {
  return escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>");
}

export const TEXT = {
  en: {
    welcome: (name?: string) =>
      `${name ? `Peace be with you, ${escapeHtml(name)}.` : "Peace be with you."}\n\n` +
      "<b>You are not the only one.</b> Tell me what you are carrying — a sin, a struggle, something you are ashamed of — and I will tell you the true story of a holy person who fell the same way and was restored, from Scripture and the Church Fathers.\n\n" +
      "Nothing you write is saved.\n\n" +
      "Try: <i>I can't stop lying to my parents.</i>\n\n" +
      "/today — the story of the day (or every morning: t.me/you_r_repenter)\n" +
      "/help — if you are in danger, people to call now",
    searching: "Finding someone who carried this too…",
    notOnly: "You are not the only one",
    sources: "Where to read it",
    more: "Read it with the full passages",
    busy: "Many people are asking right now. Please send your message again in a minute.",
    failed: "Something went wrong while finding a story. Please try again in a moment.",
    fallback:
      "The story couldn't be written just now — but you are still not alone. These people carried this too; tap one to read their story straight from the text:",
    tooLong: "That is a lot to carry. Could you say it in fewer words (under 1000 characters)?",
    textOnly: "Please write what you are carrying in words, and I will find a story for you.",
    helpTitle: "If you are in danger, reach someone now.",
    call: "Call",
    today: "Story of the day",
    readStory: "Read their story",
    helped: "🙏 This helped",
    notReally: "Not really",
    thanks: "Thank you. It helps us find the right stories for others.",
  },
  am: {
    welcome: (name?: string) =>
      `${name ? `ሰላም ለእርስዎ ይሁን፣ ${escapeHtml(name)}።` : "ሰላም ለእርስዎ ይሁን።"}\n\n` +
      "<b>እርስዎ ብቻ አይደሉም።</b> የተሸከሙትን ይንገሩኝ — ኃጢአት፣ ትግል ወይም የሚያሳፍርዎትን ነገር — እኔም በተመሳሳይ መንገድ ወድቆ የተመለሰውን የቅዱስ ሰው እውነተኛ ታሪክ ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች እነግርዎታለሁ።\n\n" +
      "የሚጽፉት ምንም ነገር አይቀመጥም።\n\n" +
      "ለምሳሌ፦ <i>ለወላጆቼ መዋሸት ማቆም አልቻልኩም።</i>\n\n" +
      "/today — የዕለቱ ታሪክ (በየማለዳው፦ t.me/you_r_repenter)\n" +
      "/help — አደጋ ላይ ከሆኑ የሚደውሉላቸው",
    searching: "ይህን የተሸከመ ሰው እየፈለግሁ ነው…",
    notOnly: "እርስዎ ብቻ አይደሉም",
    sources: "የት እንደሚነበብ",
    more: "ከሙሉ ምንባቦቹ ጋር ያንብቡት",
    busy: "አሁን ብዙ ሰዎች እየጠየቁ ነው። እባክዎ ከአንድ ደቂቃ በኋላ መልእክትዎን እንደገና ይላኩ።",
    failed: "ታሪክ በመፈለግ ላይ ችግር ተፈጠረ። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
    fallback: "ታሪኩ አሁን ሊጻፍ አልቻለም — ግን አሁንም ብቻዎን አይደሉም። እነዚህ ሰዎችም ይህን ተሸክመዋል፤ ታሪካቸውን በቀጥታ ከመጽሐፉ ለማንበብ አንዱን ይንኩ፦",
    tooLong: "ይህ ብዙ ሸክም ነው። በአጭሩ (ከ1000 ፊደል በታች) ሊነግሩኝ ይችላሉ?",
    textOnly: "እባክዎ የተሸከሙትን በቃላት ይጻፉ፣ እኔም ታሪክ እፈልግልዎታለሁ።",
    helpTitle: "አደጋ ላይ ከሆኑ፣ አሁኑኑ ሰው ያግኙ።",
    call: "ይደውሉ",
    today: "የዕለቱ ታሪክ",
    readStory: "ታሪካቸውን ያንብቡ",
    helped: "🙏 ረድቶኛል",
    notReally: "ብዙም አይደለም",
    thanks: "እናመሰግናለን። ለሌሎች ትክክለኛ ታሪኮችን እንድናገኝ ይረዳናል።",
  },
} as const;

/** What a finished search stream amounts to. */
export interface SearchResult {
  crisis?: CrisisPayload;
  chunks: SourceChunk[];
  figures: FigureSummary[];
  tags: string[];
  answer: string;
  error?: string;
}

export async function collectStream(messages: AsyncIterable<SearchStreamMessage>): Promise<SearchResult> {
  const out: SearchResult = { chunks: [], figures: [], tags: [], answer: "" };
  for await (const m of messages) {
    if (m.type === "crisis") out.crisis = m.crisis;
    else if (m.type === "sources") {
      out.chunks = m.chunks;
      out.figures = m.figures ?? [];
      out.tags = m.tags ?? [];
    } else if (m.type === "delta") out.answer += m.text;
    else if (m.type === "error") out.error = m.message;
  }
  return out;
}

/** Crisis resources as a message: the numbers first, each one tappable. */
export function crisisMessage(crisis: Pick<CrisisPayload, "message" | "steps" | "resources">, lang: BotLang): string {
  const t = TEXT[lang];
  const lines = [`<b>${escapeHtml(crisis.message)}</b>`, ""];
  for (const r of crisis.resources) {
    if (r.phone) lines.push(`📞 <b>${escapeHtml(r.phone)}</b> — ${escapeHtml(r.name)} (${escapeHtml(r.detail)})`);
  }
  lines.push("");
  for (const s of crisis.steps) lines.push(`• ${escapeHtml(s)}`);
  for (const r of crisis.resources) {
    if (!r.phone)
      lines.push(
        `• ${r.url ? `<a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a>` : escapeHtml(r.name)} — ${escapeHtml(r.detail)}`,
      );
  }
  lines.push("", `${t.call}: ${SITE_URL}/help`);
  return lines.join("\n").trim();
}

/** The story as one or more Telegram HTML messages, sources listed at the end. */
export function storyMessages(result: SearchResult, lang: BotLang): string[] {
  const t = TEXT[lang];
  const names = result.figures.map((f) => f.name).join(" · ");
  const head = names ? `<b>${escapeHtml(t.notOnly)}</b>\n<i>${escapeHtml(names)}</i>\n\n` : "";
  const used = new Set([...result.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const refs = result.chunks
    .filter((c) => used.size === 0 || used.has(c.n))
    .map((c) => `[${c.n}] ${escapeHtml(c.ref || c.title)}`);
  const tail =
    (refs.length ? `\n\n<b>${escapeHtml(t.sources)}</b>\n${refs.join("\n")}` : "") +
    "\n\n" +
    (result.figures.length
      ? `<b>${escapeHtml(t.more)}</b>\n` +
        result.figures
          .map((f) => `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(figureText(lang, f).name)}</a>`)
          .join("\n")
      : `<a href="${SITE_URL}/">${escapeHtml(t.more)} →</a>`);
  return splitMessage(head + markdownToHtml(result.answer.trim()) + tail);
}

/** Split on paragraph breaks (then lines, then hard) so no message passes the limit or cuts a tag. */
export function splitMessage(text: string, max = MAX_MESSAGE): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    const piece = current ? `${current}\n\n${para}` : para;
    if (piece.length <= max) {
      current = piece;
      continue;
    }
    if (current) parts.push(current);
    if (para.length <= max) current = para;
    else {
      // A single paragraph longer than a message: drop its formatting and cut it.
      const plain = para.replace(/<[^>]+>/g, "");
      for (let i = 0; i < plain.length; i += max) parts.push(plain.slice(i, i + max));
      current = "";
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Call a Telegram Bot API method. */
export async function tg(token: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json;
}

/**
 * Feedback buttons carry what the story used in Telegram's 64-byte
 * callback_data: "fb|<1 or 0>|<lang>|<figure positions>|<tags>". People are
 * encoded by their position in the seed list, which only ever grows at the end.
 */
export function feedbackKeyboard(result: Pick<SearchResult, "figures">, tags: string[], lang: BotLang) {
  const figs = result.figures
    .map((f) => FIGURES.findIndex((x) => x.id === f.id))
    .filter((i) => i >= 0)
    .join(".");
  const data = (yes: boolean) => {
    const full = `fb|${yes ? 1 : 0}|${lang}|${figs}|${tags.join(".")}`;
    return full.length <= 64 ? full : `fb|${yes ? 1 : 0}|${lang}|${figs}|`;
  };
  return {
    inline_keyboard: [
      [
        { text: TEXT[lang].helped, callback_data: data(true) },
        { text: TEXT[lang].notReally, callback_data: data(false) },
      ],
    ],
  };
}

export function parseFeedbackData(
  data: string,
): { helpful: boolean; lang: BotLang; figures: string[]; tags: string[] } | null {
  const [kind, yes, lang, figs = "", tags = ""] = data.split("|");
  if (kind !== "fb" || (yes !== "1" && yes !== "0") || (lang !== "en" && lang !== "am")) return null;
  return {
    helpful: yes === "1",
    lang,
    figures: figs
      .split(".")
      .filter(Boolean)
      .map((i) => FIGURES[Number(i)]?.id)
      .filter((id): id is string => !!id),
    tags: tags.split(".").filter(Boolean),
  };
}

/**
 * When no story can be written (quota spent, site busy, stream broken): the
 * reason, then the people who carried the same thing, each linking to their
 * page — read straight from the text, no model needed. Null when there is no one.
 */
export function fallbackMessage(
  people: Pick<FigureSummary, "id" | "name" | "summary">[],
  lang: BotLang,
  busy: boolean,
) {
  if (!people.length) return null;
  const t = TEXT[lang];
  const lines = people.map((f) => {
    const x = figureText(lang, f);
    return `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(x.name)}</a> — ${escapeHtml(x.summary)}`;
  });
  return `${busy ? `${escapeHtml(t.busy)}\n\n` : ""}${escapeHtml(t.fallback)}\n\n${lines.join("\n\n")}`;
}

/** The /today caption: who, what they carried, and a link to their page (fits a photo caption). */
export function todayCaption(f: Pick<FigureSummary, "id" | "name" | "summary">, lang: BotLang): string {
  const t = TEXT[lang];
  const x = figureText(lang, f);
  return (
    `<b>${escapeHtml(t.today)}</b>\n\n<b>${escapeHtml(x.name)}</b>\n${escapeHtml(x.summary)}\n\n` +
    `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(t.readStory)}</a>`
  );
}

/** The channel post: Amharic first, then English, one link (fits a photo caption). */
export function channelCaption(f: Pick<FigureSummary, "id" | "name" | "summary">): string {
  const am = figureText("am", f);
  return (
    `<b>${escapeHtml(TEXT.am.today)} · ${escapeHtml(TEXT.en.today)}</b>\n\n` +
    `<b>${escapeHtml(am.name)}</b>\n${escapeHtml(am.summary)}\n\n` +
    `<b>${escapeHtml(f.name)}</b>\n${escapeHtml(f.summary)}\n\n` +
    `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(TEXT.am.readStory)} · ${escapeHtml(TEXT.en.readStory)}</a>\n` +
    `🙏 <a href="https://t.me/U_not_the_only_bot">@U_not_the_only_bot</a>`
  );
}
