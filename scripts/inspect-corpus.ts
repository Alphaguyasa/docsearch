/**
 * Inspect the fetched corpus: segmentation, OCR quality, and what gets dropped.
 *
 *   npm run corpus:inspect                       # every downloaded work
 *   npm run corpus:inspect -- --only enoch-charles
 *   npm run corpus:inspect -- --samples 5        # show kept/rejected examples
 *
 * WHAT THIS IS FOR. MIN_TEXT_QUALITY decides what enters the index and what is
 * thrown away, and a threshold picked by eye is a threshold nobody can defend.
 * This prints the actual distribution of paragraph quality scores for each
 * work, either side of the current cut-off, with real examples of what lands on
 * each side — so the number is calibrated against the corpus rather than
 * against intuition, and can be re-checked whenever a work is added.
 *
 * It reads only local files: no database, no API keys, no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { CATALOG, workById } from "../src/lib/corpus/catalog";
import { workFilename } from "../src/lib/corpus/fetch";
import { MIN_OCR_PARAGRAPH_CHARS, MIN_TEXT_QUALITY, textQuality } from "../src/lib/corpus/segment";
import type { Work } from "../src/lib/corpus/types";

const CORPUS_DIR = path.join("corpus", "orthodox");

interface Args {
  only: string[] | null;
  samples: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { only: null, samples: 0 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only needs a comma-separated list of work ids.");
      args.only = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (flag === "--samples") {
      args.samples = Number(argv[++i]);
      if (!Number.isInteger(args.samples) || args.samples < 0) {
        throw new Error("--samples needs a non-negative integer.");
      }
    } else if (flag.startsWith("--")) {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

function read(work: Work): string | null {
  try {
    return readFileSync(path.join(CORPUS_DIR, workFilename(work)), "utf8");
  } catch {
    return null;
  }
}

/** A 10-bucket histogram of scores, rendered as a bar per decile. */
function histogram(scores: number[]): string {
  const buckets = new Array(10).fill(0);
  for (const score of scores) {
    buckets[Math.min(Math.floor(score * 10), 9)]++;
  }
  const peak = Math.max(...buckets, 1);
  return buckets
    .map((count, i) => {
      const bar = "#".repeat(Math.round((count / peak) * 28));
      const lo = (i / 10).toFixed(1);
      // Mark the bucket the threshold falls in, so the cut is visible in place.
      const cut = Math.floor(MIN_TEXT_QUALITY * 10) === i ? " <- MIN_TEXT_QUALITY" : "";
      return `      ${lo}  ${String(count).padStart(6)}  ${bar}${cut}`;
    })
    .join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  let works = CATALOG;
  if (args.only) {
    const missing = args.only.filter((id) => !workById(id));
    if (missing.length > 0) throw new Error(`Unknown work id(s): ${missing.join(", ")}`);
    const wanted = new Set(args.only);
    works = works.filter((w) => wanted.has(w.id));
  }

  // Only the OCR sources are worth scoring. CCEL and eBible are digital text,
  // not scans; running a scan-quality filter over them would be measuring noise
  // that is not there.
  const ocrWorks = works.filter(
    (w) => w.source.kind === "archive" || w.source.kind === "gutenberg",
  );

  console.log(
    `Scoring paragraph quality for ${ocrWorks.length} OCR-sourced work(s). ` +
      `Current floor: ${MIN_TEXT_QUALITY}\n`,
  );

  const allScores: number[] = [];

  for (const work of ocrWorks) {
    const raw = read(work);
    if (raw === null) {
      console.log(`${work.id} — not downloaded\n`);
      continue;
    }

    // The SAME two filters segmentOcr applies, in the same order. A calibration
    // tool that measures a slightly different population than ingestion uses is
    // worse than no tool: it would report a threshold as safe while ingestion
    // was applying it to a different distribution.
    const blocks = raw
      .split(/\n\s*\n/)
      .map((p) => p.replace(/[ \t]+/g, " ").trim())
      .filter((p) => p.length > 0);

    const paragraphs = blocks.filter((p) => p.length >= MIN_OCR_PARAGRAPH_CHARS);
    const tooShort = blocks.length - paragraphs.length;

    if (paragraphs.length === 0) {
      console.log(`${work.id} — every paragraph was under ${MIN_OCR_PARAGRAPH_CHARS} chars\n`);
      continue;
    }

    const scored = paragraphs.map((text) => ({ text, score: textQuality(text) }));
    const scores = scored.map((s) => s.score);
    allScores.push(...scores);

    const kept = scored.filter((s) => s.score >= MIN_TEXT_QUALITY);
    const keptChars = kept.reduce((sum, s) => sum + s.text.length, 0);
    const totalChars = scored.reduce((sum, s) => sum + s.text.length, 0);

    console.log(`${work.id} — ${work.title.slice(0, 60)}`);
    console.log(
      `   ${blocks.length} blocks · ${tooShort} under ${MIN_OCR_PARAGRAPH_CHARS} chars · ` +
        `${paragraphs.length} scored · keeping ${kept.length} ` +
        `(${((kept.length / paragraphs.length) * 100).toFixed(0)}% of scored, ` +
        `${((keptChars / totalChars) * 100).toFixed(0)}% of their text)`,
    );
    console.log(histogram(scores));

    if (args.samples > 0) {
      // Sample from just either side of the line: the paragraphs at the extremes
      // are obvious, and the ones that decide whether the threshold is right are
      // the borderline ones.
      const near = [...scored].sort(
        (a, b) => Math.abs(a.score - MIN_TEXT_QUALITY) - Math.abs(b.score - MIN_TEXT_QUALITY),
      );
      console.log("   borderline paragraphs:");
      for (const item of near.slice(0, args.samples)) {
        const verdict = item.score >= MIN_TEXT_QUALITY ? "KEEP" : "DROP";
        console.log(`     ${verdict} ${item.score.toFixed(3)}  ${item.text.replace(/\s+/g, " ").slice(0, 110)}`);
      }
    }
    console.log();
  }

  if (allScores.length > 0) {
    const sorted = [...allScores].sort((a, b) => a - b);
    const at = (q: number): string => sorted[Math.floor(sorted.length * q)].toFixed(3);
    console.log(
      `Across all OCR text: p10 ${at(0.1)} · median ${at(0.5)} · p90 ${at(0.9)} ` +
        `· ${((allScores.filter((s) => s >= MIN_TEXT_QUALITY).length / allScores.length) * 100).toFixed(0)}% kept`,
    );
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
