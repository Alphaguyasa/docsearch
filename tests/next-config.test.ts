/**
 * The image optimizer is off: no page uses next/image, and /_next/image is
 * where the critical Next advisory GHSA-2464-fhr4-w9xw lived (2026-10-25).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import nextConfig from "../next.config";

test("the image optimizer endpoint is turned off", () => {
  assert.equal(nextConfig.images?.unoptimized, true);
});

test("no page imports next/image, which would need the optimizer", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    assert.doesNotMatch(readFileSync(path.join("src", f), "utf8"), /from "next\/image"/, `${f} imports next/image`);
  }
});

// Next 16 builds and serves with Turbopack by default. A bundler flag in the
// scripts is either noise (--turbopack) or a silent switch back (--webpack).
test("dev and build use Next's default bundler", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(scripts.dev, "next dev");
  assert.equal(scripts.build, "next build");
});
