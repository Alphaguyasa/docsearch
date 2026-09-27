/**
 * Ingest the downloaded Orthodox corpus into Postgres.
 *
 *   npm run ingest:orthodox -- --dry-run     # segment + chunk + report; no API calls, no writes
 *   npm run ingest:orthodox                  # ingest everything not yet complete
 *   npm run ingest:orthodox -- --only lxx-brenton,npnf204
 *   npm run ingest:orthodox -- --hours 3     # stop cleanly after roughly three hours
 *   npm run ingest:orthodox -- --force       # re-ingest works already complete
 *
 * TWO THINGS SHAPE THIS SCRIPT, AND BOTH ARE THE EMBEDDING RATE LIMIT.
 *
 * A Voyage free account allows 3 requests and 10,000 tokens per minute. This
 * corpus is roughly 44 million tokens — 101k chunks, counted by --dry-run
 * rather than estimated. That is about three days of continuous embedding, and
 * no amount of batching changes it — the limit is the product's, not the
 * code's. So:
 *
 *   1. WORKS ARE INGESTED IN PRIORITY ORDER, not catalog order. Scripture and
 *      the pastoral texts land first, so the site can answer real questions
 *      after an hour instead of after three days, and the long tail of patristic
 *      volumes fills in behind them.
 *
 *   2. EVERYTHING IS RESUMABLE AT CHUNK GRANULARITY. Rows are written batch by
 *      batch, and a re-run picks up at the first chunk index the database does
 *      not have. An interrupted run — a laptop closing, a 429 storm, --hours
 *      expiring — costs nothing but the batch in flight.
 *
 * Run it repeatedly. It is designed to be stopped.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { chunkPage, countTokens, type Chunk } from "../src/lib/chunk";
import { CATALOG, workById } from "../src/lib/corpus/catalog";
import { workFilename } from "../src/lib/corpus/fetch";
import {
  MIN_TEXT_QUALITY,
  segmentCcel,
  segmentEbible,
  segmentOcr,
  trimToTextStart,
  type Section,
} from "../src/lib/corpus/segment";
import type { Work } from "../src/lib/corpus/types";

type Db = typeof import("../src/lib/db").db;
type EmbedDocuments = typeof import("../src/lib/embed").embedDocuments;

const CORPUS_DIR = path.join("corpus", "orthodox");

/**
 * Chunk sizes, per kind of text.
 *
 * Scripture is chunked much smaller than prose on purpose. A question like
 * "who was raised from the dead" is answered by a few verses; padding them out
 * to a patristic-sized block pulls in unrelated narrative, which both blurs the
 * embedding and makes the citation less precise than the source allows. Prose
 * argument is the opposite — a Father's point takes a page to make, and cutting
 * it at 350 tokens hands the reader half a thought.
 */
const SCRIPTURE_TOKENS = 350;
const PROSE_TOKENS = 700;
const OVERLAP_RATIO = 0.15;

/** A chunk plus the citation metadata its section carries. */
interface OrthodoxChunk extends Chunk {
  reference: string | null;
  book: string | null;
}

