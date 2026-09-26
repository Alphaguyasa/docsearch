/**
 * GET /api/telegram/setup — points the Telegram bot at this site. Safe to call
 * any time: it always registers the production URL (never the request's host)
 * with the secret derived from the token, and sets the bot's command menu and
 * descriptions in English and Amharic.
 */
import { SITE_URL, tg, webhookSecret } from "@/lib/telegram";

export async function GET(): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set" }, { status: 503 });
  try {
    await tg(token, "setWebhook", {
      url: `${SITE_URL}/api/telegram`,
      secret_token: webhookSecret(token),
      allowed_updates: ["message"],
    });
    const commands = (start: string, help: string) => [
      { command: "start", description: start },
      { command: "help", description: help },
    ];
    await tg(token, "setMyCommands", { commands: commands("Begin", "If you are in danger — people to call now") });
    await tg(token, "setMyCommands", {
      commands: commands("ጀምር", "አደጋ ላይ ከሆኑ — የሚደውሉላቸው"),
      language_code: "am",
    });
    await tg(token, "setMyDescription", {
      description:
        "You are not the only one. Tell what you are carrying, and read the true story of a holy person who fell the same way and was restored — from Scripture and the Church Fathers. Nothing you write is saved.",
    });
    await tg(token, "setMyDescription", {
      description:
        "እርስዎ ብቻ አይደሉም። የተሸከሙትን ይንገሩ፣ በተመሳሳይ መንገድ ወድቆ የተመለሰውን የቅዱስ ሰው እውነተኛ ታሪክ ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች ያንብቡ። የሚጽፉት አይቀመጥም።",
      language_code: "am",
    });
    await tg(token, "setMyShortDescription", {
      short_description: "True stories of holy people who fell and were restored. Nothing you write is saved.",
    });
    const me = (await tg(token, "getMe", {})) as { result?: { username?: string } };
    return Response.json({ ok: true, webhook: `${SITE_URL}/api/telegram`, bot: me.result?.username });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
