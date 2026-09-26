/**
 * GET /api/telegram/setup?key=… — points the Telegram bot at this site. It
 * always registers the production URL (never the request's host) with the
 * secret derived from the token, and sets the bot's command menu and
 * descriptions in English and Amharic.
 *
 * `key` must be setupKey(token), so only whoever holds the bot token can run
 * it; anyone else gets a plain 404 and no Telegram calls are made.
 */
import { SITE_URL, setupKey, tg, webhookSecret } from "@/lib/telegram";

export async function GET(request: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || new URL(request.url).searchParams.get("key") !== setupKey(token)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    await tg(token, "setWebhook", {
      url: `${SITE_URL}/api/telegram`,
      secret_token: webhookSecret(token),
      allowed_updates: ["message", "callback_query"],
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
