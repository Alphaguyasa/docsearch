/**
 * The lint setup (ROADMAP 32): ESLint 10 with react-hooks 7. The new React
 * Compiler rules are on except the three that ROADMAP 51 will turn on, and the
 * classic hooks rules still catch real mistakes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ESLint } from "eslint";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const major = (range: string) => Number(range.replace(/^[^\d]*/, "").split(".")[0]);

test("eslint and @eslint/js are on the same major, with react-hooks 7", () => {
  const dev = pkg.devDependencies;
  assert.equal(major(dev.eslint), 10);
  assert.equal(major(dev["@eslint/js"]), major(dev.eslint));
  assert.equal(major(dev["eslint-plugin-react-hooks"]), 7);
});

test("hook mistakes are still errors, and only three compiler rules are off", async () => {
  const eslint = new ESLint();
  const code = [
    'import { useEffect, useState } from "react";',
    "export function A({ on }: { on: boolean }) {",
    "  if (on) useState(0);",
    "  const [n] = useState(1);",
    "  useEffect(() => console.log(n), []);",
    "  return null;",
    "}",
  ].join("\n");
  const [result] = await eslint.lintText(code, { filePath: "src/app/lint-probe.tsx" });
  const rules = result.messages.map((m) => m.ruleId);
  assert.ok(rules.includes("react-hooks/rules-of-hooks"), JSON.stringify(rules));
  assert.ok(rules.includes("react-hooks/exhaustive-deps"), JSON.stringify(rules));

  const config = await eslint.calculateConfigForFile("src/app/page.tsx");
  const off = Object.entries(config.rules ?? {})
    .filter(([name, setting]) => name.startsWith("react-hooks/") && [0, "off"].includes(Array.isArray(setting) ? setting[0] : setting))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(off, ["react-hooks/set-state-in-effect"]);
  assert.ok(config.rules?.["react-hooks/immutability"], "the other compiler rules are on");
});
