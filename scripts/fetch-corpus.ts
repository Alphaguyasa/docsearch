/**
 * Corpus fetcher — bulk-download arXiv PDFs for one subfield into corpus/.
 *
 *   npm run corpus:fetch -- --category cs.CL --count 200 --from 2023-01-01 --to 2024-12-31
 *   npm run corpus:fetch                      # re-fetch exactly what the manifest names
 *
 * WHY cs.CL: multi-hop questions need two documents that share a named entity,
 * and NLP papers share them densely — datasets (SQuAD, GLUE), models (BERT, T5),
 * benchmarks, and metric names recur across the literature. They are also thick
 * with numbers (scores, parameter counts, table cells), which is what gives BM25
 * something to win on. A prose-heavy corpus would show no hybrid-search gain and
 * lead you to conclude, wrongly, that hybrid does not help.
 *
 * REPRODUCIBILITY: corpus/manifest.json records the arXiv id, version, title and
 * SHA-256 of every PDF. Commit the manifest, gitignore the PDFs. Anyone can
 * rebuild a byte-identical corpus without redistributing papers, and a silent
 * change to a fetched file is a loud failure rather than a quiet metric shift.
 *
 * ETIQUETTE: arXiv asks for one request at a time with a few seconds between,
 * and a descriptive User-Agent. Requests are strictly serialised with a 3s floor
 * and no concurrency anywhere in this file. Uses the public API — never scrapes
 * the website.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { parseAtomFeed, pdfFilename, type Paper } from "../eval/src/arxiv";
import { chunkPages } from "../src/lib/chunk";
import { extractPdf } from "../src/lib/pipeline";

const ARXIV_API = "http://export.arxiv.org/api/query";
const CORPUS_DIR = "corpus";
const MANIFEST_FILE = path.join(CORPUS_DIR, "manifest.json");

/** arXiv's stated guidance is one request every few seconds. */
const REQUEST_DELAY_MS = 3000;
const PAGE_SIZE = 100;

const USER_AGENT =
  "docsearch-eval-corpus/1.0 (retrieval evaluation harness; " +
  "https://github.com/Alphaguyasa/docsearch)";

/** Baseline chunking, so the reported counts are what ingestion will produce. */
const BASELINE_TARGET_TOKENS = 800;
const BASELINE_OVERLAP_RATIO = 0.15;

interface ManifestEntry {
  arxivId: string;
  version: number;
  title: string;
  file: string;
  sha256: string;
  bytes: number;
}

interface Manifest {
  category: string;
  from: string | null;
  to: string | null;
  fetchedAt: string;
  entries: ManifestEntry[];
}

