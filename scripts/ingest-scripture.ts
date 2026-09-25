/**
 * Resumable ingestion of the scripture corpus into Supabase.
 *
 *   npm run scripture:ingest -- [--dry-run] [--max-minutes 330] [--only web,confessions]
 *
 * Reads corpus/scripture/chunks/*.jsonl (built by `npm run scripture:dry`),
 * upserts one documents row per Bible book / tradition work, then embeds and
 * upserts only the chunks the database does not already hold in current form.
 * Progress is committed after every batch, so a killed run loses at most one
 * batch and the next run continues where this one stopped.
 *
 * Stops cleanly before --max-minutes so GitHub Actions never kills it mid-write.
 * Writes corpus/scripture/ingest-status.json and, on Actions, `remaining=<n>`
 * to $GITHUB_OUTPUT so the workflow can decide whether to run again.
 */
import "../src/lib/loadenv";

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { countTokens } from "../src/lib/chunk";
import { batchByTokens } from "../src/lib/ratelimit";
import { orderSources, planDocument, type DbChunkState } from "../src/lib/scripture/ingest-plan";
import type { Manifest } from "../src/lib/scripture/manifest";
import type { ScriptureChunk } from "../src/lib/scripture/types";

const ROOT = "corpus/scripture";
const BATCH_TOKENS = 3_000;
const UPSERT_BATCH = 100;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : process.argv.find((a) => a.startsWith(`${name}=`))?.split("=")[1];
}

function loadChunks(only: string[] | null): Map<string, ScriptureChunk[]> {
  const dir = join(ROOT, "chunks");
  if (!existsSync(dir)) throw new Error(`${dir} missing — run npm run scripture:dry first`);
  const bySource = new Map<string, ScriptureChunk[]>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const id = f.replace(/\.jsonl$/, "");
    if (only && !only.includes(id)) continue;
    const rows = readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as ScriptureChunk);
    bySource.set(id, rows);
  }
  return bySource;
}

function output(key: string, value: string | number): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const maxMinutes = Number(arg("--max-minutes") ?? 330);
  const only = arg("--only")?.split(",") ?? null;
  const started = Date.now();
  const deadline = started + maxMinutes * 60_000;

  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as Manifest;
  const bySource = loadChunks(only);

  // Imported lazily so --dry-run works without credentials.
  const { db } = dryRun ? { db: null } : await import("../src/lib/db");
  const { embedDocuments } = dryRun ? { embedDocuments: null } : await import("../src/lib/embed");

  interface Work { docId: string; chunk: ScriptureChunk }
  const queue: Work[] = [];
  let alreadyDone = 0;
  let staleDeleted = 0;

  for (const sourceId of orderSources([...bySource.keys()])) {
    const entry = manifest.entries.find((e) => e.id === sourceId);
    const chunks = bySource.get(sourceId)!;
    const docs = new Map<string, ScriptureChunk[]>();
    for (const c of chunks) docs.set(c.documentKey, [...(docs.get(c.documentKey) ?? []), c]);

    for (const [key, local] of docs) {
      if (dryRun || !db) {
        queue.push(...local.map((chunk) => ({ docId: key, chunk })));
        continue;
      }
      const up = await db
        .from("documents")
        .upsert(
          {
            source_id: key,
            title: local[0].documentTitle,
            filename: key,
            kind: entry?.kind ?? (sourceId === "web" ? "scripture" : "tradition"),
            license: entry?.license ?? null,
            source_url: entry?.files[0]?.url ?? null,
            status: "complete",
          },
          { onConflict: "source_id" },
        )
        .select("id")
        .single();
      if (up.error || !up.data) throw new Error(`document upsert ${key}: ${up.error?.message}`);
      const docId = (up.data as { id: string }).id;

      const st = await db.rpc("chunk_state", { doc: docId });
      if (st.error) throw new Error(`chunk_state ${key}: ${st.error.message}`);
      const plan = planDocument(local, (st.data ?? []) as DbChunkState[]);
      alreadyDone += plan.alreadyDone;
      if (plan.staleIndexes.length) {
        const del = await db.from("chunks").delete().eq("document_id", docId).in("chunk_index", plan.staleIndexes);
        if (del.error) throw new Error(`stale delete ${key}: ${del.error.message}`);
        staleDeleted += plan.staleIndexes.length;
      }
      queue.push(...plan.toEmbed.map((chunk) => ({ docId, chunk })));
    }
  }

  const totalTokens = queue.reduce((s, w) => s + w.chunk.tokenCount, 0);
  const tpm = Number(process.env.VOYAGE_TPM ?? 10_000);
  console.log(
    `to embed: ${queue.length} chunks / ${totalTokens} tokens (≈ ${(totalTokens / tpm).toFixed(0)} min); ` +
      `already done: ${alreadyDone}; stale deleted: ${staleDeleted}`,
  );

  let embedded = 0;
  let stoppedEarly = false;
  if (!dryRun && db && embedDocuments) {
    const batches = batchByTokens(queue, (w) => countTokens(w.chunk.content), BATCH_TOKENS, 100);
    for (const [i, batch] of batches.entries()) {
      if (Date.now() > deadline) {
        stoppedEarly = true;
        console.log(`time budget reached after ${embedded} chunks — stopping cleanly`);
        break;
      }
      const vectors = await embedDocuments(batch.map((w) => w.chunk.content));
      const rows = batch.map((w, j) => ({
        document_id: w.docId,
        chunk_index: w.chunk.chunkIndex,
        content: w.chunk.content,
        token_count: w.chunk.tokenCount,
        embedding: JSON.stringify(vectors[j]),
        ref: w.chunk.ref,
        book: w.chunk.book,
        chapter_start: w.chunk.chapterStart,
        verse_start: w.chunk.verseStart,
        verse_end: w.chunk.verseEnd,
        traditions: w.chunk.traditions,
      }));
      for (let k = 0; k < rows.length; k += UPSERT_BATCH) {
        const res = await db.from("chunks").upsert(rows.slice(k, k + UPSERT_BATCH), { onConflict: "document_id,chunk_index" });
        if (res.error) throw new Error(`chunk upsert: ${res.error.message}`);
      }
      embedded += batch.length;
      if (i % 10 === 0 || i === batches.length - 1) {
        const mins = ((Date.now() - started) / 60_000).toFixed(1);
        console.log(`  [${mins} min] ${embedded}/${queue.length} chunks — last: ${batch[batch.length - 1].chunk.ref}`);
      }
    }
  }

  const remaining = dryRun ? queue.length : queue.length - embedded;
  const status = {
    finishedAt: new Date().toISOString(),
    dryRun,
    embeddedThisRun: embedded,
    alreadyDone,
    remaining,
    stoppedEarly,
    minutes: Number(((Date.now() - started) / 60_000).toFixed(1)),
  };
  writeFileSync(join(ROOT, "ingest-status.json"), JSON.stringify(status, null, 2) + "\n");
  output("remaining", remaining);
  output("done", alreadyDone + embedded);
  output("embedded", embedded);
  console.log(JSON.stringify(status));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
