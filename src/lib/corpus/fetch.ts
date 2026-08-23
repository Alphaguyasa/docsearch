/**
 * Turning a catalog `Source` into bytes on disk.
 *
 * Four upstreams, four URL shapes, and one of them ships a zip. This module
 * owns all of that so the fetch script stays a driver and the catalog stays
 * pure data.
 *
 * ETIQUETTE IS NOT OPTIONAL HERE. These are small, donation-funded archives —
 * CCEL and the Internet Archive are libraries, not CDNs — and this corpus is
 * ~200MB across ~60 files. Every request is serialised behind one lock with a
 * delay between calls, sends a User-Agent that identifies the project and a way
 * to contact its author, and resumes rather than re-downloading. There is no
 * concurrency anywhere in this file, on purpose.
 */
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import type { Source, Work } from "./types";

export const USER_AGENT =
  "orthodox-corpus/1.0 (public-domain Orthodox text corpus; " +
  "https://github.com/Alphaguyasa/docsearch)";

/** Minimum gap between two requests to the same host. */
export const REQUEST_DELAY_MS = 2500;

/**
 * CCEL serves multi-megabyte volumes slowly — measured at roughly 5–15 KB/s on
 * a cold cache, so a 5MB volume can legitimately take several minutes. A short
 * timeout here does not fail fast, it fails wrongly: it aborts a download that
 * was working and would have finished.
 */
export const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

/** The URL a source is fetched from. */
export function sourceUrl(source: Source): string {
  switch (source.kind) {
    case "ccel": {
      // CCEL renders one plain-text file per volume under /cache/, named after
      // the last path segment: schaff/anf01 -> .../anf01/cache/anf01.txt
      const slug = source.ref.split("/").pop();
      return `https://ccel.org/ccel/${source.ref}/cache/${slug}.txt`;
    }
    case "archive":
      return `https://archive.org/download/${source.identifier}/${source.identifier}_djvu.txt`;
    case "gutenberg":
      return `https://www.gutenberg.org/cache/epub/${source.ebookId}/pg${source.ebookId}.txt`;
    case "ebible":
      // "Verse per line": one file per book, each line "BOOK C:V text".
      return `https://ebible.org/Scriptures/${source.translationId}_vpl.zip`;
  }
}

/** Where a work's text lands on disk, relative to the corpus directory. */
export function workFilename(work: Work): string {
  return `${work.id}.txt`;
}

export interface FetchOutcome {
  ok: boolean;
  status: number | null;
  bytes: number;
  reason?: string;
}

/**
 * Check that a source resolves, without downloading it.
 *
 * Uses a 600-byte range request rather than HEAD: the Internet Archive answers
 * HEAD for `_djvu.txt` on items that have no derived text at all, so a HEAD
 * check reports success for an identifier that will 404 on GET. Asking for real
 * bytes is the only check that distinguishes the two, and 600 bytes is also
 * enough to see whether an OCR file is a scan of the right book.
 */
export async function verifySource(source: Source): Promise<FetchOutcome & { head: string }> {
  const url = sourceUrl(source);
  try {
    const res = await withRetry(url, () =>
      fetch(url, {
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-599" },
        signal: AbortSignal.timeout(60_000),
        redirect: "follow",
      }),
    );
    const buf = new Uint8Array(await res.arrayBuffer());
    // A range request answers 206; a server that ignores Range answers 200.
    const ok = res.status === 200 || res.status === 206;
    // content-range is "bytes 0-599/1622946" — the total is what we want.
    const total = Number(res.headers.get("content-range")?.split("/")[1]) || buf.byteLength;
    const head = new TextDecoder("utf-8", { fatal: false })
      .decode(buf.subarray(0, 200))
      .replace(/\s+/g, " ")
      .trim();
    return { ok, status: res.status, bytes: total, head };
  } catch (err) {
    return { ok: false, status: null, bytes: 0, head: "", reason: errorMessage(err) };
  }
}

