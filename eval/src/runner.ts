/**
 * Eval runner — CLI entry point.
 *
 * PHASE 0 STUB. Argument parsing and variant loading are wired up so the config
 * layer is exercised end to end; executing the pipeline, scoring, and persisting
 * results are Phase 4. It loads the variant, prints it, and exits non-zero with
 * "not implemented" rather than pretending to run.
 *
 *   npm run eval:run -- --variant baseline
 */
import { loadVariant } from "./config";

function parseVariantName(argv: string[]): string {
  const i = argv.indexOf("--variant");
  if (i === -1) throw new Error("Missing required argument: --variant <name>");
  const name = argv[i + 1];
  if (!name || name.startsWith("--")) {
    throw new Error("--variant requires a value, e.g. --variant baseline");
  }
  return name;
}

function main(): void {
  const variant = loadVariant(parseVariantName(process.argv.slice(2)));

  console.log(`\nVariant "${variant.name}" loaded and validated.`);
  console.log(`  ${variant.description}\n`);
  console.log(`  embedding    ${variant.embeddingModel}`);
  console.log(
    `  chunking     ${variant.chunkStrategy.size} tokens, ` +
      `${variant.chunkStrategy.overlap * 100}% overlap, ` +
      `table "${variant.chunkStrategy.tableName}"`,
  );
  console.log(
    `  retrieval    ${variant.retrieval.mode}, topK=${variant.retrieval.topK}` +
      (variant.retrieval.rrfK ? `, rrfK=${variant.retrieval.rrfK}` : "") +
      (variant.retrieval.searchTop
        ? `, searchTop=${variant.retrieval.searchTop}`
        : "") +
      `, rerank=${variant.retrieval.rerank ? variant.retrieval.rerank.model : "none"}`,
  );
  console.log(`  queryRewrite ${variant.queryRewrite}`);
  console.log(
    `  generation   ${variant.generation.model}, prompt ` +
      `${variant.generation.promptVersion}, maxTokens ${variant.generation.maxTokens}\n`,
  );

  console.error("not implemented — the runner lands in Phase 4.");
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
