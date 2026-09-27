/**
 * GET /poster/<en|am> — a printable A4 poster (1240×1754 PNG, 150 dpi) to put
 * up in a church, a Sunday school or a youth group, or to send as a picture:
 * Rembrandt's prodigal son, "You are not the only one", and two QR codes —
 * the website, and the 40-day journey in the Telegram bot. Light background,
 * so it prints cheaply. Drawn once at build time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { ImageResponse } from "next/og";
import QRCode from "qrcode";

import { FIGURES } from "@/lib/scripture/figures";
import { SITE_URL, botLink } from "@/lib/telegram";

import { figureText } from "../../i18n/dict";

export const dynamic = "force-static";
export const dynamicParams = false;

const W = 1240;
const H = 1754;
const INK = "#241e18";
const GOLD = "#8c5b12";
const PAPER = "#f5f0e7";

export function generateStaticParams() {
  return [{ lang: "en" }, { lang: "am" }];
}

const font = (file: string) => readFileSync(path.join(process.cwd(), "assets/fonts", file));

async function qr(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: INK, light: "#ffffff" } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const COPY = {
  en: {
    title: "You are not the only one",
    names: (n: string[]) => `${n.join(", ")} — holy people fell the way you have, and were restored.`,
    body: "Tell what you are carrying, in English or Amharic, and read their true story from Scripture and the Church Fathers.",
    site: "Scan to open the website",
    bot: "40 days, 40 people — on Telegram",
    private: "Nothing you write is saved.",
    danger: "If you are in danger: ambulance 907 · police 991",
  },
  am: {
    title: "እርስዎ ብቻ አይደሉም",
    names: (n: string[]) => `${n.join("፣ ")} — ቅዱሳን እንደ እርስዎ ወድቀው ተመልሰዋል።`,
    body: "የተሸከሙትን በአማርኛ ወይም በእንግሊዝኛ ይንገሩ፤ እውነተኛ ታሪካቸውንም ከመጽሐፍ ቅዱስና ከቤተ ክርስቲያን አባቶች ያንብቡ።",
    site: "ድረ ገጹን ለመክፈት ይቃኙ",
    bot: "40 ቀናት፣ 40 ሰዎች — በቴሌግራም",
    private: "የሚጽፉት ምንም ነገር አይቀመጥም።",
    danger: "አደጋ ላይ ከሆኑ፦ አምቡላንስ 907 · ፖሊስ 991",
  },
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  if (raw !== "en" && raw !== "am") return new Response("Not found", { status: 404 });
  const lang = raw;
  const c = COPY[lang];
  const names = ["david", "peter", "augustine", "moses_the_ethiopian"].map(
    (id) => figureText(lang, FIGURES.find((f) => f.id === id)!).name,
  );
  const art = `data:image/jpeg;base64,${readFileSync(path.join(process.cwd(), "public/art/og/prodigal_son.jpg")).toString("base64")}`;
  const [siteQr, botQr] = await Promise.all([qr(`${SITE_URL}/?lang=${lang}`), qr(botLink("journey", lang))]);
  const host = SITE_URL.replace(/^https:\/\//, "");

  const code = (src: string, label: string, sub: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 480 }}>
      <div style={{ display: "flex", padding: 16, background: "#ffffff", borderRadius: 24, border: `3px solid ${GOLD}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={340} height={340} alt="" />
      </div>
      <div style={{ marginTop: 22, fontSize: 34, fontWeight: 700, textAlign: "center" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, color: "#6c6258" }}>{sub}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          color: INK,
          fontFamily: lang === "am" ? "Ethiopic, Serif" : "Serif, Ethiopic",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} width={W} height={651} style={{ objectFit: "cover" }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 90px 0", flexGrow: 1 }}>
          <div style={{ fontSize: lang === "am" ? 96 : 92, fontWeight: 700, lineHeight: 1.1 }}>{c.title}</div>
          <div style={{ marginTop: 28, fontSize: 38, lineHeight: 1.45, color: GOLD, fontWeight: 700 }}>
            {c.names(names)}
          </div>
          <div style={{ marginTop: 18, fontSize: 34, lineHeight: 1.5 }}>{c.body}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 56 }}>
            {code(siteQr, c.site, host)}
            {code(botQr, c.bot, "@U_not_the_only_bot")}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "26px 90px 40px",
            fontSize: 26,
            color: "#6c6258",
            borderTop: "2px solid #ddd3c4",
          }}
        >
          <div>{c.private}</div>
          <div>{c.danger}</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Serif", data: font("noto-serif-latin-400-normal.woff"), weight: 400 },
        { name: "Serif", data: font("noto-serif-latin-700-normal.woff"), weight: 700 },
        { name: "Ethiopic", data: font("noto-serif-ethiopic-ethiopic-400-normal.woff"), weight: 400 },
        { name: "Ethiopic", data: font("noto-serif-ethiopic-ethiopic-700-normal.woff"), weight: 700 },
      ],
    },
  );
}
