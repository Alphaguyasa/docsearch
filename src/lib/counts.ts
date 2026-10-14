/**
 * Daily counts for the owner's numbers page: plain names ("story",
 * "tag:lust", "person:david") bumped once per event in `daily_counts`. Never
 * the words a person wrote. Counting must never slow or break a request, so
 * it runs after the response and swallows its own errors.
 */
import { addisDay } from "./scripture/today";

/** What one search counts as. Pure, for tests. */
export function searchCounts(e: {
  question: string;
  via: "web" | "telegram";
  kind: "story" | "cached" | "crisis" | "busy" | "error";
  crisisKind?: string;
  tags?: string[];
  figures?: { id: string }[];
}): string[] {
  const lang = /[ሀ-፿]/.test(e.question) ? "lang:am" : "lang:en";
  const names = [e.kind, `via:${e.via}`, lang];
  if (e.kind === "cached") names.push("story");
  if (e.crisisKind) names.push(`crisis:${e.crisisKind}`);
  for (const t of e.tags ?? []) names.push(`tag:${t}`);
  for (const f of e.figures ?? []) names.push(`person:${f.id}`);
  return [...new Set(names)];
}

export async function bump(names: string[], now = new Date()): Promise<void> {
  try {
    const { db } = await import("./db");
    const { error } = await db.rpc("bump_counts", { p_day: addisDay(now), p_names: names });
    if (error) console.warn("counts:", error.message);
  } catch (err) {
    console.warn("counts:", err);
  }
}
