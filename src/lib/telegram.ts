/**
 * Not Alone on Telegram: turning a message into a search and the search's
 * stream into Telegram messages. The HTTP side lives in
 * src/app/api/telegram/route.ts; everything here is pure except `tg`.
 *
 * Nothing a person writes is stored: the text goes to /api/search exactly as
 * it would from the website, and the reply goes straight back to the chat.
 */
import { createHmac } from "node:crypto";

import type { CrisisPayload, FigureSummary, SearchStreamMessage, SourceChunk } from "./search-stream";

export type BotLang = "en" | "am";

/** Telegram's hard limit is 4096 characters; stay under it with room for tags. */
export const MAX_MESSAGE = 3900;

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
      "/help — if you are in danger, people to call now",
    searching: "Finding someone who carried this too…",
    notOnly: "You are not the only one",
    sources: "Where to read it",
    more: "Read it with the full passages",
    busy: "Many people are asking right now. Please send your message again in a minute.",
    failed: "Something went wrong while finding a story. Please try again in a moment.",
    tooLong: "That is a lot to carry. Could you say it in fewer words (under 1000 characters)?",
    textOnly: "Please write what you are carrying in words, and I will find a story for you.",
    helpTitle: "If you are in danger, reach someone now.",
    call: "Call",
  },
  am: {
    welcome: (name?: string) =>
      `${name ? `ሰላም ለእርስዎ ይሁን፣ ${escapeHtml(name)}።` : "ሰላም ለእርስዎ ይሁን።"}\n\n` +
      "<b>እርስዎ ብቻ አይደሉም።</b> የተሸከሙትን ይንገሩኝ — ኃጢአት፣ ትግል ወይም የሚያሳፍርዎትን ነገር — እኔም በተመሳሳይ መንገድ ወድቆ የተመለሰውን የቅዱስ ሰው እውነተኛ ታሪክ ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች እነግርዎታለሁ።\n\n" +
      "የሚጽፉት ምንም ነገር አይቀመጥም።\n\n" +
      "ለምሳሌ፦ <i>ለወላጆቼ መዋሸት ማቆም አልቻልኩም።</i>\n\n" +
      "/help — አደጋ ላይ ከሆኑ የሚደውሉላቸው",
    searching: "ይህን የተሸከመ ሰው እየፈለግሁ ነው…",
    notOnly: "እርስዎ ብቻ አይደሉም",
    sources: "የት እንደሚነበብ",
    more: "ከሙሉ ምንባቦቹ ጋር ያንብቡት",
    busy: "አሁን ብዙ ሰዎች እየጠየቁ ነው። እባክዎ ከአንድ ደቂቃ በኋላ መልእክትዎን እንደገና ይላኩ።",
    failed: "ታሪክ በመፈለግ ላይ ችግር ተፈጠረ። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
    tooLong: "ይህ ብዙ ሸክም ነው። በአጭሩ (ከ1000 ፊደል በታች) ሊነግሩኝ ይችላሉ?",
    textOnly: "እባክዎ የተሸከሙትን በቃላት ይጻፉ፣ እኔም ታሪክ እፈልግልዎታለሁ።",
    helpTitle: "አደጋ ላይ ከሆኑ፣ አሁኑኑ ሰው ያግኙ።",
    call: "ይደውሉ",
  },
} as const;

/** What a finished search stream amounts to. */
export interface SearchResult {
  crisis?: CrisisPayload;
  chunks: SourceChunk[];
  figures: FigureSummary[];
  answer: string;
  error?: string;
}

export async function collectStream(messages: AsyncIterable<SearchStreamMessage>): Promise<SearchResult> {
  const out: SearchResult = { chunks: [], figures: [], answer: "" };
  for await (const m of messages) {
    if (m.type === "crisis") out.crisis = m.crisis;
    else if (m.type === "sources") {
      out.chunks = m.chunks;
      out.figures = m.figures ?? [];
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
    `\n\n<a href="${SITE_URL}/">${escapeHtml(t.more)} →</a>`;
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
