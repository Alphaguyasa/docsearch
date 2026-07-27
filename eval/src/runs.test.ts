import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  degradedCount,
  readLocalRuns,
  resolveLocal,
  usable,
  type LocalRun,
} from "./runs";
import type { QuestionResult } from "./types";

function result(questionId: string, overrides: Partial<QuestionResult> = {}): QuestionResult {
  return {
    questionId,
    retrieved: [],
    answer: "",
    citations: [],
    metrics: { "recall@10": 1 },
    costUsd: 0,
    latency: { embedMs: 0, searchMs: 0, rerankMs: 0, generateMs: 0, totalMs: 1 },
    error: null,
    ...overrides,
  };
}

function localRun(
  runId: string,
  variantName: string,
  startedAt: string,
  results: QuestionResult[],
): LocalRun {
  const file = `eval/runs/${runId}.jsonl`;
  return { runId, variantName, startedAt, source: file, file, results };
}

describe("usable", () => {
  it("requires at least one non-errored result", () => {
    expect(usable([])).toBe(false);
    expect(usable([result("q1", { error: "boom" })])).toBe(false);
    expect(usable([result("q1", { error: "boom" }), result("q2")])).toBe(true);
  });
});

describe("degradedCount", () => {
  it("counts only results explicitly flagged", () => {
    const run = localRun("r", "v", "", [
      result("q1", { degraded: true }),
      result("q2", { degraded: false }),
      result("q3"),
    ]);
    expect(degradedCount(run)).toBe(1);
  });
});

describe("resolveLocal", () => {
  const runs = [
    localRun("aaaaaaaa-1111", "baseline", "2026-01-01T00:00:00Z", [result("q1")]),
    localRun("bbbbbbbb-2222", "baseline", "2026-03-01T00:00:00Z", [result("q1")]),
    localRun("cccccccc-3333", "baseline", "2026-06-01T00:00:00Z", []),
    localRun("dddddddd-4444", "other", "2026-02-01T00:00:00Z", [result("q1")]),
  ];

  it("resolves an exact run id", () => {
    expect(resolveLocal("aaaaaaaa-1111", runs).runId).toBe("aaaaaaaa-1111");
  });

  it("resolves a run id prefix", () => {
    expect(resolveLocal("bbbbbbbb", runs).runId).toBe("bbbbbbbb-2222");
  });

  it("takes the most recent USABLE run for a variant name", () => {
    // cccccccc is newer but empty. Picking it would report every metric as
    // missing rather than saying the run produced nothing.
    expect(resolveLocal("baseline", runs).runId).toBe("bbbbbbbb-2222");
  });

  it("throws when a run id resolves to an empty run", () => {
    expect(() => resolveLocal("cccccccc-3333", runs)).toThrow(/no successful results/);
  });

  it("throws with the known variants listed when nothing matches", () => {
    expect(() => resolveLocal("nope", runs)).toThrow(/baseline, other/);
  });

  it("throws when every run of a variant is empty", () => {
    const empty = [localRun("eeeeeeee-5555", "ghost", "2026-01-01T00:00:00Z", [])];
    expect(() => resolveLocal("ghost", empty)).toThrow(/No usable local run/);
  });
});

describe("readLocalRuns", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "runs-test-"));

    const header = (runId: string, name: string) =>
      JSON.stringify({ type: "run", runId, variant: { name }, startedAt: "2026-01-01" });

    // A healthy run.
    writeFileSync(
      path.join(dir, "good.jsonl"),
      [
        header("run-good", "baseline"),
        JSON.stringify({ type: "result", ...result("q1") }),
        JSON.stringify({ type: "aggregate", runId: "run-good", aggregate: {} }),
      ].join("\n") + "\n",
    );

    // Crash mid-append: a partial final line. Everything before it must survive
    // — that is the entire point of writing results incrementally.
    writeFileSync(
      path.join(dir, "truncated.jsonl"),
      [
        header("run-trunc", "baseline"),
        JSON.stringify({ type: "result", ...result("q1") }),
        '{"type":"result","questionId":"q2","met',
      ].join("\n") + "\n",
    );

    // Died before the header finished writing.
    writeFileSync(path.join(dir, "headerless.jsonl"), '{"type":"run","runI\n');

    // Not a run file at all.
    writeFileSync(path.join(dir, "notes.txt"), "ignore me\n");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a healthy run and skips the aggregate line", () => {
    const run = readLocalRuns(dir).find((r) => r.runId === "run-good")!;
    expect(run.variantName).toBe("baseline");
    expect(run.results).toHaveLength(1);
    expect(run.results[0].questionId).toBe("q1");
  });

  it("keeps the results before a truncated final line", () => {
    const run = readLocalRuns(dir).find((r) => r.runId === "run-trunc")!;
    expect(run.results).toHaveLength(1);
  });

  it("skips a file whose header never finished writing", () => {
    expect(readLocalRuns(dir).some((r) => r.file.includes("headerless"))).toBe(false);
  });

  it("ignores non-jsonl files", () => {
    expect(readLocalRuns(dir)).toHaveLength(2);
  });

  it("throws a useful message when the directory does not exist", () => {
    expect(() => readLocalRuns(path.join(dir, "nope"))).toThrow(/No runs directory/);
  });
});
