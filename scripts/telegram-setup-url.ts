/**
 * Print the one-time link that registers the Telegram bot with the site.
 *
 *   TELEGRAM_BOT_TOKEN=123:abc npx tsx scripts/telegram-setup-url.ts
 *
 * Open the printed link once after changing the bot token or the site URL.
 */
import { SITE_URL, setupKey } from "../src/lib/telegram";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN first.");
  process.exit(1);
}
console.log(`${SITE_URL}/api/telegram/setup?key=${setupKey(token)}`);
