/**
 * PostgREST pagination helpers.
 *
 * THE BUG THESE EXIST TO PREVENT: Supabase caps every PostgREST response at
 * `db-max-rows` (1000 by default) and reports NO error when it truncates. A
 * plain `.select()` over a table with 2,134 rows returns 1,000 rows and a null
 * error, so the caller believes it has the whole table. Every count, sample,
 * and metric computed downstream is then quietly wrong — and nothing fails.
 *
 * Two rules for anything that expects a FULL result set:
 *   1. Page with `.range()` until a page comes back empty.
 *   2. Where a total is knowable, assert the loaded count against it.
 *
 * Paging REQUIRES a total order. `.range()` is an offset window over whatever
 * order the server chose, so without an `.order()` on a unique key (or a unique
 * tuple) rows can repeat on one page and vanish from another. Every caller here
 * orders by a primary key or a unique index.
 */
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Rows requested per page. Matches Supabase's default cap; the loop below does
 * not depend on this being right, which is the point — see `fetchAllRows`.
 */
export const PAGE_SIZE = 1000;

/**
 * Ids per `.in()` batch.
 *
 * Sized by URL LENGTH, not by the row cap. PostgREST puts the whole id list in
 * the query string, and a UUID costs ~39 bytes there once quoted and delimited,
 * so 500 ids builds a ~19 KB URL — well past the ~8 KB most servers accept. The
 * failure is not a clean 414 either: it surfaces as `TypeError: fetch failed`,
 * which reads like a network blip and is reproducible only at a large-enough id
 * count. 100 keeps the worst case near 4 KB.
 *
 * Also comfortably under PAGE_SIZE, so a filter matching several rows per id
 * still cannot fill a page and truncate.
 */
export const ID_BATCH_SIZE = 100;

interface PageResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

/**
 * Read every row a query matches, one page at a time.
 *
 * Advances by the number of rows actually returned rather than by PAGE_SIZE,
 * and stops only on an EMPTY page. A short page is not treated as the end:
 * if the server's `db-max-rows` is lower than PAGE_SIZE, every page is short,
 * and a `rows.length < PAGE_SIZE` stop condition would silently truncate at the
 * first page — reintroducing the exact bug this module exists to prevent.
 *
 * `page` must apply a deterministic total order.
 */
export async function fetchAllRows<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const out: T[] = [];

  for (let from = 0; ; ) {
    const res = await page(from, from + PAGE_SIZE - 1);
    if (res.error) {
      throw new Error(`${label}: read failed at offset ${from} — ${res.error.message}`);
    }

    const rows = res.data ?? [];
    if (rows.length === 0) break;

    out.push(...rows);
    from += rows.length;
  }

  return out;
}

/**
 * Read rows for a list of ids, in batches.
 *
 * A single `.in()` with thousands of ids is truncated at the row cap exactly
 * like any other select, and builds a URL long enough to be rejected outright.
 */
export async function fetchByIds<T>(
  label: string,
  ids: string[],
  page: (batch: string[]) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];

  for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) {
    const batch = unique.slice(i, i + ID_BATCH_SIZE);
    const res = await page(batch);
    if (res.error) {
      throw new Error(
        `${label}: read failed for ids ${i}..${i + batch.length - 1} — ${res.error.message}`,
      );
    }
    out.push(...(res.data ?? []));
  }

  return out;
}

/**
 * Throw unless `loaded` matches the authoritative `expected` count.
 *
 * The whole point of the assertion is that truncation is SILENT. A mismatch is
 * either a truncated read or a concurrent write; both make anything computed
 * from these rows untrustworthy, so neither may pass quietly.
 */
export function assertCompleteRead(
  label: string,
  loaded: number,
  expected: number,
): void {
  if (loaded === expected) return;

  throw new Error(
    `${label}: loaded ${loaded} row(s) but the table reports ${expected}. ` +
      (loaded < expected
        ? `The read was TRUNCATED — PostgREST caps responses at db-max-rows ` +
          `(${PAGE_SIZE} by default) and returns no error when it does. Page with ` +
          `fetchAllRows() from src/lib/paginate.ts.`
        : `More rows were loaded than the table reports, which means the paging ` +
          `order is not a total order and rows repeated across pages.`) +
      ` Refusing to continue: every metric computed from a partial corpus is wrong ` +
      `in a way nothing downstream can detect.`,
  );
}
