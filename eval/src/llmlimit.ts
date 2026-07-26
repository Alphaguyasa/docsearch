/**
 * Proactive pacing and retry policy for LLM calls. PURE LOGIC + an injectable
 * clock — no network here, so the waiting behaviour is testable in
 * microseconds instead of by sleeping through a simulated hour.
 *
 * WHY PROACTIVE. The previous policy was purely reactive: fire as fast as the
 * loop allows, then back off once the provider complains. Against a free-tier
 * Gemini key at 15 requests/min that means most requests are rejected, and each
 * rejection still costs a round trip and a unit of daily quota. Spacing requests
 * BELOW the known limit turns a run that thrashes against 429s into one that
 * simply proceeds — see DEFAULT_LLM_RPM for why below, not at.
 *
 * WHY retryDelay MATTERS. Gemini's 429 body carries a `RetryInfo` detail saying
 * exactly how long to wait. The old exponential backoff topped out at 16s while
 * the API was asking for 49s, so every retry was sent early, was rejected again,
 * and the call failed having never once waited long enough to succeed.
 */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Requests per minute, default. One every 5 seconds.
 *
 * DELIBERATELY BELOW the free-tier ceiling of 15, not at it. Pacing at exactly
 * 15 was measured overshooting to a peak of 17: retries re-enter the pacer as
 * fresh requests, and scheduling jitter lets two slots land inside the same
 * observed minute even though each was spaced correctly. A limiter set to the
 * limit has no room to absorb either.
 *
 * The margin costs ~2.3 minutes on a 140-request run (139 gaps at 5s vs 4s) —
 * cheap next to a 429 storm, and cheaper still than the daily quota a rejected
 * request spends anyway. Raise via LLM_RPM on a billed key.
 */
export const DEFAULT_LLM_RPM = 12;

/** Retry ceiling. A single wait longer than this means the quota is not per-minute. */
export const MAX_BACKOFF_MS = 120_000;

/** At least 8, per the free-tier retry policy: a 49s ask needs room to be honoured. */
export const MAX_RETRIES = 8;

/**
 * Spaces request starts by a fixed interval.
 *
 * Deliberately NOT a classic token bucket with a full initial burst. A bucket
 * that starts full lets a whole minute's worth of calls fire back-to-back; that
 * is within a per-minute budget on paper, but providers enforce over shorter
 * windows too, and the burst is what trips them. Even spacing is what an rpm
 * limit means in practice.
 */
export class RequestPacer {
  private readonly intervalMs: number;
  private readonly clock: Clock;
  /** Earliest time the next request may start. */
  private nextAllowedAt: number;
  private waitedMs = 0;
  private requests = 0;

  /** Serialises waiters so two callers cannot claim the same slot. */
  private queue: Promise<void> = Promise.resolve();

  constructor(rpm: number = DEFAULT_LLM_RPM, clock: Clock = systemClock) {
    if (!Number.isFinite(rpm) || rpm <= 0) {
      throw new Error(`LLM_RPM must be a positive number, got ${rpm}`);
    }
    this.intervalMs = Math.ceil(60_000 / rpm);
    this.clock = clock;
    // The first request goes immediately; spacing starts after it.
    this.nextAllowedAt = clock.now();
  }

  get spacingMs(): number {
    return this.intervalMs;
  }

  get state(): { requests: number; waitedMs: number } {
    return { requests: this.requests, waitedMs: this.waitedMs };
  }

  /** Block until the next request may be sent. Returns how long it waited. */
  async acquire(): Promise<number> {
    const run = this.queue.then(() => this.acquireExclusive());
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async acquireExclusive(): Promise<number> {
    const wait = Math.max(0, this.nextAllowedAt - this.clock.now());
    if (wait > 0) {
      await this.clock.sleep(wait);
      this.waitedMs += wait;
    }
    // Anchor to the later of "now" and the scheduled slot so a long provider-side
    // stall doesn't leave a backlog of slots that fire all at once afterwards.
    this.nextAllowedAt = Math.max(this.clock.now(), this.nextAllowedAt) + this.intervalMs;
    this.requests += 1;
    return wait;
  }

  /**
   * Push the next allowed time out by `ms` after a 429. Without this the pacer
   * would happily release another call the provider has just rejected.
   */
  penalise(ms: number): void {
    this.nextAllowedAt = Math.max(this.nextAllowedAt, this.clock.now() + ms);
  }
}

/**
 * Milliseconds the provider asked us to wait, from a 429 body.
 *
 * Gemini returns `{"error":{"details":[{"@type":"...RetryInfo","retryDelay":"49s"}]}}`.
 * Parsed structurally first, then by regex — the shape has changed before, and a
 * missed retryDelay silently reverts to backoff that is too short.
 */
export function parseRetryDelayMs(body: string): number | null {
  if (!body) return null;

  const fromDuration = (value: unknown): number | null => {
    if (typeof value !== "string") return null;
    const match = value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
    if (!match) return null;
    const seconds = Number(match[1]);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : null;
  };

  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: { "@type"?: string; retryDelay?: unknown }[] };
    };
    for (const detail of parsed.error?.details ?? []) {
      const ms = fromDuration(detail.retryDelay);
      if (ms !== null) return ms;
    }
  } catch {
    // Not JSON, or not the shape expected — fall through to the regex.
  }

  return fromDuration(body.match(/"retryDelay":\s*"([^"]+)"/)?.[1]);
}

/**
 * Exponential backoff, used ONLY when the provider gave no retryDelay.
 * 4s, 8s, 16s, 32s, 64s, then capped at 120s. Jittered so parallel callers do
 * not retry in lockstep.
 */
export function backoffMs(attempt: number, jitter: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 4_000 * 2 ** attempt);
  return Math.round(base + jitter() * 1_000);
}

/** How long to wait before retry `attempt`, preferring the provider's own ask. */
export function retryWaitMs(
  body: string,
  attempt: number,
  jitter: () => number = Math.random,
): { ms: number; source: "provider" | "backoff" } {
  const asked = parseRetryDelayMs(body);
  if (asked !== null) {
    // Honour it even when it exceeds the backoff ceiling: the ceiling exists to
    // bound OUR guesses, not to overrule the provider telling us the real number.
    return { ms: asked, source: "provider" };
  }
  return { ms: backoffMs(attempt, jitter), source: "backoff" };
}

/**
 * Does this 429 describe a per-DAY quota?
 *
 * A per-minute 429 is traffic shaping worth waiting out; a per-day cap is a wall
 * that no amount of retrying inside this run will clear. Matching is broad
 * because the phrasing varies across quota families — a missed match burns eight
 * retries and 10 minutes to arrive at the same failure.
 */
export function dailyQuotaViolation(
  body: string,
): { quotaId: string; quotaValue: string | null } | null {
  const looksDaily = /PerDay/i.test(body) || /per day/i.test(body);
  if (!looksDaily) return null;

  const quotaId =
    body.match(/"quotaId":\s*"([^"]*PerDay[^"]*)"/i)?.[1] ??
    body.match(/"quotaId":\s*"([^"]+)"/)?.[1] ??
    "daily quota";
  const quotaValue = body.match(/"quotaValue":\s*"(\d+)"/)?.[1] ?? null;
  return { quotaId, quotaValue };
}
