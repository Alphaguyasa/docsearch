/**
 * Fetch the scripture / tradition corpus described in corpus/scripture/sources.json.
 *
 *   npm run scripture:fetch            download everything active
 *   npm run scripture:fetch -- --only web,confessions
 *
 * Writes raw files to corpus/scripture/raw/<id>/ (gitignored) and records
 * sha256 + bytes + url + license in corpus/scripture/manifest.json (committed),
 * so anyone can rebuild a byte-identical corpus. Idempotent: a file already on
 * disk with the recorded sha256 is not downloaded again.
 *
 * Failures never abort the run: they are written to
 * corpus/scripture/failed.json and the process exits 1 at the end, after the
 * sources that did work have been recorded.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  activeSources,
  isRestricted,
  pickArchiveItems,
  pickDjvuText,
  validateManifest,
  type Manifest,
  type ManifestEntry,
  type ManifestFile,
  type SourceConfig,
} from "../src/lib/scripture/manifest";

const ROOT = "corpus/scripture";
const SOURCES = join(ROOT, "sources.json");
const MANIFEST = join(ROOT, "manifest.json");
const FAILED = join(ROOT, "failed.json");
/** Human-readable fetch report, committed so results are reviewable without CI log access. */
const REPORT = join(ROOT, "report.md");
const report: string[] = [];
const RAW = join(ROOT, "raw");
const UA = "not-alone-corpus-fetcher/1.0 (github.com/Alphaguyasa/docsearch)";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function get(url: string, attempt = 0): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
    return get(url, attempt + 1);
  }
  throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
}

async function getJson<T>(url: string): Promise<T> {
  return JSON.parse((await get(url)).toString("utf8")) as T;
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { version: 1, generatedAt: "", entries: [] };
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
}

