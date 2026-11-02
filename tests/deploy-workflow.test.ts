/**
 * The production deploy pins the Vercel CLI (ROADMAP 28). From 65.3.1 on,
 * `vercel link` failed with "The specified scope does not exist" for this team,
 * and every deploy since 2026-10-26 went red while `vercel@latest` floated.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const text = readFileSync(".github/workflows/deploy-not-alone.yml", "utf8");

test("the deploy pins one exact Vercel CLI version", () => {
  const pin = text.match(/^\s*VERCEL_CLI: vercel@(\S+)\s*$/m);
  assert.ok(pin, "VERCEL_CLI is set in the workflow env");
  assert.match(pin[1], /^\d+\.\d+\.\d+$/, "an exact version, not latest or a range");
});

test("every Vercel call uses the pinned CLI, never @latest", () => {
  assert.doesNotMatch(text, /vercel@latest/);
  const calls = text.match(/npx --yes "\$VERCEL_CLI" (\w+)/g) ?? [];
  const commands = calls.map((c) => c.split(" ").pop());
  // link, the env sync's rm and add, and the deploy itself.
  assert.deepEqual(commands.sort(), ["deploy", "env", "env", "link"]);
  assert.doesNotMatch(text, /npx --yes vercel/, "no call names the CLI package directly");
});
