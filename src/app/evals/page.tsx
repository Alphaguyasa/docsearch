/**
 * /evals — the run list. Phase 8 of docs/EVAL_HARNESS.md.
 *
 * Server component: reads Supabase directly and hands a plain array to a client
 * component that only does sorting. Rendered on demand, because a run finishing
 * should show up without a redeploy.
 */
import Link from "next/link";

import { listRuns } from "./data";
import { RunsTable } from "./RunsTable";
import { assertDashboardEnabled } from "./guard";

export const dynamic = "force-dynamic";

export default async function EvalsPage() {
  assertDashboardEnabled();

  let runs;
  try {
    runs = await listRuns();
  } catch (err) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Evals</h1>
        <p className="mt-4 border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {err instanceof Error ? err.message : String(err)}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">Evals</h1>
        <span className="text-xs text-muted">
          {runs.length} finished run{runs.length === 1 ? "" : "s"}
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-sm text-muted">
        Every completed run, newest first. Retrieval numbers are measured;{" "}
        <Link href="/evals#judges" className="underline underline-offset-2">
          only <code>correctness</code> has a validated judge
        </Link>{" "}
        (kappa 0.86) — see the note below before quoting the rest.
      </p>

      {runs.length === 0 ? (
        <p className="mt-8 border border-border px-4 py-6 text-sm text-muted">
          No finished runs yet. A run appears here once it completes and writes
          its aggregate — <code>npm run eval:run -- --variant baseline</code>.
          Local runs written with <code>--skip-db</code> can be pushed up with{" "}
          <code>npm run eval:sync</code>.
        </p>
      ) : (
        <RunsTable runs={runs} />
      )}

      <section id="judges" className="mt-12 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight">
          What these numbers are worth
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <strong className="text-foreground">Retrieval metrics are real.</strong>{" "}
            Deterministic given the corpus, reproducible bit-for-bit on a re-run.
          </li>
          <li>
            <strong className="text-foreground">correctness is validated</strong> —
            Cohen&rsquo;s kappa 0.86 against 55 human labels.
          </li>
          <li>
            <strong className="text-foreground">
              faithfulness, citations and refusal are not.
            </strong>{" "}
            They agree with human labels 78&ndash;100% of the time on samples that
            contain almost no negatives, which is agreement without evidence.
            faithfulness scored 1.0 on every non-refusal answer of the dev split,
            so it cannot currently detect a regression.
          </li>
        </ul>
      </section>
    </main>
  );
}
