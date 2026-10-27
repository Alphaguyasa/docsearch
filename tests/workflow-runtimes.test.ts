/**
 * The v4 actions run on Node 20, which GitHub deprecated on its runners, and
 * the data workflows built on Node 22 while CI tested on 24. Every workflow
 * now uses Node 24 actions and builds on the Node CI tests.
 *
 * deploy-not-alone.yml is left out until the red deploy (ROADMAP 28) is
 * settled, so that failure is diagnosed on an unchanged workflow.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DIR = ".github/workflows";
const EXEMPT = new Set(["deploy-not-alone.yml"]);

// The first major of each action that runs on Node 24.
const MIN_MAJOR: Record<string, number> = {
  "actions/checkout": 5,
  "actions/setup-node": 5,
  "actions/cache": 5,
  "actions/upload-artifact": 6,
};

const workflows = readdirSync(DIR)
  .filter((f) => f.endsWith(".yml") && !EXEMPT.has(f))
  .map((f) => ({ name: f, text: readFileSync(`${DIR}/${f}`, "utf8") }));

test("there are workflows to check", () => {
  assert.ok(workflows.length >= 7);
});

test("every actions/* step runs on Node 24", () => {
  for (const { name, text } of workflows) {
    for (const m of text.matchAll(/uses:\s*(actions\/[\w-]+)@v(\d+)/g)) {
      const min = MIN_MAJOR[m[1]];
      assert.ok(min !== undefined, `${name}: add ${m[1]} to MIN_MAJOR`);
      assert.ok(Number(m[2]) >= min, `${name}: ${m[1]}@v${m[2]} runs on Node 20`);
    }
  }
});

test("every workflow builds on the Node version CI tests", () => {
  for (const { name, text } of workflows) {
    for (const m of text.matchAll(/node-version:\s*"?(\d+)"?/g)) {
      assert.equal(m[1], "24", `${name}: node-version ${m[1]}`);
    }
  }
});
