/**
 * react and react-dom must be the same exact version: react-dom throws at
 * startup on a mismatch ("Incompatible React versions"), which a typecheck
 * and the unit tests would not catch. Both are pinned so a bump is deliberate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Pkg = { version: string; dependencies: Record<string, string> };
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Pkg;

test("react and react-dom are pinned to the same version", () => {
  const { dependencies } = read("package.json");
  assert.match(dependencies.react, /^\d+\.\d+\.\d+$/, "react is pinned to an exact version");
  assert.equal(dependencies["react-dom"], dependencies.react);
});

test("the installed react and react-dom match package.json", () => {
  const want = read("package.json").dependencies.react;
  assert.equal(read("node_modules/react/package.json").version, want);
  assert.equal(read("node_modules/react-dom/package.json").version, want);
});
