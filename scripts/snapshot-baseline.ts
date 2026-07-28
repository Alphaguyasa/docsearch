/**
 * Freeze a run as a committed gate baseline — Phase 9 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:baseline -- <runId|variant> [--name ci-smoke]
 *
 * WHY THIS HAS TO EXIST. `--gate` resolves its baseline from eval/runs/, which
 * is gitignored, so a fresh CI checkout has no runs at all and every gated build
 * would fail with "cannot gate" — not because anything regressed, but because
 * there was nothing to compare against. A gate needs its baseline committed, or
 * it is not a gate.
 *
 * WHAT IS KEPT AND WHY IT IS NOT THE WHOLE RUN. A run file carries the full text
 * of every retrieved chunk: 1.8 MB for 76 questions, most of it corpus text that
 * already lives in the database. The gate reads per-question metrics and the
 * aggregate footer, and nothing else. So the snapshot keeps questionId, metrics
 * and error per result, plus the header and footer — a few dozen kilobytes,
 * reviewable in a diff, and honest about being a derived artifact.
 *
 * The cost of that choice, stated: a snapshot cannot be used for anything
 * needing answers or chunks — --regressions with question text, or the Phase 8
 * drill-down. It is a gate baseline, not an archive.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readLocalRuns, resolveLocal } from "../eval/src/runs";

const BASELINE_DIR = "eval/baselines";

interface Args {
  ref: string;
  name: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let name = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name") {
      name = argv[++i] ?? "";
      if (!name) throw new Error("--name requires a value");
    } else if (argv[i].startsWith("--")) {
      throw new Error(`Unknown argument: ${argv[i]}`);
    } else positional.push(argv[i]);
  }
  if (positional.length !== 1) {
    throw new Error(
      "Usage: npm run eval:baseline -- <runId|variant> [--name ci-smoke]",
    );
  }
  return { ref: positional[0], name: name || "ci-smoke" };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const runs = readLocalRuns();
  const run = resolveLocal(args.ref, runs);

  // Re-read the file for the header and aggregate lines: resolveLocal returns a
  // parsed run, and the snapshot should carry the ORIGINAL header verbatim so
  // the baseline records which variant and commit produced it.
  const lines = readFileSync(run.source, "utf8").split("\n").filter((l) => l.trim());
  const header = JSON.parse(lines[0]);
  const footer = lines
    .map((l) => JSON.parse(l))
    .find((o) => o.type === "aggregate");

  const slim = run.results.map((r) => ({
    type: "result",
    questionId: r.questionId,
    metrics: r.metrics,
    error: r.error,
  }));

  const out = path.join(BASELINE_DIR, `${args.name}.jsonl`);
  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(
    out,
    [
      JSON.stringify({
        ...header,
        snapshotOf: run.runId,
        snapshotAt: new Date().toISOString(),
        note:
          "Gate baseline. Metrics only — retrieved chunks and answers are stripped. " +
          "Regenerate with npm run eval:baseline.",
      }),
      ...slim.map((r) => JSON.stringify(r)),
      ...(footer ? [JSON.stringify(footer)] : []),
    ].join("\n") + "\n",
  );

  const kb = (readFileSync(out).byteLength / 1024).toFixed(0);
  console.log(
    `Snapshotted ${run.runId.slice(0, 8)} (${run.variantName}, ${slim.length} result(s)) ` +
      `→ ${out}  [${kb} KB]`,
  );
  if (!footer) {
    console.log(
      "  ⚠ No aggregate footer in the source run, so resource metrics " +
        "(latency, cost) cannot be gated against this baseline.",
    );
  }
  console.log(`  Gate against it with:  npm run eval:run -- --gate ${out}`);
}

main();
