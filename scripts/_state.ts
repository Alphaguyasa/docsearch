import "../src/lib/loadenv";
import { db } from "../src/lib/db";

async function main(): Promise<void> {
  const docs = await db.from("documents").select("id,filename,page_count,status").returns<
    { id: string; filename: string; page_count: number | null; status: string }[]
  >();
  if (docs.error) throw new Error(docs.error.message);
  console.log(`documents: ${docs.data.length}`);

  let empty = 0;
  for (const d of docs.data) {
    const c = await db.from("chunks").select("id", { count: "exact", head: true }).eq("document_id", d.id);
    const n = c.count ?? 0;
    if (n === 0) empty++;
    if (docs.data.length <= 20 || n === 0) {
      console.log(`  ${n === 0 ? "⚠ EMPTY" : "  ok   "} ${String(n).padStart(4)} chunks  ${d.status.padEnd(10)} ${d.filename.slice(0, 60)}`);
    }
  }
  const total = await db.from("chunks").select("id", { count: "exact", head: true });
  console.log(`\ntotal chunks: ${total.count ?? 0}`);
  console.log(`documents with ZERO chunks (partial rows): ${empty}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
