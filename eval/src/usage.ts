/**
 * Requests-per-day tracking, persisted across runs.
 *
 * A process-local counter would be useless here: the binding constraint on a
 * free tier is requests PER DAY, and a golden set is built across several
 * invocations. Knowing "this run made 40 calls" does not tell you whether the
 * next run will hit the wall; knowing "180 of 200 used today" does.
 *
 * Stored under eval/.cache/, which is already gitignored — this is machine-local
 * accounting, not a result.
 *
 * ON THE RESET BOUNDARY: Google resets free-tier quotas on its own schedule
 * (midnight Pacific), not at UTC midnight. Dates here are UTC, so the count can
 * roll over at a different moment than the provider's. It is a usage signal, not
 * an authority — the provider's own 429 remains the source of truth, which is
 * why QuotaExhaustedError is raised from the response rather than from this file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const USAGE_FILE = "eval/.cache/request-usage.json";

interface UsageFile {
  /** `${date}|${provider}:${model}` -> request count. */
  counts: Record<string, number>;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function keyFor(provider: string, model: string, date = todayUtc()): string {
  return `${date}|${provider}:${model}`;
}

function read(): UsageFile {
  if (!existsSync(USAGE_FILE)) return { counts: {} };
  try {
    const parsed = JSON.parse(readFileSync(USAGE_FILE, "utf8")) as UsageFile;
    return parsed.counts ? parsed : { counts: {} };
  } catch {
    // A corrupt counter must never break a run — it is accounting, not data.
    return { counts: {} };
  }
}

function write(usage: UsageFile): void {
  // Keep only the last 7 days so the file cannot grow without bound.
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(usage.counts)) {
    if (key.slice(0, 10) >= cutoff) counts[key] = value;
  }

  mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  writeFileSync(USAGE_FILE, JSON.stringify({ counts }, null, 2) + "\n");
}

/** Record one live request (cache hits must not be counted — they cost no quota). */
export function recordRequest(provider: string, model: string): number {
  const usage = read();
  const key = keyFor(provider, model);
  const next = (usage.counts[key] ?? 0) + 1;
  usage.counts[key] = next;
  write(usage);
  return next;
}

/** Live requests made today against this provider/model. */
export function requestsToday(provider: string, model: string): number {
  return read().counts[keyFor(provider, model)] ?? 0;
}
