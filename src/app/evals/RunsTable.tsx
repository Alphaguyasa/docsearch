"use client";

/**
 * Sortable run list. Client only because sorting is interaction; the data
 * arrives fully formed from the server component.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import type { RunDetail } from "./data";

type SortKey = "startedAt" | "variantName" | "recall@10" | "correctness" | "costUsd";

const GITHUB = "https://github.com/Alphaguyasa/docsearch/commit/";

function num(v: number | null | undefined): number {
  return typeof v === "number" ? v : Number.NEGATIVE_INFINITY;
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—";
}

function usd(v: number | null | undefined): string {
  if (typeof v !== "number") return "—";
  return v === 0 ? "$0.00" : `$${v.toFixed(4)}`;
}

export function RunsTable({ runs }: { runs: RunDetail[] }) {
  const [key, setKey] = useState<SortKey>("startedAt");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...runs];
    copy.sort((a, b) => {
      let d: number;
      if (key === "startedAt") d = a.startedAt.localeCompare(b.startedAt);
      else if (key === "variantName") d = a.variantName.localeCompare(b.variantName);
      else if (key === "costUsd") d = num(a.aggregate.costUsd) - num(b.aggregate.costUsd);
      else d = num(a.aggregate[key]) - num(b.aggregate[key]);
      return asc ? d : -d;
    });
    return copy;
  }, [runs, key, asc]);

  function header(label: string, k: SortKey, align = "text-left") {
    const active = key === k;
    return (
      <th className={`${align} px-3 py-2 font-medium`}>
        <button
          type="button"
          onClick={() => {
            if (active) setAsc(!asc);
            else {
              setKey(k);
              setAsc(false);
            }
          }}
          className={`transition-colors hover:text-foreground ${
            active ? "text-foreground" : "text-muted"
          }`}
        >
          {label}
          {active ? (asc ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide">
            {header("Started", "startedAt")}
            {header("Variant", "variantName")}
            <th className="px-3 py-2 text-left font-medium text-muted">Commit</th>
            <th className="px-3 py-2 text-right font-medium text-muted">n</th>
            {header("recall@10", "recall@10", "text-right")}
            {header("correctness", "correctness", "text-right")}
            <th className="px-3 py-2 text-right font-medium text-muted">faith.</th>
            {header("Cost", "costUsd", "text-right")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.runId} className="border-b border-border/60 hover:bg-foreground/[0.03]">
              <td className="px-3 py-2 whitespace-nowrap">
                <Link
                  href={`/evals/${r.runId}`}
                  className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  {new Date(r.startedAt).toISOString().slice(0, 16).replace("T", " ")}
                </Link>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{r.variantName}</td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-muted">
                {r.gitSha && r.gitSha !== "unknown" ? (
                  <a
                    href={`${GITHUB}${r.gitSha}`}
                    className="hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.gitSha.slice(0, 7)}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">
                {r.aggregate.questions ?? "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(r.aggregate["recall@10"])}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(r.aggregate.correctness)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">
                {pct(r.aggregate.faithfulness)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">
                {usd(r.aggregate.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
