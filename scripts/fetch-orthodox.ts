/**
 * Orthodox corpus fetcher — download the catalogued public-domain texts.
 *
 *   npm run corpus:verify                     # check every source resolves; downloads nothing
 *   npm run corpus:orthodox                   # fetch everything missing
 *   npm run corpus:orthodox -- --only lxx-brenton,npnf204
 *   npm run corpus:orthodox -- --tradition oriental
 *   npm run corpus:orthodox -- --force        # re-download even if present
 *
 * RESUMABILITY IS THE POINT. This pulls ~200MB from two donation-funded
 * libraries at a deliberately slow, serialised pace; a full run takes a while
 * and will sometimes be interrupted. A file already on disk whose SHA-256
 * matches the manifest is skipped, so re-running costs one directory read
 * rather than another 200MB of someone else's bandwidth.
 *
 * The manifest (corpus/orthodox/manifest.json) records the id, source URL,
 * SHA-256 and byte size of everything fetched. Commit it, gitignore the texts:
 * anyone can rebuild a byte-identical corpus, and a silently changed upstream
 * file becomes a loud mismatch rather than a quiet shift in what the site says.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CATALOG, workById } from "../src/lib/corpus/catalog";
import {
  download,
  errorMessage,
  flattenEbible,
  REQUEST_DELAY_MS,
  sha256,
  sleep,
  sourceUrl,
  verifySource,
  workFilename,
} from "../src/lib/corpus/fetch";
import type { Tradition, Work } from "../src/lib/corpus/types";

const CORPUS_DIR = path.join("corpus", "orthodox");
const MANIFEST_FILE = path.join(CORPUS_DIR, "manifest.json");

interface ManifestEntry {
  id: string;
  title: string;
  file: string;
  url: string;
  sha256: string;
  bytes: number;
  fetchedAt: string;
}

interface Manifest {
  fetchedAt: string;
  entries: ManifestEntry[];
}

interface Args {
  verify: boolean;
  force: boolean;
  only: string[] | null;
  tradition: Tradition | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { verify: false, force: false, only: null, tradition: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--verify") args.verify = true;
    else if (flag === "--force") args.force = true;
    else if (flag === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only needs a comma-separated list of work ids.");
      args.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (flag === "--tradition") {
      const value = argv[++i];
      if (value !== "eastern" && value !== "oriental" && value !== "both") {
        throw new Error(`--tradition must be eastern, oriental or both (got "${value}").`);
      }
      args.tradition = value;
    } else if (flag.startsWith("--")) {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

function selectWorks(args: Args): Work[] {
  let works = CATALOG;
  if (args.only) {
    const missing = args.only.filter((id) => !workById(id));
    if (missing.length > 0) {
      throw new Error(`Unknown work id(s): ${missing.join(", ")}`);
    }
    const wanted = new Set(args.only);
    works = works.filter((w) => wanted.has(w.id));
  }
  if (args.tradition && args.tradition !== "both") {
    // A one-sided fetch still includes the shared inheritance: a corpus of
    // Oriental Orthodoxy without Athanasius or the Apostolic Fathers is not a
    // smaller corpus, it is a wrong one.
    works = works.filter((w) => w.tradition === args.tradition || w.tradition === "both");
  }
  return works;
}

function readManifest(): Manifest {
  if (!existsSync(MANIFEST_FILE)) return { fetchedAt: "", entries: [] };
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Manifest;
  } catch (err) {
    throw new Error(`Manifest at ${MANIFEST_FILE} is not readable JSON: ${errorMessage(err)}`);
  }
}

function writeManifest(entries: ManifestEntry[]): void {
  const manifest: Manifest = {
    fetchedAt: new Date().toISOString(),
    entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

function human(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

/**
 * Check every selected source without downloading it.
 *
 * Run this after editing the catalog and BEFORE a bulk fetch. Archive.org
 * identifiers are the fragile part: an item can exist, be the right book, and
 * still have no derived plain text, or be a lending-library scan whose text is
 * restricted. All three fail here in seconds instead of halfway through a
 * multi-hour download.
 */
