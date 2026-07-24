/**
 * POST /api/upload — accept a PDF, store it in Supabase Storage, and create a
 * documents row with status 'pending' for the processing route to pick up.
 *
 * Multipart form with a single `file` field. The stored object is keyed by the
 * new document's id (`<id>.pdf`), so the processing route can locate it without
 * a schema change. Imports the shared db client; does not modify src/lib.
 */
import { db } from "@/lib/db";

const BUCKET = "documents";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — keep within serverless body limits

/** Ensure the private storage bucket exists (create it if missing). */
async function ensureBucket(): Promise<void> {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  // Ignore a create race where another request just made it.
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`Could not create storage bucket: ${error.message}`);
  }
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return Response.json({ error: "Only PDF files are accepted." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File exceeds the ${MAX_BYTES / 1024 / 1024} MB limit.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const filename = file.name;
  const byteSize = bytes.byteLength;
  const title = filename.replace(/\.pdf$/i, "");

  try {
    await ensureBucket();
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }

  // Insert the row first so the object can be keyed by its id. The unique
  // (filename, byte_size) index rejects a re-upload of the same file.
  const insert = await db
    .from("documents")
    .insert({ title, filename, byte_size: byteSize, status: "pending" })
    .select("id")
    .single();
  if (insert.error) {
    if (/duplicate|unique/i.test(insert.error.message)) {
      return Response.json(
        { error: "This file (same name and size) is already uploaded." },
        { status: 409 },
      );
    }
    return Response.json({ error: insert.error.message }, { status: 500 });
  }
  const id = insert.data.id as string;

  const upload = await db.storage
    .from(BUCKET)
    .upload(`${id}.pdf`, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) {
    // Roll the row back so it isn't left pending with no file to process.
    await db.from("documents").delete().eq("id", id);
    return Response.json(
      { error: `Storage upload failed: ${upload.error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ id, filename, status: "pending" }, { status: 201 });
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
