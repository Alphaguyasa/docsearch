/**
 * GET /status/<id>/<en|am> — a tall picture (1080×1920 PNG) of one person's
 * story, sized for a WhatsApp or Telegram status: their painting, name and
 * one-line summary, and where to read the rest. Drawn once at build time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { ImageResponse } from "next/og";

import { FIGURES } from "@/lib/scripture/figures";
import { SITE_URL, TEXT } from "@/lib/telegram";

import credits from "../../../../../public/art/credits.json";
import { figureText } from "../../../i18n/dict";
import { readablePeople } from "../../../people";

export const dynamic = "force-static";
export const dynamicParams = false;

const W = 1080;
const H = 1920;
const ART_H = 900;
const GLOW =
  "radial-gradient(circle at 50% 62%, rgba(232,181,96,0.38), rgba(232,181,96,0.08) 30%, rgba(11,9,7,0) 55%)";
const LANGS = ["en", "am"] as const;

export function generateStaticParams() {
  return readablePeople(FIGURES).flatMap((f) =>
    LANGS.map((lang) => ({ id: f.id, lang })),
  );
}

const font = (file: string) =>
  readFileSync(path.join(process.cwd(), "assets/fonts", file));

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; lang: string }> },
) {
  const { id, lang: raw } = await params;
  const f = FIGURES.find((x) => x.id === id);
  if (!f || (raw !== "en" && raw !== "am"))
    return new Response("Not found", { status: 404 });
  const lang = raw;
  const text = figureText(lang, f);
  const hasArt = (credits as { credits: { id: string }[] }).credits.some(
    (a) => a.id === id,
  );
  const art = hasArt
    ? `data:image/jpeg;base64,${readFileSync(path.join(process.cwd(), "public/art/og", `${id}.jpg`)).toString("base64")}`
    : null;
  const host = SITE_URL.replace(/^https:\/\//, "");

  return new ImageResponse(
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        background: "#0b0907",
        color: "#f1e9dc",
        fontFamily: lang === "am" ? "Ethiopic, Serif" : "Serif, Ethiopic",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: W,
          height: art ? ART_H : 760,
          // No painting yet: a candle's glow in the dark instead.
          ...(art ? {} : { backgroundImage: GLOW }),
        }}
      >
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            width={W}
            height={ART_H}
            style={{ objectFit: "cover" }}
            alt=""
          />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: W,
            height: 260,
            display: "flex",
            backgroundImage:
              "linear-gradient(to bottom, rgba(11,9,7,0), #0b0907)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "24px 80px 0",
          flexGrow: 1,
        }}
      >
        <div
          style={{
            fontSize: 34,
            letterSpacing: lang === "am" ? 0 : 4,
            color: "#e8b560",
            fontWeight: 700,
          }}
        >
          {TEXT[lang].notOnly}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: text.name.length > 22 ? 72 : 92,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {text.name}
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 48,
            lineHeight: 1.45,
            color: "#e4d9c8",
          }}
        >
          {text.summary}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0 80px 110px",
          fontSize: 34,
          color: "#b3a48f",
        }}
      >
        <div
          style={{
            height: 2,
            background: "#3a3026",
            marginBottom: 40,
            display: "flex",
          }}
        />
        <div
          style={{ color: "#e8b560", fontWeight: 700 }}
        >{`${host}/people/${id}`}</div>
        <div style={{ marginTop: 14 }}>Telegram · @U_not_the_only_bot</div>
      </div>
    </div>,
    {
      width: W,
      height: H,
      fonts: [
        {
          name: "Serif",
          data: font("noto-serif-latin-400-normal.woff"),
          weight: 400,
        },
        {
          name: "Serif",
          data: font("noto-serif-latin-700-normal.woff"),
          weight: 700,
        },
        {
          name: "Ethiopic",
          data: font("noto-serif-ethiopic-ethiopic-400-normal.woff"),
          weight: 400,
        },
        {
          name: "Ethiopic",
          data: font("noto-serif-ethiopic-ethiopic-700-normal.woff"),
          weight: 700,
        },
      ],
    },
  );
}
