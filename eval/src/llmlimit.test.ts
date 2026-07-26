import { describe, expect, it } from "vitest";

import {
  DEFAULT_LLM_RPM,
  MAX_BACKOFF_MS,
  RequestPacer,
  backoffMs,
  dailyQuotaViolation,
  parseRetryDelayMs,
  retryWaitMs,
  type Clock,
} from "./llmlimit";

/** Virtual clock: time only moves when something sleeps. */
function fakeClock(): Clock & { time: number } {
  const clock = {
    time: 0,
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.time += ms;
    },
  };
  return clock;
}

describe("RequestPacer", () => {
  it("defaults BELOW the free-tier ceiling, not at it", async () => {
    // Pacing at exactly 15 was measured peaking at 17/min: retries re-enter the
    // pacer as fresh requests and jitter lands two slots in one observed minute.
    // A limiter set to the limit has no room to absorb either.
    expect(DEFAULT_LLM_RPM).toBeLessThan(15);
    expect(new RequestPacer(DEFAULT_LLM_RPM, fakeClock()).spacingMs).toBe(5000);
  });

  it("lets the first request through immediately", async () => {
    const clock = fakeClock();
    const pacer = new RequestPacer(15, clock);
    expect(await pacer.acquire()).toBe(0);
  });

  it("spaces subsequent requests by 60s/rpm", async () => {
    const clock = fakeClock();
    const pacer = new RequestPacer(15, clock);

    await pacer.acquire();
    const waited = await pacer.acquire();

    // 15 rpm -> one every 4000ms.
    expect(pacer.spacingMs).toBe(4000);
    expect(waited).toBe(4000);
    expect(clock.time).toBe(4000);
  });

  it("does NOT burst: 15 calls at 15rpm span a full minute", async () => {
    // A token bucket starting full would let all 15 fire at t=0. Providers
    // enforce over shorter windows than a minute, and the burst is what trips
    // them — so even spacing is the point of this class.
    const clock = fakeClock();
    const pacer = new RequestPacer(15, clock);

    for (let i = 0; i < 15; i++) await pacer.acquire();

    expect(clock.time).toBe(14 * 4000);
    expect(pacer.state.requests).toBe(15);
  });

  it("does not queue up a backlog after an external stall", async () => {
    const clock = fakeClock();
    const pacer = new RequestPacer(15, clock);

    await pacer.acquire();
    clock.time += 60_000; // a long provider-side stall

    // The next two must still be spaced, not released back-to-back to "catch up".
    expect(await pacer.acquire()).toBe(0);
    expect(await pacer.acquire()).toBe(4000);
  });

  it("penalise pushes the next slot out", async () => {
    const clock = fakeClock();
    const pacer = new RequestPacer(15, clock);

    await pacer.acquire();
    pacer.penalise(49_000);

    expect(await pacer.acquire()).toBe(49_000);
  });

  it("serialises concurrent callers instead of double-booking a slot", async () => {
    const clock = fakeClock();
    const pacer = new RequestPacer(15, clock);

    await Promise.all([pacer.acquire(), pacer.acquire(), pacer.acquire()]);

    expect(clock.time).toBe(8000);
    expect(pacer.state.requests).toBe(3);
  });

  it("rejects a non-positive rpm rather than dividing by zero", () => {
    expect(() => new RequestPacer(0)).toThrow(/positive/);
    expect(() => new RequestPacer(Number.NaN)).toThrow(/positive/);
  });
});

describe("parseRetryDelayMs", () => {
  const body = JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "49s" },
      ],
    },
  });

  it("reads retryDelay from the RetryInfo detail", () => {
    expect(parseRetryDelayMs(body)).toBe(49_000);
  });

  it("handles fractional seconds", () => {
    expect(parseRetryDelayMs('{"error":{"details":[{"retryDelay":"1.5s"}]}}')).toBe(1500);
  });

  it("falls back to a regex when the body is not valid JSON", () => {
    expect(parseRetryDelayMs('garbage "retryDelay": "7s" trailing')).toBe(7000);
  });

  it("returns null when no retryDelay is present", () => {
    expect(parseRetryDelayMs('{"error":{"code":429}}')).toBeNull();
    expect(parseRetryDelayMs("")).toBeNull();
  });

  it("ignores a malformed duration rather than guessing", () => {
    expect(parseRetryDelayMs('{"error":{"details":[{"retryDelay":"soon"}]}}')).toBeNull();
    expect(parseRetryDelayMs('{"error":{"details":[{"retryDelay":"49"}]}}')).toBeNull();
  });
});

describe("backoffMs", () => {
  it("starts at 4s and doubles", () => {
    expect(backoffMs(0, () => 0)).toBe(4000);
    expect(backoffMs(1, () => 0)).toBe(8000);
    expect(backoffMs(2, () => 0)).toBe(16_000);
  });

  it("caps at the ceiling", () => {
    expect(backoffMs(20, () => 0)).toBe(MAX_BACKOFF_MS);
  });

  it("adds jitter so parallel callers do not retry in lockstep", () => {
    expect(backoffMs(0, () => 1)).toBe(5000);
  });
});

describe("retryWaitMs", () => {
  it("prefers the provider's retryDelay over backoff", () => {
    // The reported bug: backoff peaked at 16s while the API asked for 49s, so
    // every retry was sent early and the call could never succeed.
    const { ms, source } = retryWaitMs('{"error":{"details":[{"retryDelay":"49s"}]}}', 0);
    expect(ms).toBe(49_000);
    expect(source).toBe("provider");
  });

  it("honours a retryDelay even beyond the backoff ceiling", () => {
    const { ms } = retryWaitMs('{"error":{"details":[{"retryDelay":"300s"}]}}', 0);
    expect(ms).toBe(300_000);
  });

  it("falls back to exponential backoff when retryDelay is absent", () => {
    const { ms, source } = retryWaitMs("{}", 2, () => 0);
    expect(ms).toBe(16_000);
    expect(source).toBe("backoff");
  });
});

describe("dailyQuotaViolation", () => {
  it("detects a PerDay quota id", () => {
    const body = JSON.stringify({
      error: {
        details: [
          {
            violations: [
              {
                quotaId: "GenerateRequestsPerDayPerProjectPerModel",
                quotaValue: "20",
              },
            ],
          },
        ],
      },
    });
    expect(dailyQuotaViolation(body)).toEqual({
      quotaId: "GenerateRequestsPerDayPerProjectPerModel",
      quotaValue: "20",
    });
  });

  it("detects prose phrasing without a PerDay quota id", () => {
    // Missing this match burns 8 retries and ~10 minutes to reach the same failure.
    const result = dailyQuotaViolation('{"error":{"message":"Quota exceeded per day"}}');
    expect(result).not.toBeNull();
  });

  it("does not mistake a per-minute quota for a daily one", () => {
    const body = JSON.stringify({
      error: {
        details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProject" }] }],
      },
    });
    expect(dailyQuotaViolation(body)).toBeNull();
  });
});
