/**
 * Answers to the home page's example questions, kept in memory for a few
 * hours.
 *
 * WHY: on Gemini's free tier the main model allows about 20 requests a day,
 * and the four example cards are the most-tapped questions on the site. A
 * repeat tap is served from here and costs no quota at all.
 *
 * PRIVACY: only these fixed example sentences are ever kept — never anything
 * a reader typed — so "Nothing you write is saved" stays true.
 *
 * Two layers: memory on each server instance, and the example_answers table
 * shared by all of them, so a cold start reads the answer back instead of
 * writing it again. The table is a bonus: when it is missing or the database
 * errors, the memory layer works alone, as before.
 *
 * No static imports, so it can be unit-tested without the environment.
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

export const TTL_MS = 6 * 60 * 60 * 1000;
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

/** True only for a key exampleKey made, so nothing else can reach the shared table. */
function isExampleKey(key: string): boolean {
  const q = key.slice(key.indexOf("\u0000") + 1);
  return key.includes("\u0000") && (EXAMPLE_QUESTIONS as readonly string[]).includes(q);
}

type RpcResult = { data: unknown; error: { message: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

// Loaded on first use, not at the top, so the memory layer needs no database settings.
const dbRpc: Rpc = async (fn, args) => {
  const { db } = await import("./db");
  return db.rpc(fn, args);
};

/** The shared answer for an example key, warmed into memory; null when there is none or on any error. */
export async function loadSharedExample(key: string, rpc: Rpc = dbRpc): Promise<string | null> {
  if (!isExampleKey(key)) return null;
  try {
    const { data, error } = await rpc("get_example", { p_key: key, p_max_age: TTL_MS / 1000 });
    if (error) {
      console.warn(`example cache: shared read failed: ${error.message}`);
      return null;
    }
    if (typeof data !== "string" || !data) return null;
    cacheExample(key, data);
    return data;
  } catch (err) {
    console.warn(`example cache: shared read failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Share a complete answer with the other instances. Never throws; refuses any key not from exampleKey. */
export async function saveSharedExample(key: string, body: string, rpc: Rpc = dbRpc): Promise<boolean> {
  if (!isExampleKey(key)) return false;
  try {
    const { error } = await rpc("put_example", { p_key: key, p_body: body });
    if (error) console.warn(`example cache: shared write failed: ${error.message}`);
    return !error;
  } catch (err) {
    console.warn(`example cache: shared write failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
