/**
 * Parse + chunk the fetched corpus with ZERO network calls, then report.
 *
 *   npm run scripture:dry
 *
 * Writes:
 *   corpus/scripture/chunks/<source>.jsonl   (gitignored; ingestion input)
 *   corpus/scripture/chunks-report.md        (committed; human review)
 *
 * The report includes a figure-passage check: every ref in
 * data/figures.seed.json must land on at least one chunk, or the build fails.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import figures from "../data/figures.seed.json";
import { canonByCode } from "../src/lib/scripture/canon";
import type { Manifest } from "../src/lib/scripture/manifest";
import { buildSource } from "../src/lib/scripture/sources";
import type { ScriptureChunk } from "../src/lib/scripture/types";
import { parseRef } from "../src/lib/scripture/usfm";

const ROOT = "corpus/scripture";
const TPM = Number(process.env.VOYAGE_TPM ?? 10_000);

function main(): void {
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as Manifest;
  mkdirSync(join(ROOT, "chunks"), { recursive: true });
  const out: string[] = ["# Scripture chunk report", "", `Generated ${new Date().toISOString()}`, ""];
  const all: ScriptureChunk[] = [];

  out.push("| Source | Docs | Chunks | Tokens | Mean | Max |", "|---|---|---|---|---|---|");
  for (const entry of manifest.entries) {
    const { chunks, skippedBooks } = buildSource(join(ROOT, "raw"), manifest, entry.id);
    all.push(...chunks);
    writeFileSync(join(ROOT, "chunks", `${entry.id}.jsonl`), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
    const tokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
    const docs = new Set(chunks.map((c) => c.documentKey)).size;
    const max = Math.max(0, ...chunks.map((c) => c.tokenCount));
    out.push(`| ${entry.id} | ${docs} | ${chunks.length} | ${tokens} | ${Math.round(tokens / Math.max(1, chunks.length))} | ${max} |`);
    if (skippedBooks.length) out.push(`|  | skipped: ${skippedBooks.join(" ")} | | | | |`);
  }
  const total = all.reduce((s, c) => s + c.tokenCount, 0);
  out.push("", `**Total:** ${all.length} chunks, ${total} tokens ≈ ${(total / TPM / 60).toFixed(1)} h of embedding at ${TPM} TPM.`);

  // Figure passage resolution
  out.push("", "## Figure passage check", "");
  const byName = new Map([...canonByCode().values()].map((b) => [b.name, b.code]));
  const problems: string[] = [];
  for (const f of figures.figures) {
    for (const p of f.passages) {
      if (p.sourceId === "pending") continue;
      let hits: ScriptureChunk[] = [];
      if (p.sourceId === "web") {
        const r = parseRef(p.ref);
        const code = r ? byName.get(r.book) ?? (r.book === "Prayer of Manasseh" ? "MAN" : undefined) : undefined;
        if (p.ref === "Prayer of Manasseh") {
          hits = all.filter((c) => c.book === "MAN");
        } else if (r && code) {
          hits = all.filter((c) => {
            if (c.book !== code || c.chapterStart === null) return false;
            const m = parseRef(c.ref);
            if (!m) return false;
            const cStart = m.c1 * 1000 + m.v1;
            const cEnd = m.c2 * 1000 + m.v2;
            return cStart <= r.c2 * 1000 + r.v2 && cEnd >= r.c1 * 1000 + r.v1;
          });
        }
      } else {
        hits = all.filter((c) => c.sourceId === p.sourceId && c.ref.toLowerCase().startsWith(p.ref.toLowerCase()) &&
          (!("match" in p) || c.content.toLowerCase().includes(String((p as { match?: string }).match).toLowerCase())));
      }
      const line = `- ${hits.length ? "✅" : "❌"} ${f.id} / ${p.role}: \`${p.ref}\` → ${hits.length} chunk(s)${hits.length ? ` (${hits.slice(0, 3).map((h) => h.ref).join("; ")}${hits.length > 3 ? "; …" : ""})` : ""}`;
      out.push(line);
      if (!hits.length) problems.push(`${f.id}: ${p.ref}`);
    }
  }

  // Samples: first, middle and a late chunk per source, trimmed.
  out.push("", "## Samples", "");
  for (const entry of manifest.entries) {
    const cs = all.filter((c) => c.sourceId === entry.id);
    for (const i of [0, Math.floor(cs.length / 2), Math.floor(cs.length * 0.9)]) {
      const c = cs[i];
      if (!c) continue;
      out.push(`**${c.ref}** (${c.tokenCount} tokens, ${c.traditions.join(", ")})`, "```", c.content.slice(0, 700), "```", "");
    }
  }
  // Section heading inventory for tradition texts, so bad heading detection is visible.
  out.push("## Tradition section headings (first 40 per source)", "");
  for (const entry of manifest.entries.filter((e) => e.format !== "usfm-zip")) {
    const heads = [...new Set(all.filter((c) => c.sourceId === entry.id).map((c) => c.ref.replace(/ \(part \d+\)$/, "")))];
    out.push(`**${entry.id}** — ${heads.length} sections: ${heads.slice(0, 40).join(" · ")}`, "");
  }

  // Coverage per Synaxarium month, and where named figures appear in tradition texts.
  const months = new Map<string, number>();
  for (const c of all.filter((c) => c.sourceId === "synaxarium")) {
    const m = c.ref.match(/^Ethiopian Synaxarium, ([A-Za-z]+)/)?.[1] ?? "?";
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  out.push("## Synaxarium chunks per month", "", [...months].map(([m, n]) => `${m}: ${n}`).join(" · "), "");
  out.push("## Where Moses the Ethiopian appears", "");
  for (const c of all.filter((c) => c.sourceId !== "web" && /Moses[^.]{0,80}(Ethiopian|Black|robber|Indian)|(Ethiopian|Black|robber|Indian)[^.]{0,40}Moses/i.test(c.content))) {
    out.push(`- ${c.sourceId}: ${c.ref}`);
  }
  out.push("");

  // Tuning aids for OCR sources: most frequent short lines (running-header
  // candidates) and raw context around a keyword, straight from the raw text.
  out.push("## OCR tuning aids", "");
  for (const entry of manifest.entries.filter((e) => e.format === "archive-djvu-txt")) {
    const raw = entry.files.map((f) => readFileSync(join(ROOT, "raw", entry.id, f.name), "utf8")).join("\n");
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const freq = new Map<string, number>();
    for (const l of lines) {
      if (l.length > 60) continue;
      const shape = l.replace(/\d+/g, "#");
      freq.set(shape, (freq.get(shape) ?? 0) + 1);
    }
    const top = [...freq.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 30);
    out.push(`### ${entry.id}: frequent short lines`, "```", ...top.map(([l, n]) => `${n}\t${l}`), "```");
    const hit = lines.findIndex((l) => /\bMOSES\b/.test(l) && l.length < 60);
    const at = hit >= 0 ? hit : lines.findIndex((l) => /Moses/.test(l));
    if (at >= 0) out.push(`### ${entry.id}: context around "Moses" (line ${at})`, "```", ...lines.slice(Math.max(0, at - 15), at + 25).map((l) => l.slice(0, 140)), "```");
    const sampleAt = Math.floor(lines.length * 0.4);
    out.push(`### ${entry.id}: 50 raw lines at 40%`, "```", ...lines.slice(sampleAt, sampleAt + 50).map((l) => l.slice(0, 140)), "```", "");
  }

  writeFileSync(join(ROOT, "chunks-report.md"), out.join("\n") + "\n");
  console.log(out.slice(0, 20).join("\n"));
  if (problems.length) {
    console.error(`\n${problems.length} figure passage(s) did not resolve:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main();
