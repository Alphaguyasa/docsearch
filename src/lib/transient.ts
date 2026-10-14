/**
 * Which failures are worth trying again.
 *
 * Kept in its own module, with no imports, so it can be tested without pulling
 * in `db` or `embed` — both of those validate the environment at import time,
 * and a test that needs a live Supabase key to check a regex is a test that
 * fails in CI for reasons unrelated to what it asserts. That is not
 * hypothetical: the first CI run of the eval workflow died exactly that way,
 * because runner.test.ts imports answer.ts -> llm.ts -> env.ts.
 */

/**
 * True for errors that a retry can plausibly fix, false for errors that will
 * fail identically forever.
 *
 * MEASURED, not hypothetical. The first CI run of the eval workflow logged
 * `keyword search failed: JWT issued at future` on exactly one question of
 * thirty, and zero of thirty on the next job using the same key. The key is not
 * even a JWT — it is an `sb_secret_` key that Supabase exchanges server-side —
 * so this is clock skew between the gateway that mints the internal token and
 * the one that validates it, on a cold container. It cleared on its own within
 * seconds. Nothing about the request was wrong, and one retry would have made
 * it invisible.
 *
 * THE LIST IS DELIBERATELY SHORT. A bad key, a missing function, or a SQL error
 * fails the same way on every attempt; retrying those turns a clear instant
 * failure into a slow confusing one. Anything not named here is treated as
 * permanent and propagates on the first try, which is why this matches specific
 * messages rather than retrying everything.
 */
export function isTransient(message: string): boolean {
  return (
    // Clock skew on the token Supabase mints from the API key. Both directions:
    // "issued at future" is this machine behind, "expired" is it ahead.
    /JWT (issued at future|expired)/i.test(message) ||
    // Connection lost, refused, reset, or timed out — nothing to do with the query.
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up/i.test(message) ||
    // Postgres class 08 (connection exception) and 53300 (too many connections).
    /\b(08[0-9A-Z]{3}|53300)\b/.test(message) ||
    /statement timeout|canceling statement/i.test(message)
  );
}

/**
 * HTTP statuses from a model API that a retry can plausibly fix: rate limits
 * and the provider being overloaded or briefly down.
 *
 * MEASURED: the first scripture eval after ingestion finished died on one
 * `503 Service Unavailable — "This model is currently experiencing high
 * demand"` from Gemini, twenty-five minutes in, with no retry. The same
 * request fails a real reader the same way. 400/401/403/404 are left out on
 * purpose: a bad request or key fails identically every time.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * How long to wait before retry `attempt` (0-based): the server's Retry-After
 * when it sends a sane one, else exponential backoff with jitter, capped.
 */
export function backoffMs(attempt: number, retryAfter?: string | null, random = Math.random): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 30) return seconds * 1000;
  const base = Math.min(8000, 1000 * 2 ** attempt);
  return Math.round(base * (0.75 + random() * 0.5));
}
