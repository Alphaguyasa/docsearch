/**
 * Artwork fetched by scripts/fetch-art.ts (public domain or open licence, see
 * /credits). Anyone without a painting falls back to their drawn symbol.
 */
import data from "../../public/art/credits.json";

export interface Art {
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

export const ART: Art[] = (data as { credits: Art[] }).credits;
const BY_ID = new Map(ART.map((a) => [a.id, a]));

/** Where to anchor the crop for tall paintings whose faces sit near the top. */
const FOCUS: Record<string, string> = {
  cyprian: "center 6%",
  mary_of_egypt: "center 12%",
};

export function artFocus(id: string): string {
  return FOCUS[id] ?? "center";
}

export function artFor(id: string): Art | undefined {
  return BY_ID.get(id);
}

export function artSrc(id: string, width: 800 | 1600): string {
  return `/art/${id}-${width}.webp`;
}

export function artSrcSet(id: string): string {
  return `${artSrc(id, 800)} 800w, ${artSrc(id, 1600)} 1600w`;
}

/** "Rembrandt, 1668" — artist names on Commons can be long; keep the first line. */
export function artByline(a: Art): string {
  const artist = a.artist.split(/\s{2,}|\n| \(/)[0].trim();
  const year = a.date.match(/\b1[0-9]{3}\b/)?.[0];
  return year ? `${artist}, ${year}` : artist;
}
