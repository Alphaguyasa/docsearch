/**
 * Token-bucket rate limiter for provider API calls.
 *
 * Two buckets that must BOTH admit a call: requests-per-minute and
 * tokens-per-minute. Whichever is scarcer binds. A free Voyage account allows
 * 3 requests/min and 10,000 tokens/min, so a naive loop 429s on the first
 * document; this makes the caller wait instead of fail.
 *
 * The clock is injectable so the waiting logic can be tested in microseconds
 * rather than by actually sleeping through a simulated hour.
 */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface RateLimiterOptions {
  /** Requests per minute. */
  rpm: number;
  /** Tokens per minute. */
  tpm: number;
  clock?: Clock;
}

interface Bucket {
  capacity: number;
  available: number;
  /** Units restored per millisecond. */
  refillPerMs: number;
}

export interface LimiterState {
  requestsAvailable: number;
  tokensAvailable: number;
  totalWaitedMs: number;
  requestsMade: number;
  tokensSpent: number;
}

export class RateLimiter {
  private readonly clock: Clock;
  private readonly requests: Bucket;
  private readonly tokens: Bucket;
  private lastRefill: number;
  private totalWaitedMs = 0;
  private requestsMade = 0;
  private tokensSpent = 0;

  /**
   * Serialises acquisitions. Without this, two concurrent callers both see a
   * full bucket, both proceed, and the limit is exceeded — the exact bug a
   * limiter exists to prevent.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions) {
    if (options.rpm <= 0) throw new Error("rpm must be positive");
    if (options.tpm <= 0) throw new Error("tpm must be positive");

    this.clock = options.clock ?? systemClock;
    this.lastRefill = this.clock.now();

    // Buckets start FULL: a fresh minute genuinely allows a burst up to the
    // limit, and starting empty would add a pointless minute to every run.
    this.requests = {
      capacity: options.rpm,
      available: options.rpm,
      refillPerMs: options.rpm / 60_000,
    };
    this.tokens = {
      capacity: options.tpm,
      available: options.tpm,
      refillPerMs: options.tpm / 60_000,
    };
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.lastRefill = now;

    this.requests.available = Math.min(
      this.requests.capacity,
      this.requests.available + elapsed * this.requests.refillPerMs,
    );
    this.tokens.available = Math.min(
      this.tokens.capacity,
      this.tokens.available + elapsed * this.tokens.refillPerMs,
    );
  }

  /** Milliseconds until `need` units are available in `bucket`. */
  private waitFor(bucket: Bucket, need: number): number {
    if (bucket.available >= need) return 0;
    return Math.ceil((need - bucket.available) / bucket.refillPerMs);
  }

  /**
   * Block until one request carrying `tokens` may be sent, then consume the
   * budget. Returns how long it waited, for progress reporting.
   *
   * A request larger than the whole per-minute token budget can never be
   * admitted, so it throws rather than hanging forever — the caller must batch
   * smaller.
   */
  async acquire(tokens: number): Promise<number> {
    if (tokens > this.tokens.capacity) {
      throw new Error(
        `Request of ${tokens} tokens exceeds the ${this.tokens.capacity} tokens/min ` +
          `budget and can never be sent. Reduce the batch size, or raise VOYAGE_TPM.`,
      );
    }

    // Chain onto the queue so concurrent callers are admitted one at a time.
    const run = this.queue.then(() => this.acquireExclusive(tokens));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async acquireExclusive(tokens: number): Promise<number> {
    let waited = 0;

    // Loop rather than sleep-once: the clock may not advance exactly as
    // predicted, and a short sleep must not let an unfunded request through.
    for (;;) {
      this.refill();
      const wait = Math.max(this.waitFor(this.requests, 1), this.waitFor(this.tokens, tokens));
      if (wait <= 0) break;
      await this.clock.sleep(wait);
      waited += wait;
    }

    this.requests.available -= 1;
    this.tokens.available -= tokens;
    this.totalWaitedMs += waited;
    this.requestsMade += 1;
    this.tokensSpent += tokens;
    return waited;
  }

  /**
   * Drain both buckets and push the refill clock forward — used after a 429 so
   * the limiter does not immediately allow another call the provider has just
   * rejected.
   */
  penalise(ms: number): void {
    this.refill();
    this.requests.available = 0;
    this.tokens.available = 0;
    this.lastRefill = this.clock.now() + ms;
  }

  get state(): LimiterState {
    return {
      requestsAvailable: this.requests.available,
      tokensAvailable: this.tokens.available,
      totalWaitedMs: this.totalWaitedMs,
      requestsMade: this.requestsMade,
      tokensSpent: this.tokensSpent,
    };
  }

  /**
   * Lower bound on the milliseconds needed to send `tokens` more tokens across
   * `requests` more calls, given the limits. Used for the ingest ETA.
   */
  estimateRemainingMs(tokens: number, requests: number): number {
    const byTokens = (tokens / this.tokens.capacity) * 60_000;
    const byRequests = (requests / this.requests.capacity) * 60_000;
    return Math.max(0, Math.max(byTokens, byRequests));
  }
}

/**
 * Split texts into batches that fit a per-request token budget.
 *
 * At 3 requests/min and 10,000 tokens/min, a request carrying one 200-token
 * chunk wastes a third of the minute's request budget. Packing to ~3,000 tokens
 * uses all three slots against the full token budget instead.
 *
 * A single text larger than the budget is emitted alone rather than dropped —
 * the caller's limiter decides whether it is sendable at all.
 */
export function batchByTokens<T>(
  items: T[],
  tokensOf: (item: T) => number,
  maxTokensPerBatch: number,
  maxItemsPerBatch: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentTokens = 0;

  for (const item of items) {
    const tokens = tokensOf(item);

    if (current.length > 0 && (currentTokens + tokens > maxTokensPerBatch || current.length >= maxItemsPerBatch)) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(item);
    currentTokens += tokens;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
