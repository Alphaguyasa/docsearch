/**
 * Load data/figures.seed.json into figures + figure_passages. Idempotent:
 * upserts figures, and replaces each figure's passages so renamed refs don't linger.
 *
 *   npm run scripture:seed-figures
 */
import { db } from "../src/lib/db";
import { FIGURES } from "../src/lib/scripture/figures";

async function main(): Promise<void> {
  const figs = FIGURES.map(({ id, name, kind, sins, summary, traditions, note }) => ({
    id, name, kind, sins, summary, traditions, note: note ?? null,
  }));
  const up = await db.from("figures").upsert(figs, { onConflict: "id" });
  if (up.error) throw new Error(`figures upsert failed: ${up.error.message}`);

  for (const f of FIGURES) {
    const del = await db.from("figure_passages").delete().eq("figure_id", f.id);
    if (del.error) throw new Error(`passages delete failed (${f.id}): ${del.error.message}`);
    const rows = f.passages.map((p) => ({ figure_id: f.id, role: p.role, ref: p.ref, source_id: p.sourceId, match: p.match ?? null }));
    const ins = await db.from("figure_passages").insert(rows);
    if (ins.error) throw new Error(`passages insert failed (${f.id}): ${ins.error.message}`);
  }
  console.log(`seeded ${figs.length} figures, ${FIGURES.reduce((n, f) => n + f.passages.length, 0)} passages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
