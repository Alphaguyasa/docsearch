/**
 * Clear the eval disk cache.
 *
 *   npm run eval:cache:clear                 # everything
 *   npm run eval:cache:clear -- generation   # one namespace
 *   npm run eval:cache:clear -- --dry-run
 *
 * The cache is the harness's main cost lever, so wiping it is not free: every
 * cleared entry is an API call that has to be paid for again. This prints what
 * it will remove and how much is there before doing it.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { CACHE_DIR } from "../eval/src/cache";

interface NamespaceStat {
  name: string;
  entries: number;
  bytes: number;
}

function measure(dir: string): NamespaceStat[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const nsDir = path.join(dir, e.name);
      const files = readdirSync(nsDir).filter((f) => f.endsWith(".json"));
      const bytes = files.reduce(
        (sum, f) => sum + statSync(path.join(nsDir, f)).size,
        0,
      );
      return { name: e.name, entries: files.length, bytes };
    })
    .sort((a, b) => b.entries - a.entries);
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targets = args.filter((a) => !a.startsWith("--"));

  if (!existsSync(CACHE_DIR)) {
    console.log(`Nothing to clear — ${CACHE_DIR} does not exist.`);
    return;
  }

  const all = measure(CACHE_DIR);
  if (all.length === 0) {
    console.log(`Nothing to clear — ${CACHE_DIR} holds no namespaces.`);
    return;
  }

  const selected = targets.length > 0 ? all.filter((n) => targets.includes(n.name)) : all;

  const unknown = targets.filter((t) => !all.some((n) => n.name === t));
  if (unknown.length > 0) {
    console.error(
      `Unknown namespace(s): ${unknown.join(", ")}\n` +
        `Present: ${all.map((n) => n.name).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n${CACHE_DIR}`);
  for (const ns of all) {
    const mark = selected.includes(ns) ? "×" : " ";
    console.log(
      `  ${mark} ${ns.name.padEnd(20)} ${String(ns.entries).padStart(6)} entries  ` +
        `${human(ns.bytes).padStart(9)}`,
    );
  }

  const entries = selected.reduce((s, n) => s + n.entries, 0);
  const bytes = selected.reduce((s, n) => s + n.bytes, 0);

  if (dryRun) {
    console.log(`\n(dry run) would remove ${entries} entries, ${human(bytes)}.\n`);
    return;
  }

  for (const ns of selected) {
    rmSync(path.join(CACHE_DIR, ns.name), { recursive: true, force: true });
  }

  console.log(
    `\nRemoved ${entries} entries (${human(bytes)}) from ` +
      `${selected.length} namespace(s).\n` +
      `Every one is an API call the next run pays for again.\n`,
  );
}

main();