interface Args {
  dryRun: boolean;
  force: boolean;
  only: string[] | null;
  hours: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, force: false, only: null, hours: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--force") args.force = true;
    else if (flag === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only needs a comma-separated list of work ids.");
      args.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (flag === "--hours") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--hours needs a positive number.");
      args.hours = value;
    } else if (flag.startsWith("--")) {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

/**
 * Ingestion order.
 *
 * Not alphabetical and not catalog order — this decides what the site can
 * answer first, and the ordering is a claim about what a person arriving with a
 * question most needs. Scripture, because nearly every answer wants to quote
 * it. Then the ascetic and pastoral writers, because someone asking about their
 * own despair or anger is served by the desert fathers and St John of Kronstadt
 * long before they are served by a treatise on the two natures. Then the
 * councils and canons, which settle the doctrinal questions people actually
 * type. Then the patristic bulk, then history.
 *
 * Within a tier, the smaller work goes first: it finishes sooner, and a
 * finished work is one more thing the site can cite.
 */
const CATEGORY_PRIORITY: Record<string, number> = {
  scripture: 0,
  deuterocanon: 1,
  ascetic: 2,
  liturgical: 3,
  council: 4,
  "canon-law": 4,
  patristic: 5,
  hagiography: 6,
  history: 7,
};

/** A work's own priority wins; otherwise its category decides. */
function priorityOf(work: Work): number {
  return work.priority ?? CATEGORY_PRIORITY[work.category] ?? 9;
}

function ingestOrder(works: Work[], sizes: Map<string, number>): Work[] {
  return [...works].sort((a, b) => {
    const byPriority = priorityOf(a) - priorityOf(b);
    if (byPriority !== 0) return byPriority;
    return (sizes.get(a.id) ?? 0) - (sizes.get(b.id) ?? 0);
  });
}

/** Read a fetched work from disk. Returns null when it was never downloaded. */
function readWork(work: Work): string | null {
  try {
    return readFileSync(path.join(CORPUS_DIR, workFilename(work)), "utf8");
  } catch {
    return null;
  }
}

/** Segment a work according to the shape of its upstream source. */
function segment(work: Work, raw: string): { sections: Section[]; dropped: string | null } {
  switch (work.source.kind) {
    case "ebible":
      return { sections: segmentEbible(raw), dropped: null };
    case "ccel": {
      // The volume title without its long subtitle — citations read better as
      // "NPNF2-13 — Demonstration VII" than with 90 characters of preamble.
      const short = work.title.split(":")[0].trim();
      return { sections: segmentCcel(raw, short), dropped: null };
    }
    case "archive":
    case "gutenberg": {
      const trimmed = trimToTextStart(raw, work.textStart);
      const { sections, rejected, rejectedChars, tooShort } = segmentOcr(
        trimmed.text,
        work.title.split(",")[0].trim(),
      );
      const notes: string[] = [];
      if (work.textStart && !trimmed.found) {
        // Loud, because the consequence is silent: the editorial introduction
        // gets ingested under the work's own metadata and is then quoted as
        // though it were the text.
        notes.push(`WARNING: textStart marker not found — front matter NOT trimmed`);
      } else if (trimmed.found) {
        const dropped = raw.length - trimmed.text.length;
        notes.push(`${(dropped / 1024).toFixed(0)}KB of front matter trimmed`);
      }
      if (tooShort > 0) notes.push(`${tooShort} short block(s) skipped (index/headings)`);
      if (rejected > 0) {
        notes.push(
          `${rejected} paragraph(s) / ${(rejectedChars / 1024).toFixed(0)}KB below OCR quality ${MIN_TEXT_QUALITY}`,
        );
      }
      const dropped = notes.length === 0 ? null : notes.join("; ");
      return { sections, dropped };
    }
  }
}

/** Chunk every section, carrying its reference onto each chunk. */
function chunkSections(work: Work, sections: Section[]): OrthodoxChunk[] {
  const targetTokens =
    work.category === "scripture" || work.category === "deuterocanon"
      ? SCRIPTURE_TOKENS
      : PROSE_TOKENS;

  const out: OrthodoxChunk[] = [];
  for (const section of sections) {
    // chunkPage is reused verbatim rather than reimplemented: it already
    // sanitises, segments on sentence boundaries and applies overlap, and it is
    // the unit-tested core. A section stands in for a page — the property that
    // matters is identical, namely that a chunk never crosses the boundary that
    // the citation names.
    const chunks = chunkPage(section.ordinal, section.text, {
      targetTokens,
      overlapRatio: OVERLAP_RATIO,
    });
    for (const chunk of chunks) {
      out.push({ ...chunk, reference: section.reference, book: section.book });
    }
  }
  return out;
}

function human(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** Hours of embedding a token count implies at the configured rate limit. */
function estimateHours(tokens: number, tpm: number): number {
  return tokens / tpm / 60;
}

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

function dryRun(works: Work[]): void {
  console.log(
    `${"work".padEnd(24)} ${"sections".padStart(9)} ${"chunks".padStart(8)} ` +
      `${"tokens".padStart(8)}  notes`,
  );
  console.log("-".repeat(96));

  let totalChunks = 0;
  let totalTokens = 0;
  let missing = 0;

  for (const work of works) {
    const raw = readWork(work);
    if (raw === null) {
      missing++;
      console.log(`${work.id.padEnd(24)} ${"—".padStart(9)} ${"—".padStart(8)} ${"—".padStart(8)}  NOT DOWNLOADED`);
      continue;
    }

    const { sections, dropped } = segment(work, raw);
    const chunks = chunkSections(work, sections);
    const tokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    totalChunks += chunks.length;
    totalTokens += tokens;

    console.log(
      `${work.id.padEnd(24)} ${String(sections.length).padStart(9)} ` +
        `${String(chunks.length).padStart(8)} ${human(tokens).padStart(8)}  ${dropped ?? ""}`,
    );
  }

  console.log("-".repeat(96));
  console.log(`${"TOTAL".padEnd(24)} ${"".padStart(9)} ${human(totalChunks).padStart(8)} ${human(totalTokens).padStart(8)}`);
  if (missing > 0) {
    console.log(`\n${missing} work(s) not downloaded — run: npm run corpus:orthodox`);
  }
  console.log(
    `\nAt the configured Voyage limit this is roughly ` +
      `${estimateHours(totalTokens, 10_000).toFixed(1)} hours of embedding. ` +
      `Ingestion is resumable — run it in sessions with --hours, or raise the ` +
      `limit by upgrading the Voyage account and setting VOYAGE_TPM/VOYAGE_RPM.`,
  );
}

// ---------------------------------------------------------------------------
// Live ingestion
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  status: string;
}

/**
 * Create or find the document row for a work, and return how many of its chunks
 * are already stored.
 *
 * The `documents` row carries the whole catalog entry. That duplication is
 * deliberate: retrieval filters and groups on tradition and category in SQL, and
 * a join back to a TypeScript constant is not a thing Postgres can do.
 */
async function upsertDocument(
  db: Db,
  work: Work,
  fileBytes: number,
  force: boolean,
): Promise<{ documentId: string; existingChunks: number; wasComplete: boolean }> {
  const found = await db
    .from("documents")
    .select("id, status")
    .eq("work_id", work.id)
    .maybeSingle();
  if (found.error) throw new Error(`Document lookup failed: ${found.error.message}`);

  const metadata = {
    title: work.title,
    filename: workFilename(work),
    byte_size: fileBytes,
    work_id: work.id,
    author: work.author,
    tradition: work.tradition,
    lineages: work.lineages,
    category: work.category,
    century: work.century,
    translation_year: work.translationYear,
    translator: work.translator,
    notes: work.notes ?? null,
  };

  const existing = found.data as DocumentRow | null;

  if (existing && force) {
    // Re-ingesting means replacing, not appending. Leaving the old chunks in
    // place would double every passage of this work in the index — and double
    // its weight in every answer that touches it.
    const wiped = await db.from("chunks").delete().eq("document_id", existing.id);
    if (wiped.error) throw new Error(`Could not clear old chunks: ${wiped.error.message}`);
  }

  if (existing) {
    const updated = await db
      .from("documents")
      .update({ ...metadata, status: "processing", error: null })
      .eq("id", existing.id);
    if (updated.error) throw new Error(`Document update failed: ${updated.error.message}`);

    if (force) {
      return { documentId: existing.id, existingChunks: 0, wasComplete: false };
    }

    // RESUME FROM THE HIGHEST INDEX, NOT THE ROW COUNT.
    //
    // Counting rows and resuming at `count` is only correct while the stored
    // indices are exactly 0..count-1, and an interrupted run does not guarantee
    // that. This bug was real and silent: one work ended up with 320 rows
    // spanning indices 0..399 — a run stopped mid-way, restarted, and resumed
    // at 320 while rows above 320 already existed, so it wrote past them and
    // left holes. The document was then marked complete with a fifth of the
    // book missing, and nothing about it looked wrong.
    //
    // max(chunk_index) + 1 is the first index that is certainly free.
    const highest = await db
      .from("chunks")
      .select("chunk_index")
      .eq("document_id", existing.id)
      .order("chunk_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (highest.error) throw new Error(`Chunk index lookup failed: ${highest.error.message}`);

    const counted = await db
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", existing.id);
    if (counted.error) throw new Error(`Chunk count failed: ${counted.error.message}`);

    const maxIndex = (highest.data as { chunk_index: number } | null)?.chunk_index ?? -1;
    const resumeAt = maxIndex + 1;
    const rows = counted.count ?? 0;

    // Gaps mean passages of this book are missing from the index and no future
    // run will fill them, because resume only ever moves forward. Say so.
    if (rows !== resumeAt) {
      console.warn(
        `  ${work.id.padEnd(24)} WARNING: ${rows} chunk(s) stored but indices run to ` +
          `${maxIndex} — this work has gaps. Re-ingest it with --force.`,
      );
    }

    return {
      documentId: existing.id,
      existingChunks: resumeAt,
      wasComplete: existing.status === "complete",
    };
  }

  const inserted = await db
    .from("documents")
    .insert({ ...metadata, status: "processing" })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`Document insert failed: ${inserted.error.message}`);

  return { documentId: (inserted.data as { id: string }).id, existingChunks: 0, wasComplete: false };
}

/** Insert one batch of chunks with their embeddings, at the given index offset. */
async function insertBatch(
  db: Db,
  documentId: string,
  chunks: OrthodoxChunk[],
  embeddings: number[][],
  indexOffset: number,
): Promise<void> {
  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    content: c.content,
    page_number: null,
    chunk_index: indexOffset + i,
    token_count: c.tokenCount,
    reference: c.reference,
    book: c.book,
    // pgvector wants the "[1,2,3]" text form; a raw JS array serialises to a
    // Postgres array literal and fails to cast.
    embedding: JSON.stringify(embeddings[i]),
  }));

  const inserted = await db.from("chunks").insert(rows);
  if (inserted.error) throw new Error(`Chunk insert failed: ${inserted.error.message}`);
}

