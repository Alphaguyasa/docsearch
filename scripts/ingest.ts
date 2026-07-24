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

type StoreResult = "ingested" | "skipped";

async function storeFile(
  db: Db,
  embedDocuments: EmbedDocuments,
  parsed: ParsedFile,
  chunks: Chunk[],
  force: boolean,
): Promise<StoreResult> {
  // Idempotency: (filename, byte_size) is unique — skip unless --force.
  const existing = await db
    .from("documents")
    .select("id")
    .eq("filename", parsed.filename)
    .eq("byte_size", parsed.byteSize)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Lookup failed for ${parsed.filename}: ${existing.error.message}`);
  }

  if (existing.data) {
    if (!force) {
      console.log("    already ingested — skipping (use --force to re-ingest)");
      return "skipped";
    }
    // --force: delete the old document; chunks cascade via the FK.
    const del = await db.from("documents").delete().eq("id", existing.data.id);
    if (del.error) {
      throw new Error(`Failed to delete existing ${parsed.filename}: ${del.error.message}`);
    }
  }

  // Embed BEFORE writing the document row, so a dimension mismatch (asserted in
  // embed.ts) aborts the file cleanly rather than leaving an empty document.
  const embeddings = await embedDocuments(chunks.map((c) => c.content));

  const doc = await db
    .from("documents")
    .insert({
      title: basename(parsed.filename, extname(parsed.filename)),
      filename: parsed.filename,
      byte_size: parsed.byteSize,
      page_count: parsed.totalPages,
    })
    .select("id")
    .single();
  if (doc.error) throw new Error(`Insert failed for ${parsed.filename}: ${doc.error.message}`);

  await insertChunks(db, doc.data.id, chunks, embeddings);
  return "ingested";
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
  if (!args.dryRun) {
    await import("../src/lib/loadenv"); // must run before env.ts validates
    ({ db } = await import("../src/lib/db"));
    ({ embedDocuments } = await import("../src/lib/embed"));
  }

  let ingested = 0;
  let skippedFiles = 0;
  let totalChunks = 0;

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
    totalChunks += chunks.length;

    if (args.dryRun) continue;

    const result = await storeFile(db!, embedDocuments!, parsed, chunks, args.force);
    if (result === "skipped") skippedFiles++;
    else ingested++;
  }

  console.log(
    args.dryRun
      ? `Dry run complete: ${pdfs.length} files, ${totalChunks} chunks (no writes).`
      : `Done: ${ingested} ingested, ${skippedFiles} skipped, ${totalChunks} chunks written.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
