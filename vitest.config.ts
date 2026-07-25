import { defineConfig } from "vitest/config";

/**
 * Vitest covers the eval harness only.
 *
 * tests/ predates this and runs on Node's built-in test runner (`npm test`) —
 * those files import from `node:test`, so letting Vitest collect them would
 * fail on import. Two runners is not ideal, but converting the existing suite
 * is unrelated churn; the boundary is drawn here explicitly instead.
 */
export default defineConfig({
  test: {
    include: ["eval/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["eval/src/metrics/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],
      // Phase 2 acceptance: >=95% line coverage on the metrics file.
      thresholds: { lines: 95 },
    },
  },
});
