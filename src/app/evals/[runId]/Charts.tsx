"use client";

/**
 * Recharts wrappers for the run detail page.
 *
 * Client components because Recharts measures the DOM. They receive numbers
 * already computed on the server — no statistics happen here, so a chart can
 * never disagree with the CLI about what a run scored.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Bars {
  metric: string;
  mean: number;
  lo: number;
  hi: number;
  n: number;
}

const AXIS = { fontSize: 11, fill: "var(--muted)" };

export function MetricBars({ data }: { data: Bars[] }) {
  if (data.length === 0) {
    return <p className="mt-3 text-sm text-muted">No retrieval metrics in this run.</p>;
  }

  // ErrorBar wants offsets from the bar value, not absolute bounds.
  const shaped = data.map((d) => ({
    ...d,
    pct: d.mean * 100,
    err: [(d.mean - d.lo) * 100, (d.hi - d.mean) * 100] as [number, number],
  }));

  return (
    <div className="mt-4 h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shaped} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="metric" tick={AXIS} stroke="var(--border)" />
          <YAxis
            tick={AXIS}
            stroke="var(--border)"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
            contentStyle={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              fontSize: 12,
            }}
            formatter={(value, _name, item) => {
              const d = item?.payload as (typeof shaped)[number] | undefined;
              if (!d || typeof value !== "number") return ["—", ""];
              return [
                `${value.toFixed(1)}%  95% CI [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}]  n=${d.n}`,
                d.metric,
              ];
            }}
          />
          <Bar dataKey="pct" fill="var(--foreground)" fillOpacity={0.75} isAnimationActive={false}>
            <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="var(--muted)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LatencyWaterfall({ data }: { data: { stage: string; p50: number }[] }) {
  if (data.length === 0) {
    return <p className="mt-3 text-sm text-muted">No latency recorded.</p>;
  }

  return (
    <div className="mt-4 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            stroke="var(--border)"
            tickFormatter={(v: number) => `${v}ms`}
          />
          <YAxis type="category" dataKey="stage" tick={AXIS} stroke="var(--border)" width={64} />
          <Tooltip
            cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
            contentStyle={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              fontSize: 12,
            }}
            formatter={(v) => [typeof v === "number" ? `${v} ms (p50)` : "—", ""]}
          />
          <Bar
            dataKey="p50"
            fill="var(--foreground)"
            fillOpacity={0.6}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
