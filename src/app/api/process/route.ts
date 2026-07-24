/**
 * POST /api/process — pick up one 'pending' document and run the ingestion
 * pipeline: download from Storage → extract → chunk → embed → insert chunks →
 * mark 'complete' (or 'failed' with the error). Returns { processed, remaining }
 * so the client can loop until nothing is pending.
 *
 * One document per call keeps each invocation well within serverless time
 * limits. Reuses chunk.ts, embed.ts, and the shared pipeline; does not modify
 * src/lib beyond importing it.
 */
import { chunkPages } from "@/lib/chunk";
import { db } from "@/lib/db";
import { embedDocuments } from "@/lib/embed";
import { extractPdf, insertChunks } from "@/lib/pipeline";

const BUCKET = "documents";

// Allow Vercel to run the function long enough to embed a document.
export const maxDuration = 60;

async function pendingCount(): Promise<number> {
  const { count } = await db
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export async function POST(): Promise<Response> {
  // Claim the oldest pending document.
  const claim = await db
    .from("documents")
    .select("id,filename")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (claim.error) {
    return Response.json({ error: claim.error.message }, { status: 500 });
  }
  if (!claim.data) {
    return Response.json({ processed: 0, remaining: 0 });
  }

  const id = claim.data.id as string;
  await db.from("documents").update({ status: "processing", error: null }).eq("id", id);

  try {
    const download = await db.storage.from(BUCKET).download(`${id}.pdf`);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "Stored file not found.");
    }
    const bytes = new Uint8Array(await download.data.arrayBuffer());

    const { totalPages, pages } = await extractPdf(bytes);
    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new Error("No extractable text — the PDF may be scanned or empty.");
    }

    const embeddings = await embedDocuments(chunks.map((c) => c.content));
    await insertChunks(db, id, chunks, embeddings);

    await db
      .from("documents")
      .update({ status: "complete", page_count: totalPages, error: null })
      .eq("id", id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Clear any partially-inserted chunks so a retry starts clean.
    await db.from("chunks").delete().eq("document_id", id);
    await db.from("documents").update({ status: "failed", error: message }).eq("id", id);
  }

  return Response.json({ processed: 1, remaining: await pendingCount() });
}
