/**
 * Content-hash disk cache for API calls.
 *
 * Keyed by SHA-256 of a CANONICAL JSON of every input that affects the output
 * (model, prompt, params). Canonical means recursively key-sorted: `{a,b}` and
 * `{b,a}` describe the same call and must hash the same, or the cache silently
 * misses on every re-run.
 *
 * This is the harness's main cost lever. Golden set generation and (later)
 * judge calls are identical across runs that didn't change them, so a re-run
 * should cost nothing. Phase 4 extends this with namespaces for embeddings and
 * judges; the `cached()` signature is already the one Phase 4 specifies.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CACHE_DIR = "eval/.cache";

let enabled = true;

/** `--no-cache` turns the cache into a pass-through (still writes entries). */
export function setCacheEnabled(value: boolean): void {
  enabled = value;
}

/** Recursively key-sorted JSON, so key order can never change the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

export function cacheKey(keyObj: unknown): string {
  return createHash("sha256").update(canonical(keyObj)).digest("hex");
}

export interface CacheStats {
  hits: number;
  misses: number;
}

const stats: CacheStats = { hits: 0, misses: 0 };

export function cacheStats(): CacheStats {
  return { ...stats };
}

/**
 * Return the cached value for `keyObj`, or call `fn` and cache its result.
 *
 * A corrupt cache entry is treated as a miss rather than throwing — a truncated
 * file from an interrupted write should not permanently break a namespace.
 */
export async function cached<T>(
  namespace: string,
  keyObj: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const hash = cacheKey(keyObj);
  const dir = path.join(CACHE_DIR, namespace);
  const file = path.join(dir, `${hash}.json`);

  if (enabled) {
    try {
      const hit = JSON.parse(readFileSync(file, "utf8")) as { value: T };
      stats.hits++;
      return hit.value;
    } catch {
      // Missing or unreadable — fall through and recompute.
    }
  }

  stats.misses++;
  const value = await fn();

  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ key: keyObj, cachedAt: new Date().toISOString(), value }, null, 2),
  );
  return value;
}
