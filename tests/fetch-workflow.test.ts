/**
 * fetch-scripture's manifest commit is a GITHUB_TOKEN push, which never
 * triggers other workflows, so fetched sources sat unembedded (2026-10-21);
 * and two queued runs conflicted under `git pull --rebase` (2026-10-22).
 * A workflow file has no other test before it runs for real.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const wf = readFileSync(".github/workflows/fetch-scripture.yml", "utf8");

test("fetch dispatches ingest itself, which needs actions: write", () => {
  assert.match(wf, /^\s+actions: write/m);
  assert.match(wf, /gh workflow run ingest-scripture\.yml/);
  assert.match(wf, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

test("ingest starts only after a pushed manifest from a clean fetch", () => {
  const step = wf.slice(wf.indexOf("- name: Start ingest"));
  assert.match(step, /steps\.commit\.outputs\.pushed == '1'/);
  assert.match(step, /steps\.fetch\.outcome == 'success'/);
  assert.match(step, /steps\.dry\.outcome == 'success'/);
});

test("the manifest commit re-applies this run's files instead of rebasing", () => {
  assert.doesNotMatch(wf, /^\s+[^#\s].*git pull --rebase/m);
  assert.match(wf, /git reset -q --hard "origin\/\$GITHUB_REF_NAME"/);
  assert.match(wf, /echo "pushed=1" >> "\$GITHUB_OUTPUT"/);
});