interface Args {
  category: string;
  count: number;
  from: string | null;
  to: string | null;
  manifest: string;
  outDir: string;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    category: "cs.CL",
    count: 200,
    from: null,
    to: null,
    manifest: MANIFEST_FILE,
    outDir: CORPUS_DIR,
    yes: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--yes") {
      args.yes = true;
      continue;
    }
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);

    switch (flag) {
      case "--category":
        args.category = value;
        break;
      case "--count":
        args.count = Number(value);
        if (!Number.isInteger(args.count) || args.count <= 0) {
          throw new Error("--count must be a positive integer");
        }
        break;
      case "--from":
        args.from = requireDate(value, "--from");
        break;
      case "--to":
        args.to = requireDate(value, "--to");
        break;
      case "--manifest":
        args.manifest = value;
        break;
      case "--out":
        args.outDir = value;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function requireDate(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be YYYY-MM-DD, got "${value}"`);
  }
  return value;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// --- arXiv Atom parsing ------------------------------------------------------

async function arxivRequest(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

/** Search arXiv, paging serially with the courtesy delay between requests. */
async function search(args: Args): Promise<Paper[]> {
  const terms = [`cat:${args.category}`];
  if (args.from || args.to) {
    const from = (args.from ?? "1900-01-01").replace(/-/g, "") + "0000";
    const to = (args.to ?? "2100-01-01").replace(/-/g, "") + "2359";
    terms.push(`submittedDate:[${from} TO ${to}]`);
  }

  const query = terms.join(" AND ");
  const found: Paper[] = [];
  let skippedTotal = 0;

  for (let start = 0; found.length < args.count; start += PAGE_SIZE) {
    const wanted = Math.min(PAGE_SIZE, args.count - found.length);
    const url =
      `${ARXIV_API}?search_query=${encodeURIComponent(query)}` +
      `&start=${start}&max_results=${wanted}` +
      // Ascending by submission date makes the result set stable across days;
      // "newest first" would return a different corpus every run.
      `&sortBy=submittedDate&sortOrder=ascending`;

    process.stdout.write(`  querying ${start + 1}–${start + wanted}... `);
    const xml = await arxivRequest(url);
    const { papers, skipped } = parseAtomFeed(xml);
    skippedTotal += skipped;
    console.log(`${papers.length} result(s)`);

    if (papers.length === 0) {
      console.log("  (no more results — the category/date range is exhausted)");
      break;
    }
    found.push(...papers);
    await sleep(REQUEST_DELAY_MS);
  }

  if (skippedTotal > 0) {
    console.log(`  ⚠ ${skippedTotal} entr(ies) skipped — missing id or title`);
  }
  return found.slice(0, args.count);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Download one PDF, or reuse the copy on disk when its hash already matches.
 *
 * Returns the bytes plus whether the network was touched, so the caller only
 * pays the courtesy delay for requests it actually made — that is what makes a
 * resumed run fast instead of re-waiting 3s per already-present file.
 */
async function fetchPdf(
  paper: Paper,
  outDir: string,
  expectedHash: string | null,
): Promise<{ bytes: Uint8Array; file: string; downloaded: boolean }> {
  const file = pdfFilename(paper);
  const fullPath = path.join(outDir, file);

  if (existsSync(fullPath)) {
    const existing = new Uint8Array(readFileSync(fullPath));
    const hash = sha256(existing);
    if (expectedHash === null || hash === expectedHash) {
      return { bytes: existing, file, downloaded: false };
    }
    // A manifest run found a file whose contents differ from what was recorded.
    // Silently re-downloading would hide corpus drift, which is exactly the
    // thing the manifest exists to catch.
    throw new Error(
      `HASH MISMATCH for ${file}\n` +
        `  manifest: ${expectedHash}\n` +
        `  on disk:  ${hash}\n` +
        `  The local file is not the one the manifest describes. Delete it to ` +
        `re-download, or investigate before trusting any metric computed on it.`,
    );
  }

  const url = `https://arxiv.org/pdf/${paper.arxivId}v${paper.version}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Download failed for ${paper.arxivId}: ${res.status} ${res.statusText}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  if (expectedHash !== null && sha256(bytes) !== expectedHash) {
    throw new Error(
      `HASH MISMATCH downloading ${file}\n` +
        `  manifest: ${expectedHash}\n` +
        `  fetched:  ${sha256(bytes)}\n` +
        `  arXiv served different bytes than the manifest records.`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(fullPath, bytes);
  return { bytes, file, downloaded: true };
}

// --- Corpus analysis ---------------------------------------------------------

interface CorpusStats {
  documents: number;
  totalPages: number;
  keptPages: number;
  chunks: number;
  tokens: number;
  failed: string[];
}

/**
 * Run the REAL extract + chunk path over the downloaded PDFs.
 *
 * These are exact counts at the baseline chunk size, not estimates: the same
 * functions ingestion uses, with the same settings. The only figure that stays
 * approximate is embedding tokens, which uses the project's ceil(chars/4)
 * estimator rather than Voyage's own tokenizer.
 */
async function analyse(outDir: string, files: string[]): Promise<CorpusStats> {
  const stats: CorpusStats = {
    documents: 0,
    totalPages: 0,
    keptPages: 0,
    chunks: 0,
    tokens: 0,
    failed: [],
  };

  for (const [i, file] of files.entries()) {
    if (i % 10 === 0) {
      process.stdout.write(`\r  analysing ${i + 1}/${files.length}...`);
    }
    try {
      const bytes = new Uint8Array(readFileSync(path.join(outDir, file)));
      const { totalPages, pages } = await extractPdf(bytes);
      const chunks = chunkPages(pages, {
        targetTokens: BASELINE_TARGET_TOKENS,
        overlapRatio: BASELINE_OVERLAP_RATIO,
      });

      stats.documents++;
      stats.totalPages += totalPages;
      stats.keptPages += pages.length;
      stats.chunks += chunks.length;
      stats.tokens += chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    } catch (err) {
      stats.failed.push(`${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  process.stdout.write(`\r  analysed ${files.length} file(s).            \n`);
  return stats;
}

function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.outDir, { recursive: true });

  const existingManifest: Manifest | null = existsSync(args.manifest)
    ? (JSON.parse(readFileSync(args.manifest, "utf8")) as Manifest)
    : null;

  let papers: Paper[];
  let expectedHashes = new Map<string, string>();

  if (existingManifest) {
    // Manifest mode: rebuild EXACTLY the recorded corpus. No search, so the
    // result cannot drift with arXiv's index.
    console.log(
      `\nManifest found: ${args.manifest}\n` +
        `  ${existingManifest.entries.length} paper(s), category ${existingManifest.category}` +
        `${existingManifest.from ? `, ${existingManifest.from} to ${existingManifest.to}` : ""}\n` +
        `  Fetching exactly these ids and versions — not searching.\n`,
    );
    papers = existingManifest.entries.map((e) => ({
      arxivId: e.arxivId,
      version: e.version,
      title: e.title,
    }));
    expectedHashes = new Map(existingManifest.entries.map((e) => [e.arxivId, e.sha256]));
  } else {
    console.log(
      `\nSearching arXiv — category ${args.category}, up to ${args.count} paper(s)` +
        `${args.from ? `, ${args.from} to ${args.to ?? "now"}` : ""}\n`,
    );
    papers = await search(args);
    if (papers.length === 0) throw new Error("Search returned no papers.");
    console.log(`\nFound ${papers.length} paper(s).\n`);
  }

  // --- Download (serial, with the courtesy delay) --------------------------
  console.log("Downloading (serial, 3s between requests — arXiv etiquette):");
  const entries: ManifestEntry[] = [];
  let downloaded = 0;
  let reused = 0;

  for (const [i, paper] of papers.entries()) {
    const label = `${i + 1}/${papers.length} ${paper.arxivId}v${paper.version}`;
    const result = await fetchPdf(
      paper,
      args.outDir,
      expectedHashes.get(paper.arxivId) ?? null,
    );

    entries.push({
      arxivId: paper.arxivId,
      version: paper.version,
      title: paper.title,
      file: result.file,
      sha256: sha256(result.bytes),
      bytes: result.bytes.byteLength,
    });

    if (result.downloaded) {
      downloaded++;
      console.log(`  ${label}  ${(result.bytes.byteLength / 1024).toFixed(0)} KB`);
      await sleep(REQUEST_DELAY_MS);
    } else {
      reused++;
      console.log(`  ${label}  already on disk, hash matches — skipped`);
    }
  }

  const manifest: Manifest = {
    category: existingManifest?.category ?? args.category,
    from: existingManifest?.from ?? args.from,
    to: existingManifest?.to ?? args.to,
    fetchedAt: existingManifest?.fetchedAt ?? new Date().toISOString(),
    entries,
  };
  mkdirSync(path.dirname(args.manifest), { recursive: true });
  writeFileSync(args.manifest, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `\n${downloaded} downloaded, ${reused} reused.  Manifest: ${args.manifest}\n`,
  );

  // --- Analyse -------------------------------------------------------------
  console.log("Analysing at the baseline chunk size (800 tokens, 15% overlap):");
  const pdfFiles = readdirSync(args.outDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const stats = await analyse(args.outDir, pdfFiles);

  const meanChunks = stats.documents === 0 ? 0 : stats.chunks / stats.documents;

  console.log("\n── Corpus ──────────────────────────────────────────────");
  console.log(`  documents            ${String(stats.documents).padStart(7)}`);
  console.log(`  pages (total)        ${String(stats.totalPages).padStart(7)}`);
  console.log(
    `  pages (usable text)  ${String(stats.keptPages).padStart(7)}` +
      `   ${stats.totalPages - stats.keptPages} dropped as likely scanned`,
  );
  console.log(`  CHUNKS               ${String(stats.chunks).padStart(7)}   exact, at baseline settings`);
  console.log(`  mean chunks/doc      ${meanChunks.toFixed(1).padStart(7)}`);
  console.log(
    `  embedding tokens   ~${String(stats.tokens).padStart(8)}   approx (ceil(chars/4), not Voyage's tokenizer)`,
  );

  if (stats.failed.length > 0) {
    console.log(`\n  ⚠ ${stats.failed.length} file(s) failed to parse:`);
    for (const failure of stats.failed.slice(0, 5)) console.log(`    - ${failure}`);
    if (stats.failed.length > 5) console.log(`    ... and ${stats.failed.length - 5} more`);
  }

  // --- Verdict against the 2,000–5,000 target ------------------------------
  console.log("\n── Target: 2,000–5,000 chunks ──────────────────────────");
  if (stats.chunks < 2000) {
    const needed = Math.ceil((2000 - stats.chunks) / Math.max(1, meanChunks));
    console.log(
      `  ✗ ${stats.chunks} chunks is BELOW the range.\n` +
        `    At ${meanChunks.toFixed(1)} chunks/doc, about ${needed} more paper(s) would reach 2,000.\n` +
        `    Re-run with --count ${papers.length + needed} after deleting the manifest.`,
    );
  } else if (stats.chunks > 5000) {
    console.log(
      `  ⚠ ${stats.chunks} chunks is ABOVE the range. Workable, but every\n` +
        `    chunk-size experiment arm re-embeds all of it — consider trimming.`,
    );
  } else {
    console.log(`  ✓ ${stats.chunks} chunks is inside the range.`);
  }

  // --- Stop and ask --------------------------------------------------------
  console.log(
    "\nIngest will embed every chunk and spend Voyage quota.\n" +
      `Command: npm run ingest -- ${args.outDir}\n`,
  );

  if (!args.yes) {
    const answer = await ask("Run ingest now? [y/N] ");
    if (answer !== "y" && answer !== "yes") {
      console.log("\nStopped before ingest. Nothing was embedded.\n");
      return;
    }
  }

  console.log("\nHanding off to the ingest pipeline...\n");
  const result = spawnSync("npm", ["run", "ingest", "--", args.outDir], {
    stdio: "inherit",
    shell: true,
  });
  process.exitCode = result.status ?? 1;
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
});
