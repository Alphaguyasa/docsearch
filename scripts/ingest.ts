/**
 * Ingestion CLI — load PDFs from a folder into Postgres.
 *
 *   npm run ingest -- <folder> [--dry-run] [--force] [--strip-repeated]
 *
 *   --dry-run         parse + chunk + print stats; NO API calls, NO writes
 *   --force           re-ingest files already present (by filename + byte_size)
 *   --strip-repeated  strip running headers/footers before chunking (default off)
 *
 * Per-file output: filename, pages, chunks, mean tokens/chunk, elapsed.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import {
  chunkPages,
  stripRepeatedLines,
  type Chunk,
  type Page,
} from "../src/lib/chunk";
import { extractPdf, insertChunks } from "../src/lib/pipeline";

// Lazily-loaded module types (imported only on the live path, see main()).
type Db = typeof import("../src/lib/db").db;
type EmbedDocuments = typeof import("../src/lib/embed").embedDocuments;

interface Args {
  folder: string;
  dryRun: boolean;
  force: boolean;
  stripRepeated: boolean;
}

function parseArgs(argv: string[]): Args {
  let folder: string | undefined;
  let dryRun = false;
  let force = false;
  let stripRepeated = false;

  for (const arg of argv) {
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--force":
        force = true;
        break;
      case "--strip-repeated":
        stripRepeated = true;
        break;
      default:
        if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
        if (folder !== undefined) throw new Error(`Unexpected extra argument: ${arg}`);
        folder = arg;
    }
  }

  if (!folder) {
    throw new Error(
      "Usage: npm run ingest -- <folder> [--dry-run] [--force] [--strip-repeated]",
    );
  }
  return { folder, dryRun, force, stripRepeated };
}

interface ParsedFile {
  filename: string;
  byteSize: number;
  totalPages: number;
  pages: Page[]; // pages that passed the length filter
  skipped: number[]; // page numbers dropped as likely scanned
}

async function parseFile(path: string, stripRepeated: boolean): Promise<ParsedFile> {
  const filename = basename(path);
  const bytes = await readFile(path);
  // byte_size is REQUIRED: the unique (filename, byte_size) index depends on it.
  const byteSize = bytes.byteLength;

  const { totalPages, pages: kept, skipped } = await extractPdf(new Uint8Array(bytes));
  const pages = stripRepeated ? stripRepeatedLines(kept) : kept;
  return { filename, byteSize, totalPages, pages, skipped };
}

function meanTokens(chunks: Chunk[]): number {
  if (chunks.length === 0) return 0;
  const total = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
  return Math.round(total / chunks.length);
}

type StoreResult = "ingested" | "resumed" | "skipped";

/**
 * Chunks are embedded and written in slices of this many, so a crash loses at
 * most this much work. At ~3 requests/min a whole document can be an hour of
 * wall time; persisting only at the end would throw all of it away.
 */
const PERSIST_EVERY = 8;

/**
 * Store one file, resuming whatever is already in the database.
 *
 * The document row is created FIRST and chunks are appended as they embed, so
 * an interrupted run leaves a document with some of its chunks and the next run
 * continues from there. The old order (embed everything, then insert) meant a
 * crash at 95% lost the whole document — and worse, the (filename, byte_size)
 * skip then treated the empty document as complete on the next run.
 */
