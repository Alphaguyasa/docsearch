/**
 * The ingest chain broke silently once when its PAT was revoked (2026-10-14).
 * It now chains with the default GITHUB_TOKEN; these pin the pieces that make
 * that work, since a workflow file has no other test before it runs for real.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const wf = readFileSync(".github/workflows/ingest-scripture.yml", "utf8");

test("ingest checks out with the default token, not a personal access token", () => {
  assert.doesNotMatch(wf, /secrets\.INGEST_PAT/);
});

test("ingest chains by dispatching itself, which needs actions: write", () => {
  assert.match(wf, /^\s+actions: write/m);
  assert.match(wf, /gh workflow run ingest-scripture\.yml --ref main/);
});

test("progress is only recorded when the checkout succeeded", () => {
  assert.match(wf, /if: always\(\) && steps\.checkout\.outcome == 'success'/);
  assert.match(wf, /id: checkout/);
});
