import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { STATS_COOKIE, STATS_KEY_MAX, statsCookieOk } from "@/lib/stats-auth";
import { FIGURES } from "@/lib/scripture/figures";
import { addisDay } from "@/lib/scripture/today";

import { tagLabel } from "../people";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Numbers — Not Alone", robots: { index: false, follow: false } };

const DAYS = 30;

/**
 * GET /stats — the owner's numbers: how many stories were read, which
 * struggles and people they found, crisis answers, "this helped" taps, and the
 * bot's morning subscribers. Only counts (lib/counts.ts); nothing anyone wrote.
 *
 * If STATS_KEY is unset it is a plain 404. Otherwise a browser without the
 * stats cookie gets a one-field form that posts the key to /stats/session
 * (lib/stats-auth.ts). An old `/stats?key=…` link still works: the proxy sets
 * the cookie and redirects to /stats without the key.
 */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ wrong?: string }> }) {
  if (!process.env.STATS_KEY) notFound();
  if (!(await statsCookieOk((await cookies()).get(STATS_COOKIE)?.value))) {
    return <KeyForm wrong={(await searchParams).wrong === "1"} />;
  }

  // One reading of the clock, so the day counts and the feedback window agree.
  const now = new Date();
  const today = addisDay(now);
  const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
  const [counts, feedback, subs, posts] = await Promise.all([
    db.from("daily_counts").select("day,name,n").gt("day", today - DAYS),
    db.from("feedback").select("helpful,channel").gt("at", since),
    db.from("bot_subscribers").select("chat_id", { count: "exact", head: true }),
    db.from("channel_posts").select("day", { count: "exact", head: true }),
  ]);

  const total = new Map<string, number>();
  const todayN = new Map<string, number>();
  for (const r of counts.data ?? []) {
    total.set(r.name, (total.get(r.name) ?? 0) + r.n);
    if (r.day === today) todayN.set(r.name, r.n);
  }
  const n = (name: string) => total.get(name) ?? 0;
  const top = (prefix: string, label: (id: string) => string) =>
    [...total]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => ({ label: label(k.slice(prefix.length)), n: v }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
  const helped = (feedback.data ?? []).filter((f) => f.helpful).length;
  const notHelped = (feedback.data ?? []).length - helped;
  const crisis = [...total].filter(([k]) => k.startsWith("crisis:"));

  const tiles: [string, number | string][] = [
    ["Stories read (30 days)", n("story")],
    ["Stories today", todayN.get("story") ?? 0],
    ["From Telegram", n("via:telegram")],
    ["Written in Amharic", n("lang:am")],
    ["Crisis help shown", n("crisis")],
    ["Too busy (asked to wait)", n("busy")],
    ["“This helped”", `${helped} yes · ${notHelped} no`],
    ["Morning subscribers (/daily)", subs.count ?? 0],
    ["Channel posts so far", posts.count ?? 0],
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">Numbers</h1>
      <p className="mt-2 text-sm text-muted">
        The last {DAYS} days, Addis Ababa time. Counts only — nothing anyone wrote is kept.
      </p>
      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-[18px] border border-border bg-card px-5 py-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-12 grid gap-10 sm:grid-cols-2">
        <Bars title="Struggles people brought" rows={top("tag:", tagLabel)} />
        <Bars
          title="People whose stories were told"
          rows={top("person:", (id) => FIGURES.find((f) => f.id === id)?.name ?? id)}
        />
      </div>
      {crisis.length > 0 && (
        <Bars
          title="Crisis answers, by kind"
          rows={crisis.map(([k, v]) => ({ label: k.slice("crisis:".length), n: v }))}
        />
      )}
      <form method="post" action="/stats/session" className="mt-16">
        <input type="hidden" name="forget" value="1" />
        <button type="submit" className="text-sm text-muted underline underline-offset-4 hover:text-foreground">
          Sign this browser out
        </button>
      </form>
    </main>
  );
}

function KeyForm({ wrong }: { wrong: boolean }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">Numbers</h1>
      <form method="post" action="/stats/session" className="mt-8 space-y-4">
        <label htmlFor="stats-key" className="block text-sm text-muted">
          Key
        </label>
        <input
          id="stats-key"
          name="key"
          type="password"
          required
          maxLength={STATS_KEY_MAX}
          autoComplete="current-password"
          aria-invalid={wrong || undefined}
          aria-describedby={wrong ? "stats-key-wrong" : undefined}
          className="w-full rounded-[12px] border border-border bg-card px-4 py-3"
        />
        {wrong && (
          <p id="stats-key-wrong" role="alert" className="text-sm">
            That key did not work.
          </p>
        )}
        <button type="submit" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg">
          Open
        </button>
      </form>
    </main>
  );
}

function Bars({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="mt-2">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="h-2.5 rounded-full bg-gold/70" style={{ width: `${(r.n / max) * 100}%` }} />
              <span className="text-right tabular-nums text-muted">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