/** Download one file unless the recorded hash is already on disk. */
async function fetchFile(
  sourceId: string,
  url: string,
  name: string,
  previous: ManifestFile | undefined,
  archiveId?: string,
): Promise<ManifestFile> {
  const dir = join(RAW, sourceId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  if (previous && existsSync(path)) {
    const onDisk = readFileSync(path);
    if (sha256(onDisk) === previous.sha256) {
      console.log(`  = ${sourceId}/${name} (cached)`);
      return previous;
    }
  }
  const buf = await get(url);
  writeFileSync(path, buf);
  const file: ManifestFile = { name, url, sha256: sha256(buf), bytes: buf.byteLength };
  if (archiveId) file.archiveId = archiveId;
  if (previous && previous.sha256 !== file.sha256) {
    console.warn(`  ! ${sourceId}/${name} changed upstream (sha256 differs from manifest)`);
  }
  console.log(`  + ${sourceId}/${name} ${(file.bytes / 1024).toFixed(0)} KiB`);
  return file;
}

async function resolveArchive(source: SourceConfig): Promise<{ id: string; file: string }[]> {
  // Pinned identifiers win: once a scan has been reviewed, never re-resolve it.
  if (source.archiveIds && source.archiveIds.length > 0) {
    const pinned: { id: string; file: string }[] = [];
    for (const id of source.archiveIds) {
      const meta = await getJson<{ files?: { name: string }[] }>(`https://archive.org/metadata/${id}`);
      const file = pickDjvuText(meta.files ?? []);
      if (!file) throw new Error(`${source.id}: pinned item ${id} has no _djvu.txt`);
      pinned.push({ id, file });
    }
    report.push(`- pinned: ${source.archiveIds.join(", ")}`);
    return pinned;
  }
  if (!source.archiveQuery) throw new Error(`${source.id}: archive source without archiveQuery`);
  const q = encodeURIComponent(source.archiveQuery);
  const url =
    `https://archive.org/advancedsearch.php?q=${q}` +
    `&fl[]=identifier&fl[]=title&fl[]=year&fl[]=mediatype&rows=25&output=json`;
  const data = await getJson<{ response: { docs: { identifier: string; title?: string }[] } }>(url);
  const items = pickArchiveItems(data.response.docs, source.titleHint ?? source.title.replace(/\(.*\)/, ""));
  console.log(`  ? ${source.id}: ${data.response.docs.length} hits, ${items.length} match title`);
  for (const d of data.response.docs) {
    console.log(`      - ${d.identifier} | ${d.title}`);
    report.push(`- hit: \`${d.identifier}\` — ${d.title ?? ""} (${(d as { year?: unknown }).year ?? "?"})`);
  }

  const out: { id: string; file: string }[] = [];
  for (const item of items) {
    const meta = await getJson<{ files?: { name: string }[]; metadata?: Record<string, unknown> }>(
      `https://archive.org/metadata/${item.identifier}`,
    );
    // Lending-library scans answer 401 on download; skip them up front.
    if (isRestricted(meta.metadata)) {
      report.push(`- skipped (access-restricted): \`${item.identifier}\``);
      continue;
    }
    const file = pickDjvuText(meta.files ?? []);
    if (file) out.push({ id: item.identifier, file });
    else console.warn(`      (no _djvu.txt in ${item.identifier})`);
  }
  if (out.length === 0) throw new Error(`${source.id}: no archive.org item with OCR text matched`);
  return out;
}

/** A short look at each downloaded file, so a human can pick the right scan. */
function describeFile(sourceId: string, f: ManifestFile): void {
  const path = join(RAW, sourceId, f.name);
  report.push(`\n#### \`${f.name}\`${f.archiveId ? ` (archive id \`${f.archiveId}\`)` : ""} — ${f.bytes} bytes`);
  if (f.name.endsWith(".zip")) {
    report.push("(zip — contents listed by the parser session)");
    return;
  }
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  report.push(`${lines.length} non-empty lines. First 25:`);
  report.push("```", ...lines.slice(0, 25).map((l) => l.slice(0, 160)), "```");
  const mid = Math.floor(lines.length / 2);
  report.push("Sample from the middle:", "```", ...lines.slice(mid, mid + 8).map((l) => l.slice(0, 160)), "```");
}

async function fetchSource(source: SourceConfig, prev: ManifestEntry | undefined): Promise<ManifestEntry> {
  const prevFile = (name: string) => prev?.files.find((f) => f.name === name);
  const files: ManifestFile[] = [];

  if (source.format === "archive-djvu-txt") {
    for (const { id, file } of await resolveArchive(source)) {
      const url = `https://archive.org/download/${id}/${encodeURIComponent(file)}`;
      files.push(await fetchFile(source.id, url, file, prevFile(file), id));
    }
  } else {
    if (!source.url) throw new Error(`${source.id}: missing url`);
    const name = basename(new URL(source.url).pathname);
    files.push(await fetchFile(source.id, source.url, name, prevFile(name)));
  }

  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    format: source.format,
    license: source.license,
    retrievedAt: new Date().toISOString(),
    files,
  };
}

async function main(): Promise<void> {
  const onlyArg = process.argv.find((a) => a.startsWith("--only"));
  const only = onlyArg ? (onlyArg.split("=")[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1]).split(",") : null;

  const { sources } = JSON.parse(readFileSync(SOURCES, "utf8")) as { sources: SourceConfig[] };
  const manifest = loadManifest();
  const failed: { id: string; error: string }[] = [];

  for (const source of activeSources(sources)) {
    if (only && !only.includes(source.id)) continue;
    console.log(`> ${source.id} (${source.format})`);
    report.push(`\n## ${source.id} — ${source.title}`);
    const prev = manifest.entries.find((e) => e.id === source.id);
    try {
      const entry = await fetchSource(source, prev);
      manifest.entries = [...manifest.entries.filter((e) => e.id !== source.id), entry];
      for (const f of entry.files) describeFile(source.id, f);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`  x ${source.id}: ${error}`);
      failed.push({ id: source.id, error });
      report.push(`**FAILED:** ${error}`);
    }
  }

  manifest.entries.sort((a, b) => a.id.localeCompare(b.id));
  manifest.generatedAt = new Date().toISOString();
  validateManifest(manifest);
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(FAILED, JSON.stringify(failed, null, 2) + "\n");
  writeFileSync(REPORT, `# Scripture fetch report\n\nGenerated ${manifest.generatedAt}\n${report.join("\n")}\n`);

  console.log(`\nmanifest: ${manifest.entries.length} sources, failed: ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