async function storeFile(
  db: Db,
  embedDocuments: EmbedDocuments,
  parsed: ParsedFile,
  chunks: Chunk[],
  force: boolean,
  progress: Progress,
): Promise<StoreResult> {
  const existing = await db
    .from("documents")
    .select("id")
    .eq("filename", parsed.filename)
    .eq("byte_size", parsed.byteSize)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Lookup failed for ${parsed.filename}: ${existing.error.message}`);
  }

  let documentId: string;

  if (existing.data && force) {
    // --force: delete and start over; chunks cascade via the FK.
    const del = await db.from("documents").delete().eq("id", existing.data.id);
    if (del.error) {
      throw new Error(`Failed to delete existing ${parsed.filename}: ${del.error.message}`);
    }
    documentId = await createDocument(db, parsed);
  } else if (existing.data) {
    documentId = existing.data.id;
  } else {
    documentId = await createDocument(db, parsed);
  }

  // Which chunk_index values are already stored? That, not the document row's
  // existence, is what "already done" means.
  const done = await db
    .from("chunks")
    .select("chunk_index")
    .eq("document_id", documentId)
    .returns<{ chunk_index: number }[]>();
  if (done.error) {
    throw new Error(`Chunk lookup failed for ${parsed.filename}: ${done.error.message}`);
  }
  const stored = new Set(done.data.map((r) => r.chunk_index));

  const pending = chunks
    .map((chunk, index) => ({ chunk, index }))
    .filter(({ index }) => !stored.has(index));

  if (pending.length === 0) {
    console.log(`    all ${chunks.length} chunk(s) already stored — skipping`);
    progress.chunksDone += chunks.length;
    return "skipped";
  }

  const resuming = stored.size > 0;
  if (resuming) {
    console.log(
      `    resuming — ${stored.size}/${chunks.length} chunk(s) already stored, ` +
        `${pending.length} to go`,
    );
  }
  progress.chunksDone += stored.size;

  for (let i = 0; i < pending.length; i += PERSIST_EVERY) {
    const slice = pending.slice(i, i + PERSIST_EVERY);
    const embeddings = await embedDocuments(slice.map((p) => p.chunk.content));

    // Insert with the ORIGINAL chunk_index, not the slice position, so resume
    // logic stays correct across runs.
    const rows = slice.map((p, j) => ({
      document_id: documentId,
      content: p.chunk.content,
      page_number: p.chunk.pageNumber,
      chunk_index: p.index,
      token_count: p.chunk.tokenCount,
      embedding: JSON.stringify(embeddings[j]),
    }));
    const ins = await db.from("chunks").insert(rows);
    if (ins.error) throw new Error(`Chunk insert failed: ${ins.error.message}`);

    progress.chunksDone += slice.length;
    progress.tokensDone += slice.reduce((sum, p) => sum + p.chunk.tokenCount, 0);
    progress.report();
  }

  // page_count is only known to be final once every chunk is in.
  await db
    .from("documents")
    .update({ page_count: parsed.totalPages, status: "complete" })
    .eq("id", documentId);

  return resuming ? "resumed" : "ingested";
}

async function createDocument(db: Db, parsed: ParsedFile): Promise<string> {
  const doc = await db
    .from("documents")
    .insert({
      title: basename(parsed.filename, extname(parsed.filename)),
      filename: parsed.filename,
      byte_size: parsed.byteSize,
      page_count: parsed.totalPages,
      status: "processing",
    })
    .select("id")
    .single();
  if (doc.error) throw new Error(`Insert failed for ${parsed.filename}: ${doc.error.message}`);
  return doc.data.id as string;
}

/**
 * Live progress with an ETA.
 *
 * A 2-hour run that prints nothing is indistinguishable from a hung one, so
 * this reports after every persisted slice. The ETA is driven by the rate
 * limits rather than observed throughput, because the limiter — not the network
 * — is what sets the pace.
 */
class Progress {
  chunksDone = 0;
  tokensDone = 0;
  private readonly startedAt = Date.now();

  constructor(
    readonly chunksTotal: number,
    readonly tokensTotal: number,
    private readonly estimate: (tokens: number, requests: number) => number,
    private readonly batchTokens: number,
  ) {}

  report(): void {
    const tokensLeft = Math.max(0, this.tokensTotal - this.tokensDone);
    const requestsLeft = Math.ceil(tokensLeft / this.batchTokens);
    const remainingMs = this.estimate(tokensLeft, requestsLeft);
    const elapsedMs = Date.now() - this.startedAt;
    const pct = this.chunksTotal === 0 ? 100 : (this.chunksDone / this.chunksTotal) * 100;

    process.stdout.write(
      `\r    ${this.chunksDone}/${this.chunksTotal} chunks (${pct.toFixed(1)}%)  ` +
        `${this.tokensDone.toLocaleString()} tokens  ` +
        `elapsed ${formatDuration(elapsedMs)}  ` +
        `eta ${formatDuration(remainingMs)}          `,
    );
  }

  finish(): void {
    process.stdout.write("\n");
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const entries = await readdir(args.folder);
  const pdfs = entries.filter((f) => extname(f).toLowerCase() === ".pdf").sort();
  if (pdfs.length === 0) {
    console.log(`No PDFs found in ${args.folder}`);
    return;
  }

  const tags =
    (args.dryRun ? " [dry-run]" : "") +
    (args.force ? " [force]" : "") +
    (args.stripRepeated ? " [strip-repeated]" : "");
  console.log(`Ingesting ${pdfs.length} PDF(s) from ${args.folder}${tags}`);

  // Load env + db + embed lazily so --dry-run needs no credentials or network.
  let db: Db | undefined;
  let embedDocuments: EmbedDocuments | undefined;
  let estimateRemainingMs: ((tokens: number, requests: number) => number) | undefined;
  let limiterState: (() => { requestsMade: number; tokensSpent: number }) | undefined;

  if (!args.dryRun) {
    await import("../src/lib/loadenv"); // must run before env.ts validates
    ({ db } = await import("../src/lib/db"));
    const embed = await import("../src/lib/embed");
    embedDocuments = embed.embedDocuments;
    estimateRemainingMs = embed.estimateRemainingMs;
    limiterState = embed.limiterState;

    const { config } = await import("../src/lib/env");
    console.log(
      `Rate limits: ${config.VOYAGE_RPM} requests/min, ` +
        `${config.VOYAGE_TPM.toLocaleString()} tokens/min ` +
        `(override with VOYAGE_RPM / VOYAGE_TPM)`,
    );
  }

  // Parse and chunk EVERYTHING first. Two reasons: the ETA needs the real total
  // up front, and parsing is free — spending a minute on it beats discovering
  // the scale two hours into an embedding run.
  interface Prepared {
    parsed: ParsedFile;
    chunks: Chunk[];
  }
  const prepared: Prepared[] = [];

  for (const name of pdfs) {
    const started = Date.now();
    const parsed = await parseFile(join(args.folder, name), args.stripRepeated);

    for (const p of parsed.skipped) {
      console.warn(
        `  ${parsed.filename}: page ${p} has too little text — likely scanned, skipped`,
      );
    }

    const chunks = chunkPages(parsed.pages);
    const elapsed = ((Date.now() - started) / 1000).toFixed(2);
    console.log(
      `  ${parsed.filename}: ${parsed.totalPages} pages, ${chunks.length} chunks, ` +
        `mean ${meanTokens(chunks)} tok/chunk, ${elapsed}s`,
    );
    prepared.push({ parsed, chunks });
  }

  const totalChunks = prepared.reduce((sum, p) => sum + p.chunks.length, 0);
  const totalTokens = prepared.reduce(
    (sum, p) => sum + p.chunks.reduce((s, c) => s + c.tokenCount, 0),
    0,
  );

  if (args.dryRun) {
    console.log(
      `Dry run complete: ${pdfs.length} files, ${totalChunks} chunks, ` +
        `~${totalTokens.toLocaleString()} tokens (no writes).`,
    );
    return;
  }

  const progress = new Progress(totalChunks, totalTokens, estimateRemainingMs!, 3000);
  console.log(
    `\n${totalChunks} chunks, ~${totalTokens.toLocaleString()} tokens. ` +
      `Estimated embedding time: ${formatDuration(
        estimateRemainingMs!(totalTokens, Math.ceil(totalTokens / 3000)),
      )}.`,
  );
  console.log("Safe to interrupt — re-running resumes from the last stored chunk.\n");

  let ingested = 0;
  let resumed = 0;
  let skippedFiles = 0;

  for (const { parsed, chunks } of prepared) {
    console.log(`  ${parsed.filename}`);
    const result = await storeFile(
      db!,
      embedDocuments!,
      parsed,
      chunks,
      args.force,
      progress,
    );
    progress.finish();

    if (result === "skipped") skippedFiles++;
    else if (result === "resumed") resumed++;
    else ingested++;
  }

  const spent = limiterState!();
  console.log(
    `\nDone: ${ingested} ingested, ${resumed} resumed, ${skippedFiles} already complete.\n` +
      `      ${progress.chunksDone}/${totalChunks} chunks stored, ` +
      `${spent.tokensSpent.toLocaleString()} tokens across ${spent.requestsMade} request(s).`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
