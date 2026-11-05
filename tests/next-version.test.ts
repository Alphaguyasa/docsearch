import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const installed = JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version as string;

const parts = (v: string) => v.split(".").map(Number);
const atLeast = (v: string, min: string) => {
  const [a, b] = [parts(v), parts(min)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

test("next is pinned exactly and installed at that version", () => {
  // An exact pin, so a deploy never picks up a Next release no run has checked.
  assert.match(pkg.dependencies.next, /^\d+\.\d+\.\d+$/);
  assert.equal(installed, pkg.dependencies.next);
});

test("next is at least 16.4.5 (seven moderate advisories fixed, 2026-11-03)", () => {
  // GHSA-pc58-hwjq-p385, GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2 and four 'use cache' ones.
  assert.ok(atLeast(installed, "16.4.5"), `next ${installed}`);
});
