/**
 * @vitest/coverage-v8 declares an exact peer on vitest (5.1.0 wants vitest
 * 5.1.0), so the two must move together. A coverage plugin from another
 * release fails only under `vitest run --coverage`, which CI does not run, so
 * the mismatch would surface the next time someone measures coverage.
 *
 * Vitest 5 also changed two defaults that matter here: `clearMocks` is on and
 * coverage `include` is matched relative to the root. The config's include
 * patterns are already root-relative, so the reported file set is unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Pkg = { version: string; devDependencies: Record<string, string> };
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Pkg;

test("vitest and its coverage plugin ask for the same range, on major 5", () => {
  const { devDependencies: dev } = read("package.json");
  assert.equal(dev["@vitest/coverage-v8"], dev.vitest);
  assert.match(dev.vitest, /^\^5\./);
});

test("the installed vitest and coverage plugin are the same release", () => {
  assert.equal(
    read("node_modules/@vitest/coverage-v8/package.json").version,
    read("node_modules/vitest/package.json").version,
  );
});

test("coverage include patterns are root-relative (Vitest 5 matching)", () => {
  const config = readFileSync("vitest.config.ts", "utf8");
  const include = config.match(/coverage:\s*{[\s\S]*?include:\s*\[([^\]]*)\]/);
  assert.ok(include, "coverage.include is set");
  for (const pattern of include[1].match(/"[^"]+"/g) ?? []) {
    assert.match(pattern, /^"eval\/src\//, `${pattern} starts at the project root`);
  }
});