async function verifyAll(works: Work[]): Promise<number> {
  console.log(`Verifying ${works.length} source(s)...\n`);
  let failures = 0;

  for (const work of works) {
    const result = await verifySource(work.source);
    if (result.ok) {
      console.log(`  ok    ${work.id.padEnd(24)} ${human(result.bytes).padStart(7)}  ${work.title.slice(0, 52)}`);
      // The first line of an OCR file is the fastest way to catch an identifier
      // that resolves but points at the wrong book.
      console.log(`        ${result.head.slice(0, 96)}`);
    } else {
      failures++;
      const why = result.reason ?? `HTTP ${result.status}`;
      console.log(`  FAIL  ${work.id.padEnd(24)} ${why}`);
      console.log(`        ${sourceUrl(work.source)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    failures === 0
      ? `\nAll ${works.length} sources resolve.`
      : `\n${failures} of ${works.length} sources FAILED — fix the catalog before fetching.`,
  );
  return failures;
}

/** Fetch one work and write it to disk. Returns the manifest entry. */
async function fetchWork(work: Work): Promise<ManifestEntry> {
  const url = sourceUrl(work.source);
  const raw = await download(url);

  // eBible ships a zip of per-book files; everything else is already text.
  const bytes =
    work.source.kind === "ebible"
      ? new TextEncoder().encode(flattenEbible(raw))
      : raw;

  const file = workFilename(work);
  writeFileSync(path.join(CORPUS_DIR, file), bytes);

  return {
    id: work.id,
    title: work.title,
    file,
    url,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * True when the file on disk already matches what the manifest recorded, so
 * there is nothing to re-download.
 */
function alreadyFetched(work: Work, manifest: Manifest): boolean {
  const entry = manifest.entries.find((e) => e.id === work.id);
  if (!entry) return false;
  const onDisk = path.join(CORPUS_DIR, entry.file);
  if (!existsSync(onDisk)) return false;
  // Size first — it is a stat() rather than reading and hashing megabytes.
  if (statSync(onDisk).size !== entry.bytes) return false;
  return sha256(new Uint8Array(readFileSync(onDisk))) === entry.sha256;
}

async function fetchAll(works: Work[], force: boolean): Promise<number> {
  const manifest = readManifest();
  const entries = new Map(manifest.entries.map((e) => [e.id, e]));

  const pending = force ? works : works.filter((w) => !alreadyFetched(w, manifest));
  const skipped = works.length - pending.length;

  console.log(
    `${works.length} work(s) selected; ${skipped} already present; ${pending.length} to fetch.\n` +
      `Requests are serialised with a ${REQUEST_DELAY_MS}ms gap — this is deliberate, and slow.\n`,
  );

  let failures = 0;
  let fetched = 0;
  for (const work of pending) {
    const started = Date.now();
    process.stdout.write(`  ${work.id.padEnd(24)} ...`);
    try {
      const entry = await fetchWork(work);
      entries.set(entry.id, entry);
      fetched++;
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`\r  ${work.id.padEnd(24)} ${human(entry.bytes).padStart(7)}  ${secs}s`);
      // Written after every file, not at the end: a run that dies partway must
      // still leave a manifest that describes what is actually on disk, or the
      // next run re-downloads everything it already has.
      writeManifest([...entries.values()]);
    } catch (err) {
      failures++;
      console.log(`\r  ${work.id.padEnd(24)} FAILED  ${errorMessage(err)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const total = [...entries.values()].reduce((sum, e) => sum + e.bytes, 0);
  console.log(
    `\nFetched ${fetched}, failed ${failures}, skipped ${skipped}. ` +
      `Corpus now ${human(total)} across ${entries.size} file(s).`,
  );
  if (failures > 0) {
    console.log("Re-run to retry the failures; everything already fetched is skipped.");
  }
  return failures;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const works = selectWorks(args);
  if (works.length === 0) {
    console.log("No works matched the given filters.");
    return;
  }

  mkdirSync(CORPUS_DIR, { recursive: true });

  const failures = args.verify ? await verifyAll(works) : await fetchAll(works, args.force);
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(errorMessage(err));
  process.exit(1);
});
