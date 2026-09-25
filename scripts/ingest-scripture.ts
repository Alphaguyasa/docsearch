/**
 * Resumable scripture ingestion — built to run unattended on GitHub Actions.
 *
 *   npm run scripture:ingest [-- --dry-run] [-- --max-minutes 330]
 *
 * 1. Builds chunks from corpus/scripture/raw (fetched by scripture:fetch).
 * 2. Upserts one documents row per book / work (keyed by documents.source_id).
 * 3. Reads what is already in the DB and plans only the missing or changed chunks.
 * 4. Embeds in small groups and upserts each group immediately, so a killed run
 *    loses at most one group. Stops cleanly before --max-minutes so the workflow
 *    can record progress and chain the next run.
 *
 * Writes ingest-status.json: { total, done, remaining, stoppedEarly, ... }.
 * --dry-run makes zero network calls.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Manifest } from "../src/lib/scripture/manifest";
import { groups, planIngest, type ExistingRow } from "../src/lib/scripture/plan";
import { buildSource } from "../src/lib/scripture/sources";
import type { ScriptureChunk } from "../src/lib/scripture/types";

const ROOT = "corpus/scripture";
const GROUP_SIZE = 16; // ~7k tokens: a few Voyage requests, then commit
const STATUS_FILE = "ingest-status.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const started = Date.now();
  const dryRun = process.argv.includes("--dry-run");
  const maxMinutes = Number(arg("--max-minutes") ?? 330);
  const deadline = started + maxMinutes * 60_000;

  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as Manifest;
  const expected: ScriptureChunk[] = [];
  for (const e of manifest.entries) expected.push(...buildSource(join(ROOT, "raw"), manifest, e.id).chunks);
  const docs = new Map<string, { title: string; sourceId: string }>();
  for (const c of expected) docs.set(c.documentKey, { title: c.documentTitle, sourceId: c.sourceId });
  console.log(`built ${expected.length} chunks across ${docs.size} documents`);

  if (dryRun) {
    writeStatus({ total: expected.length, done: 0, remaining: expected.length, stoppedEarly: false, dryRun: true });
    return;
  }

  // Lazy imports: the dry run must not require credentials.
  const { db } = await import("../src/lib/db");
  const { embedDocuments } = await import("../src/lib/embed");
  const { fetchAllRows } = await import("../src/lib/paginate");

  // Documents
  const byEntry = new Map(manifest.entries.map((e) => [e.id, e]));
  const docRows = [...docs].map(([key, d]) => {
    const entry = byEntry.get(d.sourceId)!;
    return {
      source_id: key,
      title: d.title,
      filename: key,
      kind: entry.kind,
      license: entry.license,
      source_url: entry.files[0]?.url ?? null,
      status: "complete",
    };
  });
  const up = await db.from("documents").upsert(docRows, { onConflict: "source_id" }).select("id,source_id");
  if (up.error) throw new Error(`documents upsert failed: ${up.error.message}`);
  const docId = new Map((up.data ?? []).map((r: { id: string; source_id: string }) => [r.source_id, r.id]));
  const keyOf = new Map([...docId].map(([k, v]) => [v, k]));

  // Existing chunks
  // Existing chunks. Rows are always written together with their embedding,
  // but check for nulls anyway (e.g. rows inserted by hand) so they get redone.
  const rows = await fetchAllRows<{ id: string; document_id: string; chunk_index: number; content: string }>(
    "chunks",
    (from, to) => db.from("chunks").select("id,document_id,chunk_index,content").order("id").range(from, to),
  );
  const nullIds = new Set(
    (
      await fetchAllRows<{ id: string }>("null embeddings", (from, to) =>
        db.from("chunks").select("id").is("embedding", null).order("id").range(from, to),
      )
    ).map((r) => r.id),
  );
  const existing: ExistingRow[] = rows.map((r) => ({
    id: r.id,
    documentKey: keyOf.get(r.document_id) ?? "?",
    chunkIndex: r.chunk_index,
    content: r.content,
    embedded: !nullIds.has(r.id),
  }));

  const plan = planIngest(expected, existing);
  console.log(`done ${plan.alreadyDone}, to embed ${plan.toEmbed.length}, stale ${plan.staleRowIds.length}`);
  for (const ids of groups(plan.staleRowIds, 100)) {
    const del = await db.from("chunks").delete().in("id", ids);
    if (del.error) throw new Error(`stale delete failed: ${del.error.message}`);
  }

  let done = plan.alreadyDone;
  let stoppedEarly = false;
  const batches = groups(plan.toEmbed, GROUP_SIZE);
  for (let b = 0; b < batches.length; b++) {
    if (Date.now() > deadline) {
      stoppedEarly = true;
      console.log(`deadline reached after ${maxMinutes} min — stopping cleanly`);
      break;
    }
    const batch = batches[b];
    const vectors = await embedDocuments(batch.map((c) => c.content));
    const upRows = batch.map((c, i) => ({
      document_id: docId.get(c.documentKey),
      chunk_index: c.chunkIndex,
      content: c.content,
      token_count: c.tokenCount,
      ref: c.ref,
      book: c.book,
      chapter_start: c.chapterStart,
      verse_start: c.verseStart,
      verse_end: c.verseEnd,
      traditions: c.traditions,
      embedding: JSON.stringify(vectors[i]),
    }));
    const res = await db.from("chunks").upsert(upRows, { onConflict: "document_id,chunk_index" });
    if (res.error) throw new Error(`chunk upsert failed: ${res.error.message}`);
    done += batch.length;
    if (b % 10 === 0 || b === batches.length - 1) {
      const mins = ((Date.now() - started) / 60_000).toFixed(1);
      console.log(`  ${done}/${expected.length} embedded (${mins} min)`);
      writeStatus({ total: expected.length, done, remaining: expected.length - done, stoppedEarly: false });
    }
  }

  writeStatus({ total: expected.length, done, remaining: expected.length - done, stoppedEarly });
  console.log(`finished: ${done}/${expected.length}${stoppedEarly ? " (will resume)" : ""}`);
}

function writeStatus(s: Record<string, unknown>): void {
  writeFileSync(STATUS_FILE, JSON.stringify({ ...s, at: new Date().toISOString() }, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
