"use client";

/**
 * Searchable, filterable per-question table — the entry point to the
 * drill-down, and the reason "faithfulness dropped" is three clicks from the
 * chunk that caused it: run list → run → question.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import type { ResultRow } from "../data";

type Filter = "all" | "failures" | "refusals";

/**
 * A question "failed" if retrieval missed everything, the answer was judged
 * incorrect, or the run errored on it.
 *
 * NOT a single threshold on one metric: a run can be retrieval-only, in which
 * case correctness does not exist and hit rate is the only signal there is.
 */
function failed(r: ResultRow): boolean {
  if (r.error) return true;
  const correctness = r.metrics?.correctness;
  if (typeof correctness === "number") return correctness < 1;
  const hit = r.metrics?.["hitRate@10"];
  return typeof hit === "number" ? hit === 0 : false;
}

const REFUSAL = /not covered by these documents|do(?:es)? not (?:contain|say|mention)/i;

function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${(v * 100).toFixed(0)}%` : "—";
}

export function ResultsTable({ runId, rows }: { runId: string; rows: ResultRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "failures" && !failed(r)) return false;
      if (filter === "refusals" && !REFUSAL.test(r.answer ?? "")) return false;
      if (!q) return true;
      return (
        r.questionId.toLowerCase().includes(q) ||
        (r.question ?? "").toLowerCase().includes(q) ||
        (r.answer ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const failures = rows.filter(failed).length;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search question id, text, or answer…"
          className="w-72 border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground"
        />
        <div className="flex gap-1 text-xs">
          {(
            [
              ["all", `All ${rows.length}`],
              ["failures", `Failures ${failures}`],
              ["refusals", "Refusals"],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`border px-2 py-1 transition-colors ${
                filter === value
                  ? "border-foreground text-foreground"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{shown.length} shown</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-2 text-left font-medium">id</th>
              <th className="px-2 py-2 text-left font-medium">type</th>
              <th className="px-2 py-2 text-left font-medium">question</th>
              <th className="px-2 py-2 text-right font-medium">recall@10</th>
              <th className="px-2 py-2 text-right font-medium">correct</th>
              <th className="px-2 py-2 text-right font-medium">faith.</th>
              <th className="px-2 py-2 text-center font-medium">status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.questionId} className="border-b border-border/60 hover:bg-foreground/[0.03]">
                <td className="px-2 py-2 whitespace-nowrap font-mono text-xs">
                  <Link
                    href={`/evals/${runId}/q/${r.questionId}`}
                    className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    {r.questionId}
                  </Link>
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-xs text-muted">{r.type ?? "—"}</td>
                <td className="max-w-md truncate px-2 py-2 text-muted">
                  {r.question ?? <span className="italic">not in the current golden set</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.metrics?.["recall@10"])}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.metrics?.correctness)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {pct(r.metrics?.faithfulness)}
                </td>
                <td className="px-2 py-2 text-center">
                  {r.error ? (
                    <span title={r.error} className="text-red-600 dark:text-red-400">
                      error
                    </span>
                  ) : failed(r) ? (
                    <span className="text-amber-600 dark:text-amber-500">✗</span>
                  ) : (
                    <span className="text-muted">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="mt-4 text-sm text-muted">Nothing matches that filter.</p>
        )}
      </div>
    </>
  );
}