/**
 * Retry a request that failed for a reason likely to clear on its own.
 *
 * WHAT THIS IS FOR, concretely: a first pass over the catalog had exactly one
 * volume fail — anf01 — with a dropped connection, while the 37 volumes fetched
 * either side of it from the same host succeeded. Archive.org separately
 * answers 503 under load. Neither says anything is wrong with the catalog, but
 * without retries both look identical to "this identifier is broken", and the
 * only way to tell them apart is to run the whole thing again.
 *
 * Retried: network-level failures, 429, and 5xx. NOT retried: 404 and the other
 * 4xx, which mean the catalog entry is wrong and no amount of waiting fixes it.
 * Backoff is long because these are libraries under load, and hammering a host
 * that just said "slow down" is how a corpus fetcher becomes an abuse report.
 */
const RETRIES = 3;
const BACKOFF_MS = 5000;

async function withRetry(url: string, call: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let problem: string;
    try {
      const res = await call();
      if (res.status !== 429 && res.status < 500) return res;
      problem = `HTTP ${res.status} ${res.statusText}`;
    } catch (err) {
      problem = errorMessage(err);
    }

    if (attempt >= RETRIES) throw new Error(`${problem} for ${url}`);
    const waitMs = BACKOFF_MS * 2 ** attempt;
    console.warn(`      ${problem} — retrying in ${waitMs / 1000}s (${attempt + 1}/${RETRIES})`);
    await sleep(waitMs);
  }
}

/** Download a URL in full, as bytes. Throws on any non-2xx. */
export async function download(url: string): Promise<Uint8Array> {
  const res = await withRetry(url, () =>
    fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "follow",
    }),
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

/**
 * Read the entries of a zip archive.
 *
 * Written by hand rather than adding a dependency, for the same reason
 * CLAUDE.md forbids SDK wrappers around the embedding and LLM APIs: one caller
 * (eBible's verse-per-line bundles) does not justify a third-party package in
 * the dependency tree of a site that otherwise takes no untrusted input.
 *
 * Deliberately minimal — it handles the two compression methods eBible uses
 * (stored and deflate) and refuses anything else loudly. It is NOT a general
 * zip library: no zip64, no encryption, no multi-disk.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

export function readZip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  // The End Of Central Directory record sits at the very end, after a trailing
  // comment of unknown length, so it has to be scanned for backwards.
  let eocd = -1;
  for (let i = zip.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive: no end-of-central-directory record.");

  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true); // offset of central directory

  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pointer, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`Corrupt zip: bad central directory signature at entry ${i}.`);
    }
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = new TextDecoder().decode(zip.subarray(pointer + 46, pointer + 46 + nameLength));

    // The local header repeats the name and extra fields, and its extra field
    // length often DIFFERS from the central one — reading the central value
    // here is a classic way to land in the middle of the data.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = zip.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.push({ name, data: raw });
    } else if (method === 8) {
      entries.push({ name, data: new Uint8Array(inflateRawSync(raw)) });
    } else {
      throw new Error(`Unsupported zip compression method ${method} for "${name}".`);
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Flatten an eBible verse-per-line bundle into one text file.
 *
 * The bundle holds one .txt per biblical book plus copyright and about pages.
 * Each scripture line looks like "GEN 1:1 In the beginning..." — that prefix is
 * the whole reason this source was chosen over a flat Bible text, so it is
 * preserved verbatim. Ingestion parses it back out into a real reference.
 *
 * Book order matters and zip order does not guarantee it, so entries are sorted
 * by filename, which eBible numbers in canonical order.
 */
export function flattenEbible(zip: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const books = readZip(zip)
    .filter((e) => e.name.endsWith(".txt") && !e.name.includes("/"))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (books.length === 0) {
    throw new Error("eBible archive contained no book files.");
  }
  return books.map((b) => decoder.decode(b.data).trim()).join("\n");
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Sleep, for the inter-request delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
