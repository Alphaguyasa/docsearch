/**
 * Anthropic SDK 1.x sends API version 2026-10-21, where temperature, top_p and
 * top_k are a 400 on every model (NEEDS_APPROVAL #13, decided 2026-11-02). The
 * Anthropic paths must not send them; the Gemini paths still may.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the Anthropic SDK is on 1.x or later", () => {
  const { dependencies } = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
  const major = Number(dependencies["@anthropic-ai/sdk"].replace(/^\D*/, "").split(".")[0]);
  assert.ok(major >= 1, `@anthropic-ai/sdk ${dependencies["@anthropic-ai/sdk"]}`);
});

/** The text from a marker comment to the next section marker or the end. */
function section(file: string, marker: string): string {
  const text = readFileSync(file, "utf8");
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `${file} has the "${marker}" section`);
  const next = text.indexOf("// ---", start + marker.length);
  return text.slice(start, next < 0 ? undefined : next);
}

test("no Anthropic request sends sampling parameters", () => {
  for (const file of ["src/lib/llm.ts", "eval/src/provider.ts"]) {
    const code = section(file, "// --- Anthropic");
    assert.doesNotMatch(code, /\b(temperature|top_p|top_k)\s*:/, `${file} Anthropic section`);
  }
});
