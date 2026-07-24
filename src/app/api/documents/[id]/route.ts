/**
 * DELETE /api/documents/[id] — delete one document and its chunks.
 *
 * Chunks are removed automatically by the ON DELETE CASCADE on
 * chunks.document_id (see schema.sql), so this is a single delete. Imports the
 * shared db client; does not modify src/lib.
 */
import { db } from "@/lib/db";

const BUCKET = "documents";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ error: "Missing document id." }, { status: 400 });
  }

  const { error } = await db.from("documents").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: remove the uploaded PDF from Storage. CLI-ingested documents
  // have no stored object; remove() is a no-op for a missing key.
  await db.storage.from(BUCKET).remove([`${id}.pdf`]);

  return new Response(null, { status: 204 });
}
