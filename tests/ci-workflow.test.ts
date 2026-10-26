/**
 * A critical Next advisory and a high zod one were published on 2026-10-25
 * while CI stayed green; they surfaced only because a run happened to run
 * `npm audit`. CI now audits, and this keeps the step from being dropped.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const wf = readFileSync(".github/workflows/ci.yml", "utf8");

test("CI fails on high or critical advisories in production dependencies", () => {
  assert.match(wf, /^\s+run: npm audit --omit=dev --audit-level=high$/m);
});

test("the audit runs after install and before the slower checks", () => {
  const audit = wf.indexOf("npm audit");
  assert.ok(wf.indexOf("run: npm ci") < audit);
  assert.ok(audit < wf.indexOf("npm run lint"));
});

test("no CI step is allowed to fail quietly", () => {
  assert.doesNotMatch(wf, /continue-on-error/);
});
