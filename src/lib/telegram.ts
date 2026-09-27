/**
 * Not Alone on Telegram: turning a message into a search and the search's
 * stream into Telegram messages. The HTTP side lives in
 * src/app/api/telegram/route.ts; everything here is pure except `tg`.
 *
 * Nothing a person writes is stored: the text goes to /api/search exactly as
 * it would from the website, and the reply goes straight back to the chat.
 * The one exception is opt-in: /daily keeps the chat number (and language) to
 * send the morning story, and /stop deletes it.
 */
import { createHmac } from "node:crypto";

import credits from "../../public/art/credits.json";
import { figureText } from "../app/i18n/dict";
import { FIGURES, type Figure } from "./scripture/figures";
import { foldEthiopic, matchTags } from "./scripture/struggle";
import { personOfTheDay } from "./scripture/today";
import type { CrisisPayload, FigureSummary, SearchStreamMessage, SourceChunk } from "./search-stream";

export type BotLang = "en" | "am";

/** Telegram's hard limit is 4096 characters; stay under it with room for tags. */
export const MAX_MESSAGE = 3900;

/** The public channel the bot posts the story of the day to. */
export const CHANNEL = process.env.TELEGRAM_CHANNEL || "@you_r_repenter";

/** Opens the bot and starts the 40-day journey (or the morning story) in one tap. */
export function botLink(start?: "journey" | "daily", lang?: BotLang): string {
  return `https://t.me/U_not_the_only_bot${start ? `?start=${start}${lang ? `_${lang}` : ""}` : ""}`;
}

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
      "/today — the story of the day\n" +
      "/daily — get the story of the day here every morning\n" +
      "/journey — 40 days, 40 people: one each morning\n" +
      "/help — if you are in danger, people to call now\n\n" +
      "To share a story in any chat, type @U_not_the_only_bot and a word — like <i>anger</i> or <i>Peter</i>.",
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
    dailyOn:
      "🌅 Every morning you will get the story of the day here.\n\nOnly your chat number is kept, to send it — never anything you write. Send /stop to end it.",
    dailyOff: "The morning stories are stopped. Send /daily any time to start again.",
    journeyOn:
      "🕯 The 40-day journey has begun: one person a day who fell and came back. Here is day 1 — day 2 comes tomorrow morning.\n\nOnly your chat number, language and day are kept. Send /stop to end it.",
    journeyHeader: (n: number) => `Day ${n} of 40 · 40 days, 40 people`,
    journeyDone:
      "You finished all 40 days. Every one of them came back — so can you. The story of the day will keep coming each morning; send /stop to end it.",
  },
  am: {
    welcome: (name?: string) =>
      `${name ? `ሰላም ለእርስዎ ይሁን፣ ${escapeHtml(name)}።` : "ሰላም ለእርስዎ ይሁን።"}\n\n` +
      "<b>እርስዎ ብቻ አይደሉም።</b> የተሸከሙትን ይንገሩኝ — ኃጢአት፣ ትግል ወይም የሚያሳፍርዎትን ነገር — እኔም በተመሳሳይ መንገድ ወድቆ የተመለሰውን የቅዱስ ሰው እውነተኛ ታሪክ ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች እነግርዎታለሁ።\n\n" +
      "የሚጽፉት ምንም ነገር አይቀመጥም።\n\n" +
      "ለምሳሌ፦ <i>ለወላጆቼ መዋሸት ማቆም አልቻልኩም።</i>\n\n" +
      "/today — የዕለቱ ታሪክ\n" +
      "/daily — የዕለቱን ታሪክ በየማለዳው እዚህ ያግኙ\n" +
      "/journey — 40 ቀናት፣ 40 ሰዎች፦ በየማለዳው አንድ\n" +
      "/help — አደጋ ላይ ከሆኑ የሚደውሉላቸው\n\n" +
      "በማንኛውም ውይይት ታሪክ ለማጋራት፣ @U_not_the_only_bot ብለው አንድ ቃል ይጻፉ — ለምሳሌ <i>ቁጣ</i> ወይም <i>ጴጥሮስ</i>።",
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
    dailyOn:
      "🌅 በየማለዳው የዕለቱን ታሪክ እዚህ ያገኛሉ።\n\nየሚቀመጠው ለመላክ የሚያስፈልገው የውይይት ቁጥርዎ ብቻ ነው — የሚጽፉት በፍጹም አይቀመጥም። ለማቆም /stop ይላኩ።",
    dailyOff: "የማለዳ ታሪኮቹ ቆመዋል። እንደገና ለመጀመር በማንኛውም ጊዜ /daily ይላኩ።",
    journeyOn:
      "🕯 የ40 ቀን ጉዞው ጀምሯል፦ በቀን አንድ የወደቀና የተመለሰ ሰው። ቀን 1 ይኸውና — ቀን 2 ነገ ማለዳ ይመጣል።\n\nየሚቀመጠው የውይይት ቁጥርዎ፣ ቋንቋዎና ቀኑ ብቻ ነው። ለማቆም /stop ይላኩ።",
    journeyHeader: (n: number) => `ቀን ${n} ከ40 · 40 ቀናት፣ 40 ሰዎች`,
    journeyDone:
      "40ዎቹንም ቀናት ጨርሰዋል። እያንዳንዳቸው ተመልሰዋል — እርስዎም ይችላሉ። የዕለቱ ታሪክ በየማለዳው መምጣቱን ይቀጥላል፤ ለማቆም /stop ይላኩ።",
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

/** The bot's command menu, in English and Amharic. */
export async function setCommands(token: string): Promise<void> {
  const commands = (start: string, today: string, daily: string, journey: string, help: string) => [
    { command: "start", description: start },
    { command: "today", description: today },
    { command: "daily", description: daily },
    { command: "journey", description: journey },
    { command: "help", description: help },
  ];
  await tg(token, "setMyCommands", {
    commands: commands(
      "Begin",
      "The story of the day",
      "Get the story of the day every morning",
      "40 days, 40 people who came back",
      "If you are in danger — people to call now",
    ),
  });
  await tg(token, "setMyCommands", {
    commands: commands("ጀምር", "የዕለቱ ታሪክ", "የዕለቱን ታሪክ በየማለዳው ያግኙ", "40 ቀናት፣ የተመለሱ 40 ሰዎች", "አደጋ ላይ ከሆኑ — የሚደውሉላቸው"),
    language_code: "am",
  });
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

/**
 * Inline mode: typing "@U_not_the_only_bot anger" (or a name, in English or
 * Amharic) in any chat offers story cards to send there. Names match first,
 * then struggles; an empty query offers the story of the day first.
 */
export function inlinePeople(query: string, now = new Date(), limit = 8): Figure[] {
  const readable = FIGURES.filter((f) => f.passages.some((p) => p.sourceId !== "pending"));
  const q = foldEthiopic(query.trim().toLowerCase());
  if (!q) {
    const today = personOfTheDay(now, FIGURES);
    return [today, ...readable.filter((f) => f.id !== today.id)].slice(0, limit);
  }
  const byName = readable.filter((f) =>
    [f.name, figureText("am", f).name].some((n) => foldEthiopic(n.toLowerCase()).includes(q)),
  );
  const tags = matchTags(query);
  const byTag = readable
    .map((f) => ({ f, n: f.sins.filter((s) => tags.includes(s)).length }))
    .filter((x) => x.n > 0 && !byName.includes(x.f))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.f);
  return [...byName, ...byTag].slice(0, limit);
}

/** One day of the 40-day journey in the bot. */
export function journeyCaption(f: Pick<FigureSummary, "id" | "name" | "summary">, lang: BotLang, day: number): string {
  const t = TEXT[lang];
  const x = figureText(lang, f);
  return (
    `<b>${escapeHtml(t.journeyHeader(day))}</b>\n\n<b>${escapeHtml(x.name)}</b>\n${escapeHtml(x.summary)}\n\n` +
    `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(t.readStory)}</a>`
  );
}

/** A story card for someone to send to a friend or a group. */
export function shareCaption(f: Pick<FigureSummary, "id" | "name" | "summary">, lang: BotLang): string {
  const t = TEXT[lang];
  const x = figureText(lang, f);
  return (
    `<b>${escapeHtml(t.notOnly)}</b>\n\n<b>${escapeHtml(x.name)}</b>\n${escapeHtml(x.summary)}\n\n` +
    `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(t.readStory)}</a>\n` +
    `🙏 <a href="https://t.me/U_not_the_only_bot">@U_not_the_only_bot</a>`
  );
}

const PAINTED = new Set((credits as { credits: { id: string }[] }).credits.map((a) => a.id));

/** Telegram InlineQueryResults for those people: the painting where there is one. */
export function inlineResults(people: Figure[], lang: BotLang) {
  return people.map((f) => {
    const x = figureText(lang, f);
    const caption = shareCaption(f, lang);
    if (PAINTED.has(f.id)) {
      const photo = `${SITE_URL}/art/og/${f.id}.jpg`;
      return {
        type: "photo",
        id: `${f.id}.${lang}`,
        photo_url: photo,
        thumbnail_url: photo,
        photo_width: 1200,
        photo_height: 630,
        title: x.name,
        description: x.summary,
        caption,
        parse_mode: "HTML",
      };
    }
    return {
      type: "article",
      id: `${f.id}.${lang}`,
      title: x.name,
      description: x.summary,
      input_message_content: {
        message_text: caption,
        parse_mode: "HTML",
        link_preview_options: { url: `${SITE_URL}/people/${f.id}` },
      },
    };
  });
}

/** Points Telegram at the webhook, for every kind of update the bot handles. */
export async function registerWebhook(token: string): Promise<void> {
  await tg(token, "setWebhook", {
    url: `${SITE_URL}/api/telegram`,
    secret_token: webhookSecret(token),
    allowed_updates: ["message", "callback_query", "inline_query"],
  });
}

/** The channel post: Amharic first, then English, one link (fits a photo caption). */
export function channelCaption(f: Pick<FigureSummary, "id" | "name" | "summary">): string {
  const am = figureText("am", f);
  return (
    `<b>${escapeHtml(TEXT.am.today)} · ${escapeHtml(TEXT.en.today)}</b>\n\n` +
    `<b>${escapeHtml(am.name)}</b>\n${escapeHtml(am.summary)}\n\n` +
    `<b>${escapeHtml(f.name)}</b>\n${escapeHtml(f.summary)}\n\n` +
    `📖 <a href="${SITE_URL}/people/${f.id}">${escapeHtml(TEXT.am.readStory)} · ${escapeHtml(TEXT.en.readStory)}</a>\n` +
    `🙏 <a href="https://t.me/U_not_the_only_bot">@U_not_the_only_bot</a>\n` +
    `🕯 <a href="${botLink("journey")}">40 ቀናት፣ 40 ሰዎች · 40 days, 40 people</a>`
  );
}
