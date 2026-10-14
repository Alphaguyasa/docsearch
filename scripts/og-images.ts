/**
 * Link-preview images (1200×630 JPEG) for each person's page, cut from their
 * painting with the same focal crop the site uses, darkened a touch at the
 * bottom so Telegram's and WhatsApp's title text sits on it well.
 *
 *   npx tsx scripts/og-images.ts      (needs sharp: npm install --no-save sharp)
 *
 * Reads public/art/<id>-1600.webp, writes public/art/og/<id>.jpg. Run by the
 * fetch-art workflow after new paintings arrive.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { FOCUS_PERCENT } from "../src/app/art-focus";

const ART = path.join(process.cwd(), "public/art");
const OUT = path.join(ART, "og");
const W = 1200;
const H = 630;

const shade = Buffer.from(
  `<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/>` +
    `</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ids = readdirSync(ART)
    .filter((f) => f.endsWith("-1600.webp"))
    .map((f) => f.replace(/-1600\.webp$/, ""))
    .filter((id) => id !== "hero" && id !== "lalibela");
  for (const id of ids) {
    const src = path.join(ART, `${id}-1600.webp`);
    const img = sharp(src);
    const { width = W, height = H } = await img.metadata();
    // Scale to cover 1200×630, then take the window at the focal height.
    const scale = Math.max(W / width, H / height);
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);
    const top = Math.round(((sh - H) * (FOCUS_PERCENT[id] ?? 50)) / 100);
    const left = Math.round((sw - W) / 2);
    await sharp(src)
      .resize(sw, sh)
      .extract({ left, top, width: W, height: H })
      .composite([{ input: shade }])
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(path.join(OUT, `${id}.jpg`));
  }
  console.log(`og images: ${ids.length} written to public/art/og`);
  if (!existsSync(OUT)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
