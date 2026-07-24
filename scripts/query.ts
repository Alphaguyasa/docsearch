/**
 * Query CLI — run hybrid retrieval and print the ranked chunks.
 *
 *   npm run query -- "<question>" [--mode hybrid|vector|keyword]
 *
 * Prints a table of rank, document, page, vector/keyword/fused scores, and the
 * first 150 characters of each chunk. No answer generation — retrieval only.
 */
import "../src/lib/loadenv"; // must precede modules that read env

import { retrieve, type RetrieveMode } from "../src/lib/retrieve";

const MODES: RetrieveMode[] = ["hybrid", "vector", "keyword"];
const SNIPPET_CHARS = 150;

interface Args {
  question: string;
  mode: RetrieveMode;
}

function parseArgs(argv: string[]): Args {
  let question: string | undefined;
  let mode: RetrieveMode = "hybrid";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") {
      const value = argv[++i];
      if (!MODES.includes(value as RetrieveMode)) {
        throw new Error(`--mode must be one of: ${MODES.join(", ")}`);
      }
      mode = value as RetrieveMode;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (question === undefined) {
      question = arg;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }

  if (!question) {
    throw new Error('Usage: npm run query -- "<question>" [--mode hybrid|vector|keyword]');
  }
  return { question, mode };
}

function fmtScore(n: number | null, digits: number): string {
  return n === null ? "-" : n.toFixed(digits);
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

async function main(): Promise<void> {
  const { question, mode } = parseArgs(process.argv.slice(2));

  const { results, degraded } = await retrieve(question, { mode });

  console.log(`\nQuery: ${question}`);
  console.log(`Mode:  ${mode}${degraded ? "  ⚠ DEGRADED (partial search — one source failed)" : ""}\n`);

  if (results.length === 0) {
    console.log("No results.");
    return;
  }

  const cols: [string, number][] = [
    ["#", 3],
    ["document", 40],
    ["pg", 4],
    ["vector", 8],
    ["keyword", 9],
    ["fused", 8],
  ];
  console.log(cols.map(([h, w]) => pad(h, w)).join(" ") + " snippet");
  console.log(cols.map(([, w]) => "-".repeat(w)).join(" ") + " " + "-".repeat(SNIPPET_CHARS));

  results.forEach((r, i) => {
    const snippet = r.content.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS);
    const row = [
      pad(String(i + 1), 3),
      pad(r.filename.slice(0, 40), 40),
      pad(r.pageNumber === null ? "-" : String(r.pageNumber), 4),
      pad(fmtScore(r.vectorScore, 3), 8),
      pad(fmtScore(r.keywordScore, 4), 9),
      pad(fmtScore(r.fusedScore, 4), 8),
    ].join(" ");
    console.log(`${row} ${snippet}`);
  });
  console.log();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
