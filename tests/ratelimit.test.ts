import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { batchByTokens, RateLimiter, type Clock } from "../src/lib/ratelimit";

/**
 * Virtual clock: `sleep` jumps time forward instead of waiting. A limiter that
 * paces a two-hour ingest can then be tested in microseconds, and the assertions
 * are exact rather than tolerance-based against a real timer.
 */
class FakeClock implements Clock {
  private t = 0;
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.t += ms;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

describe("RateLimiter — request budget", () => {
  it("admits a full burst immediately from a fresh bucket", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock });

    for (let i = 0; i < 3; i++) {
      assert.equal(await limiter.acquire(100), 0);
    }
    assert.equal(clock.now(), 0);
  });

  it("makes the fourth request wait for a refilled slot", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock });

    for (let i = 0; i < 3; i++) await limiter.acquire(100);
    const waited = await limiter.acquire(100);

    // One slot refills every 60/3 = 20 seconds.
    assert.equal(waited, 20_000);
    assert.equal(clock.now(), 20_000);
  });

  it("does not wait when enough time has already passed", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock });

    for (let i = 0; i < 3; i++) await limiter.acquire(100);
    clock.advance(60_000);

    assert.equal(await limiter.acquire(100), 0);
  });

  it("never lets the bucket refill beyond its capacity", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock });

    clock.advance(10 * 60_000); // ten idle minutes
    for (let i = 0; i < 3; i++) assert.equal(await limiter.acquire(1), 0);

    // Only three slots were ever available, however long it idled.
    assert.equal(await limiter.acquire(1), 20_000);
  });
});

describe("RateLimiter — token budget", () => {
  it("waits when tokens are scarce even though a request slot is free", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 100, tpm: 10_000, clock });

    await limiter.acquire(10_000); // drains the token bucket
    const waited = await limiter.acquire(5_000);

    // 5,000 tokens at 10,000/min refills in exactly 30 seconds.
    assert.equal(waited, 30_000);
  });

  it("binds on whichever budget is scarcer", async () => {
    const clock = new FakeClock();
    // Request-bound: plenty of tokens, only one request a minute.
    const limiter = new RateLimiter({ rpm: 1, tpm: 1_000_000, clock });

    await limiter.acquire(10);
    assert.equal(await limiter.acquire(10), 60_000);
  });

  it("rejects a request larger than the whole per-minute budget", async () => {
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock: new FakeClock() });
    // Waiting would never help — this must fail loudly, not hang.
    await assert.rejects(() => limiter.acquire(10_001), /can never be sent/);
  });

  it("admits a request exactly at the budget", async () => {
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock: new FakeClock() });
    assert.equal(await limiter.acquire(10_000), 0);
  });
});

describe("RateLimiter — concurrency", () => {
  it("serialises concurrent callers instead of admitting them together", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 2, tpm: 10_000, clock });

    // Without serialisation all four see a full bucket and the limit is blown.
    const waits = await Promise.all([
      limiter.acquire(100),
      limiter.acquire(100),
      limiter.acquire(100),
      limiter.acquire(100),
    ]);

    assert.equal(waits[0], 0);
    assert.equal(waits[1], 0);
    assert.ok(waits[2] > 0, "third caller should have waited");
    assert.ok(waits[3] > 0, "fourth caller should have waited");
    assert.equal(limiter.state.requestsMade, 4);
  });
});

describe("RateLimiter — penalise", () => {
  it("drains both buckets and defers refill after a 429", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock });

    limiter.penalise(30_000);
    const waited = await limiter.acquire(100);

    // The provider said we are over; local accounting must catch up before
    // anything else is sent.
    assert.ok(waited >= 30_000, `expected >= 30000, got ${waited}`);
  });
});

describe("RateLimiter — accounting and estimates", () => {
  it("tracks requests, tokens and cumulative wait", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock });

    await limiter.acquire(1_000);
    await limiter.acquire(2_000);

    assert.equal(limiter.state.requestsMade, 2);
    assert.equal(limiter.state.tokensSpent, 3_000);
  });

  it("estimates remaining time from whichever limit binds", () => {
    const limiter = new RateLimiter({ rpm: 3, tpm: 10_000, clock: new FakeClock() });

    // 20,000 tokens at 10,000/min = 2 minutes; 6 requests at 3/min = 2 minutes.
    assert.equal(limiter.estimateRemainingMs(20_000, 6), 120_000);
    // Request-bound: 30 requests at 3/min = 10 minutes, beating the token time.
    assert.equal(limiter.estimateRemainingMs(1_000, 30), 600_000);
    assert.equal(limiter.estimateRemainingMs(0, 0), 0);
  });

  it("rejects non-positive limits", () => {
    assert.throws(() => new RateLimiter({ rpm: 0, tpm: 10 }), /rpm must be positive/);
    assert.throws(() => new RateLimiter({ rpm: 1, tpm: 0 }), /tpm must be positive/);
  });
});

describe("batchByTokens", () => {
  const tokensOf = (n: number): number => n;

  it("packs items up to the token budget", () => {
    assert.deepEqual(batchByTokens([1000, 1000, 1000, 1000], tokensOf, 3000, 100), [
      [1000, 1000, 1000],
      [1000],
    ]);
  });

  it("also respects the item-count cap", () => {
    assert.deepEqual(batchByTokens([1, 1, 1, 1, 1], tokensOf, 10_000, 2), [
      [1, 1],
      [1, 1],
      [1],
    ]);
  });

  it("emits an oversized item alone rather than dropping it", () => {
    assert.deepEqual(batchByTokens([5000, 100], tokensOf, 3000, 100), [[5000], [100]]);
  });

  it("returns nothing for no items", () => {
    assert.deepEqual(batchByTokens([], tokensOf, 3000, 100), []);
  });

  it("preserves order, so embeddings stay aligned with their chunks", () => {
    const batches = batchByTokens([1500, 1500, 1500, 1500], tokensOf, 3000, 100);
    assert.deepEqual(batches.flat(), [1500, 1500, 1500, 1500]);
  });

  it("packs a realistic ingest efficiently", () => {
    // 100 chunks of ~200 tokens: 20,000 tokens should need 7 requests at a
    // 3,000-token budget, not 100 — that is the whole point of packing.
    const chunks = Array<number>(100).fill(200);
    const batches = batchByTokens(chunks, tokensOf, 3000, 100);
    assert.equal(batches.length, 7);
  });
});
