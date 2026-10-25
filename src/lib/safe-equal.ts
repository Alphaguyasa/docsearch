/**
 * Constant-time string compare. A plain `===` bails at the first differing
 * byte, so response latency leaks how much of a guessed secret is correct
 * and makes it recoverable one character at a time.
 *
 * Uses only TextEncoder (no node:crypto) so the edge middleware can import it.
 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  // Always walk the full expected length so the loop count doesn't vary with
  // the supplied value; the length mismatch is folded into the same result.
  let diff = av.length ^ bv.length;
  for (let i = 0; i < bv.length; i++) {
    diff |= (av[i] ?? 0) ^ bv[i];
  }
  return diff === 0;
}

/**
 * May this request run a cron route? Vercel cron sends
 * `Authorization: Bearer $CRON_SECRET` once that env var exists. While it is
 * unset the route stays open (the bot keeps posting until Alpha adds the
 * secret; NEEDS_APPROVAL #9); once set, anything without it is refused.
 */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return safeEqual(authorization ?? "", `Bearer ${secret}`);
}
