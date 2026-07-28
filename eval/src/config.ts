/**
 * Variant config loading and validation.
 *
 * A variant is one experiment arm, stored as JSON in eval/config/. Validation is
 * strict on purpose: an unknown key is almost always a typo (`topk` for `topK`),
 * and silently ignoring it would produce a run whose settings differ from what
 * the file appears to say — the one failure mode that invalidates every number
 * the harness produces.
 *
 * Deliberately free of app imports, so loading a config needs no credentials.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { Variant } from "./types";

export const CONFIG_DIR = "eval/config";

const chunkStrategySchema = z.strictObject({
  size: z.number().int().positive(),
  overlap: z.number().min(0).max(1),
  tableName: z.string().min(1),
});

const rerankSchema = z.strictObject({
  model: z.string().min(1),
  topN: z.number().int().positive(),
});

const retrievalSchema = z.strictObject({
  mode: z.enum(["dense", "hybrid", "keyword"]),
  topK: z.number().int().positive(),
  rrfK: z.number().positive().optional(),
  searchTop: z.number().int().positive().optional(),
  rerank: rerankSchema.nullable().optional(),
});

const generationSchema = z.strictObject({
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  maxTokens: z.number().int().positive(),
});

const variantSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string(),
  embeddingModel: z.string().min(1),
  chunkStrategy: chunkStrategySchema,
  retrieval: retrievalSchema,
  queryRewrite: z.enum(["none", "hyde", "decompose"]),
  generation: generationSchema,
});

/**
 * Load and validate `eval/config/<name>.json`.
 *
 * Throws with the offending field path(s) named — a missing or misspelled key
 * should be obvious from the message alone, without opening the schema.
 */
export function loadVariant(name: string): Variant {
  const file = path.join(CONFIG_DIR, `${name}.json`);

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `Variant config not found: ${file}\n` +
        `  Create it, or check the name passed to --variant.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Variant config is not valid JSON: ${file}\n  ${errorMessage(err)}`,
    );
  }

  const result = variantSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const where = issue.path.length ? issue.path.join(".") : "(root)";
        return `  - ${where}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Invalid variant config: ${file}\n${details}`);
  }

  // The filename is the identity used in run records and comparisons; a config
  // whose `name` disagrees with its filename makes runs impossible to trace.
  if (result.data.name !== name) {
    throw new Error(
      `Variant name mismatch in ${file}: file is "${name}" but "name" is ` +
        `"${result.data.name}". They must match.`,
    );
  }

  return result.data;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
