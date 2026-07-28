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
      include: ["eval/src/metrics/**/*.ts", "eval/src/compare.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],

      /**
       * PER-FILE thresholds, deliberately unequal. There is no blanket number
       * here, because the files under metrics/ are not the same kind of code
       * and one threshold across them can only be wrong in one direction:
       * high enough for the pure modules means judge.ts fails forever, low
       * enough for judge.ts means a pure module can rot silently.
       *
       * 95% — retrieval.ts, stats.ts and compare.ts. Pure functions, no I/O,
       * and every number the harness reports is computed or selected by one of
       * them. A silent bug in recallAtK, pairedBootstrap, or the question-id
       * join does not announce itself: it produces a plausible-looking figure
       * that is wrong, and every conclusion drawn downstream inherits the
       * error. All three currently sit at 100%, so this threshold costs
       * nothing to hold and catches a regression the day it lands.
       *
       * 30% — judge.ts, currently 34.18%. The uncovered region is one thing:
       * judgeCall and the four judge* functions (roughly lines 206-550), which
       * build a prompt, call a provider, and retry. Reaching 95% there means
       * mocking the provider, and a test that asserts a mocked provider
       * returned what the mock was told to return tests the mock. The half
       * that decides anything — extractCitations, the three score functions,
       * judgeScoresToMetrics, cohensKappa — is pure and IS covered. What
       * validates the rest is scripts/calibrate-judge.ts measuring kappa
       * against human labels, which is Phase 3's acceptance and a real test of
       * the judge in a way line coverage cannot be. The threshold sits just
       * below the current figure so it works as a ratchet against deletion,
       * not as an aspiration.
       */
      thresholds: {
        "eval/src/metrics/retrieval.ts": { lines: 95 },
        "eval/src/metrics/stats.ts": { lines: 95 },
        "eval/src/compare.ts": { lines: 95 },
        "eval/src/metrics/judge.ts": { lines: 30 },
      },
    },
  },
});
