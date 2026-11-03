import { safeEqual } from "@/lib/safe-equal";

/**
 * Access to the owner's /stats page (ROADMAP 46).
 *
 * The key used to travel as `/stats?key=…`, which leaves it in request logs,
 * browser history and any link that gets shared. Now it is typed into a form
 * once, and the browser keeps a cookie that holds an HMAC of the key, never
 * the key itself, so a leaked cookie does not reveal STATS_KEY. Changing
 * STATS_KEY signs every browser out.
 *
 * Web Crypto only (no node:crypto), so the proxy can import it too.
 */

export const STATS_COOKIE = "na_stats";

/** Thirty days: the owner looks at the page from one or two devices. */
export const STATS_COOKIE_MAX_AGE = 30 * 86_400;

/** The longest key the form accepts. Bodies above this are refused unread. */
export const STATS_KEY_MAX = 512;

const LABEL = "not-alone stats cookie v1";

export async function statsToken(key: string): Promise<string> {
  const enc = new TextEncoder();
  const hmac = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, enc.encode(LABEL)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Is `given` the stats key? False whenever STATS_KEY is unset. */
export function statsKeyOk(given: string | null | undefined, key = process.env.STATS_KEY): boolean {
  if (!key || !given) return false;
  return safeEqual(given, key);
}

/** Does this cookie value prove the reader typed the key? */
export async function statsCookieOk(
  value: string | null | undefined,
  key = process.env.STATS_KEY,
): Promise<boolean> {
  if (!key || !value) return false;
  return safeEqual(value, await statsToken(key));
}

/**
 * Scoped to /stats so no other page, route or fetch ever carries it;
 * SameSite=Strict so another site cannot make the browser send it.
 */
export function statsCookieAttributes(maxAge = STATS_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/stats",
    maxAge,
  };
}
