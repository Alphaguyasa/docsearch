/**
 * Fetch the artwork in scripts/art/sources.json from Wikimedia Commons, check
 * each licence, and write phone-sized WebP files plus credits to public/art/.
 *
 *   public/art/<id>-800.webp, <id>-1600.webp   (quality 72; ~40–200 kB)
 *   public/art/credits.json                    artist, title, licence, source, blur placeholder, focal crop
 *
 * Runs in GitHub Actions (fetch-art.yml). Needs `sharp`, installed there with --no-save.
 * An entry that cannot be resolved to an accepted licence is skipped and the
 * site falls back to the person's drawn symbol.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "NotAlone/1.0 (https://github.com/Alphaguyasa/docsearch)";
const OUT = "public/art";

interface Source {
  id: string;
  query?: string;
  file?: string;
  caption: string;
}

interface Credit {
  id: string;
  caption: string;
  title: string;
  artist: string;
  date: string;
  license: string;
  licenseUrl: string;
  source: string;
  width: number;
  height: number;
  blur: string;
}

const ACCEPT = /^(public domain|pd|no restrictions|cc0|cc[- ]by(-sa)?([- ]\d(\.\d)?)?)/i;

function strip(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function api(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
  throw new Error(`Commons API failed: ${url}`);
}

async function candidates(s: Source): Promise<string[]> {
  if (s.file) return [s.file.startsWith("File:") ? s.file : `File:${s.file}`];
  const r = await api({ action: "query", list: "search", srsearch: `${s.query} filetype:bitmap`, srnamespace: "6", srlimit: "12" });
  return (r.query?.search ?? []).map((h: { title: string }) => h.title);
}

async function info(titles: string[]): Promise<any[]> {
  const r = await api({
    action: "query",
    prop: "imageinfo",
    titles: titles.join("|"),
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1600",
  });
  const byTitle = new Map((r.query?.pages ?? []).map((p: any) => [p.title, p]));
  return titles.map((t) => byTitle.get(t)).filter(Boolean);
}

async function main() {
  const sharp = (await import("sharp")).default;
  const { items } = JSON.parse(readFileSync("scripts/art/sources.json", "utf8")) as { items: Source[] };
  mkdirSync(OUT, { recursive: true });
  const credits: Credit[] = [];
  const log: string[] = [];

  for (const s of items) {
    try {
      const pages = await info(await candidates(s));
      const pick = pages.find((p) => {
        const ii = p.imageinfo?.[0];
        if (!ii || !/image\/(jpeg|png|tiff)/.test(ii.mime) || ii.width < 900) return false;
        return ACCEPT.test(strip(ii.extmetadata?.LicenseShortName?.value));
      });
      if (!pick) {
        log.push(`- ${s.id}: NO MATCH (${pages.map((p) => p.title).slice(0, 3).join(" | ")})`);
        continue;
      }
      const ii = pick.imageinfo[0];
      const res = await fetch(ii.thumburl ?? ii.url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const img = sharp(buf).rotate();
      await img.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 72 }).toFile(join(OUT, `${s.id}-1600.webp`));
      await img.clone().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 70 }).toFile(join(OUT, `${s.id}-800.webp`));
      const tiny = await img.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
      const meta = await sharp(buf).metadata();
      const m = ii.extmetadata ?? {};
      credits.push({
        id: s.id,
        caption: s.caption,
        title: strip(m.ObjectName?.value) || pick.title.replace(/^File:/, "").replace(/\.\w+$/, ""),
        artist: strip(m.Artist?.value) || "Unknown",
        date: strip(m.DateTimeOriginal?.value),
        license: strip(m.LicenseShortName?.value),
        licenseUrl: strip(m.LicenseUrl?.value),
        source: ii.descriptionurl,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        blur: `data:image/webp;base64,${tiny.toString("base64")}`,
      });
      log.push(`- ${s.id}: ${pick.title} — ${strip(m.Artist?.value)} — ${strip(m.LicenseShortName?.value)}`);
    } catch (e) {
      log.push(`- ${s.id}: ERROR ${(e as Error).message}`);
    }
  }

  writeFileSync(join(OUT, "credits.json"), JSON.stringify({ credits }, null, 2) + "\n");
  writeFileSync(join(OUT, "fetch-report.md"), `# Artwork fetch\n\n${log.join("\n")}\n`);
  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
