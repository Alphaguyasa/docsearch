/**
 * Answers to the home page's example questions, kept in memory for a few
 * hours.
 *
 * WHY: on Gemini's free tier the main model allows about 20 requests a day,
 * and the four example cards are the most-tapped questions on the site. A
 * repeat tap is served from here and costs no quota at all.
 *
 * PRIVACY: only these fixed example sentences are ever kept — never anything
 * a reader typed — so "Nothing you write is saved" stays true. The cache is
 * per server instance and disappears on a cold start; that is fine.
 *
 * No imports, so it can be unit-tested without the environment.
 */
export const EXAMPLE_QUESTIONS = [
  "I keep lying to my parents and I can't stop.",
  "I cheated on my wife. I don't know how to live with it.",
  "I have walked away from God for years.",
  "ሁልጊዜ በጣም እቆጣለሁ፣ ቤተሰቤን እጎዳለሁ።",
  // The same cards when the site is shown in Amharic (src/app/i18n/dict.ts).
  "ለወላጆቼ መዋሸት ማቆም አልቻልኩም።",
  "በትዳሬ ላይ አመነዘርኩ። ከዚህ ጋር እንዴት እንደምኖር አላውቅም።",
  "ለዓመታት ከእግዚአብሔር ርቄያለሁ።",
] as const;

const TTL_MS = 6 * 60 * 60 * 1000;
const store = new Map<string, { body: string; at: number }>();

/** The cache key for an example question (per tradition), or null for anything a reader wrote. */
export function exampleKey(question: string, tradition?: string): string | null {
  const q = question.trim();
  return (EXAMPLE_QUESTIONS as readonly string[]).includes(q) ? `${tradition ?? "all"}\u0000${q}` : null;
}

export function getCachedExample(key: string, now = Date.now()): string | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (now - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.body;
}

/** Store a complete NDJSON answer. Only call with a stream that ended in "done". */
export function cacheExample(key: string, body: string, now = Date.now()): void {
  store.set(key, { body, at: now });
}