/**
 * Chunks per embed+insert cycle.
 *
 * Small on purpose. This is the amount of work lost when a run is interrupted,
 * and at 3 requests a minute a large batch is many minutes of progress thrown
 * away. embed.ts already packs the actual API requests by token budget, so a
 * small number here costs nothing in throughput.
 */
const EMBED_BATCH = 40;

async function ingest(works: Work[], args: Args): Promise<void> {
  // Loaded here rather than at the top of the file so --dry-run needs no
  // credentials at all: env.ts validates on import and would fail a dry run on
  // a machine that has the corpus but no keys.
  await import("../src/lib/loadenv"); // must run before env.ts validates

  // Imported lazily for the same reason.
  const { db } = (await import("../src/lib/db")) as { db: Db };
  const { embedDocuments } = (await import("../src/lib/embed")) as {
    embedDocuments: EmbedDocuments;
  };

  const deadline = args.hours === null ? null : Date.now() + args.hours * 3600 * 1000;
  let embeddedTokens = 0;
  const started = Date.now();

  for (const work of works) {
    if (deadline !== null && Date.now() > deadline) {
      console.log(`\nTime budget reached. Stopping cleanly — re-run to continue.`);
      break;
    }

    const raw = readWork(work);
    if (raw === null) {
      console.log(`  ${work.id.padEnd(24)} skipped — not downloaded`);
      continue;
    }

    const { sections, dropped } = segment(work, raw);
    const chunks = chunkSections(work, sections);
    if (chunks.length === 0) {
      console.log(`  ${work.id.padEnd(24)} skipped — segmented to nothing`);
      continue;
    }

    const fileBytes = Buffer.byteLength(raw, "utf8");
    const { documentId, existingChunks, wasComplete } = await upsertDocument(
      db,
      work,
      fileBytes,
      args.force,
    );

    if (wasComplete && existingChunks >= chunks.length) {
      console.log(`  ${work.id.padEnd(24)} complete (${existingChunks} chunks)`);
      continue;
    }

    const remaining = chunks.slice(existingChunks);
    const resumeNote = existingChunks > 0 ? ` (resuming at ${existingChunks})` : "";
    console.log(
      `  ${work.id.padEnd(24)} ${remaining.length} chunk(s)${resumeNote}` +
        `${dropped ? ` — ${dropped}` : ""}`,
    );

    let index = existingChunks;
    let interrupted = false;

    for (let i = 0; i < remaining.length; i += EMBED_BATCH) {
      if (deadline !== null && Date.now() > deadline) {
        interrupted = true;
        break;
      }
      const batch = remaining.slice(i, i + EMBED_BATCH);
      const embeddings = await embedDocuments(batch.map((c) => c.content));
      await insertBatch(db, documentId, batch, embeddings, index);

      index += batch.length;
      embeddedTokens += batch.reduce((sum, c) => sum + c.tokenCount, 0);

      const done = index - existingChunks;
      const elapsedMin = (Date.now() - started) / 60000;
      process.stdout.write(
        `\r    ${done}/${remaining.length} chunks · ${human(embeddedTokens)} tokens · ` +
          `${elapsedMin.toFixed(0)}m elapsed          `,
      );
    }
    process.stdout.write("\n");

    // Marked complete only when every chunk is in. A run that stops midway
    // leaves the document 'processing', which is exactly what the resume path
    // and the /documents view need to see.
    if (!interrupted) {
      const finished = await db
        .from("documents")
        .update({ status: "complete", page_count: sections.length })
        .eq("id", documentId);
      if (finished.error) throw new Error(`Could not mark complete: ${finished.error.message}`);
    } else {
      console.log(`\nTime budget reached mid-work. Stopping cleanly — re-run to continue.`);
      break;
    }
  }

  const minutes = (Date.now() - started) / 60000;
  console.log(
    `\nEmbedded ${human(embeddedTokens)} tokens in ${minutes.toFixed(0)} minute(s).`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let works = CATALOG;
  if (args.only) {
    const missing = args.only.filter((id) => !workById(id));
    if (missing.length > 0) throw new Error(`Unknown work id(s): ${missing.join(", ")}`);
    const wanted = new Set(args.only);
    works = works.filter((w) => wanted.has(w.id));
  }

  // Ordering needs file sizes, which are only known once downloaded; a work
  // that is missing sorts as size 0 and is reported rather than ingested.
  const sizes = new Map<string, number>();
  for (const work of works) {
    const raw = readWork(work);
    sizes.set(work.id, raw === null ? 0 : raw.length);
  }
  works = ingestOrder(works, sizes);

  if (args.dryRun) {
    dryRun(works);
    return;
  }
  await ingest(works, args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
