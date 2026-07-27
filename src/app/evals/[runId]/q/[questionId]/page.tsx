/**
 * /evals/[runId]/q/[questionId] — the drill-down.
 *
 * This page is Phase 8's acceptance criterion: from "faithfulness dropped" to
 * the exact chunk that caused it in under three clicks. Run list → run →
 * question, and everything the judge saw is on this page.
 *
 * The one thing it must never do is imply agreement it does not have. A judge
 * verdict is shown as what the model said, next to the passage it was checked
 * against, so a reader can disagree with it — which is exactly what calibration
 * found a human doing correctly six times.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { getResult, getRun, type RetrievedChunk } from "../../../data";
import { assertDashboardEnabled } from "../../../guard";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ runId: string; questionId: string }>;
}) {
  assertDashboardEnabled();
  const { runId, questionId } = await params;

  const [run, result] = await Promise.all([getRun(runId), getResult(runId, questionId)]);
  if (!run || !result) notFound();

  const relevant = new Set(result.relevantChunkIds);
  const cited = new Set(result.citations.map((c) => c.chunkId));
  const judge = result.judge;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="text-xs text-muted">
        <Link href="/evals" className="hover:text-foreground">
          Evals
        </Link>{" "}
        /{" "}
        <Link href={`/evals/${runId}`} className="hover:text-foreground">
          {run.variantName} <span className="font-mono">{runId.slice(0, 8)}</span>
        </Link>{" "}
        / <span className="font-mono">{questionId}</span>
      </nav>

      <header className="mt-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{questionId}</h1>
          <span className="text-xs text-muted">
            {result.type ?? "unknown type"}
            {result.difficulty ? ` · ${result.difficulty}` : ""}
          </span>
        </div>
        <p className="mt-3 text-base">{result.question ?? "(question not in the current golden set)"}</p>
      </header>

      {result.error && (
        <p className="mt-4 border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          This question errored: {result.error}
        </p>
      )}

      <Metrics metrics={result.metrics} />

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Reference answer</h2>
          <p className="mt-2 text-sm text-muted">
            {result.expectedAnswer ?? (
              <span className="italic">
                None — this question is unanswerable, and declining is the correct
                behaviour.
              </span>
            )}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Generated answer</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap">
            {result.answer || <span className="italic text-muted">(no answer — retrieval-only run)</span>}
          </p>
          {result.citations.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Cited {result.citations.length} passage
              {result.citations.length === 1 ? "" : "s"}:{" "}
              {result.citations.map((c) => `p.${c.page}`).join(", ")}
            </p>
          )}
        </div>
      </section>

      {judge && <Judges judge={judge} />}

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            Retrieved passages, in rank order
          </h2>
          <p className="text-xs text-muted">
            <span className="border-l-2 border-green-600 pl-1">green</span> = ground
            truth for this question · <span className="font-medium">cited</span> = the
            answer pointed at it
          </p>
        </div>

        {result.retrieved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing retrieved.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {result.retrieved.map((chunk, i) => (
              <Chunk
                key={chunk.chunkId}
                chunk={chunk}
                rank={i + 1}
                relevant={relevant.has(chunk.chunkId)}
                cited={cited.has(chunk.chunkId)}
              />
            ))}
          </ol>
        )}

        {result.relevantChunkIds.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            Ground truth is {result.relevantChunkIds.length} chunk
            {result.relevantChunkIds.length === 1 ? "" : "s"};{" "}
            {result.retrieved.filter((c) => relevant.has(c.chunkId)).length} of them
            were retrieved. The rest are the recall ceiling this question could not
            have exceeded at this top-k.
          </p>
        )}
      </section>
    </main>
  );
}

function Metrics({ metrics }: { metrics: Record<string, number | null> }) {
  const shown: [string, number | null | undefined][] = [
    ["recall@10", metrics["recall@10"]],
    ["mrr", metrics.mrr],
    ["correctness", metrics.correctness],
    ["faithfulness", metrics.faithfulness],
    ["citationAccuracy", metrics.citationAccuracy],
    ["refusalAccuracy", metrics.refusalAccuracy],
  ];
  const present = shown.filter(([, v]) => typeof v === "number");
  if (present.length === 0) return null;

  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4">
      {present.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs text-muted">{key}</dt>
          <dd className="tabular-nums">{((value as number) * 100).toFixed(1)}%</dd>
        </div>
      ))}
    </dl>
  );
}

function Judges({ judge }: { judge: NonNullable<Awaited<ReturnType<typeof getResult>>>["judge"] }) {
  if (!judge) return null;
  const faith = judge.faithfulness?.ok ? judge.faithfulness.value : undefined;
  const corr = judge.correctness?.ok ? judge.correctness.value : undefined;
  const cites = judge.citationAccuracy?.ok ? judge.citationAccuracy.value : undefined;
  const refusal = judge.refusal?.ok ? judge.refusal.value : undefined;

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-tight">What the judges said</h2>
      <p className="mt-1 text-xs text-muted">
        Model verdicts, not ground truth. Only <code>correctness</code> has been
        validated against human labels (kappa 0.86).
      </p>

      <div className="mt-4 space-y-5">
        {faith && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Faithfulness{" "}
              {faith.score === null ? "— not applicable (no claims)" : `${(faith.score * 100).toFixed(0)}%`}
            </h3>
            {faith.claims.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                The answer asserted nothing — a refusal makes no claim about the
                subject, so there is nothing for grounding to be true of.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {faith.claims.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className={
                        c.label === "supported"
                          ? "text-muted"
                          : "font-medium text-amber-600 dark:text-amber-500"
                      }
                    >
                      [{c.label}]
                    </span>
                    <span>{c.claim}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {corr && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Correctness — {corr.verdict}
            </h3>
            <p className="mt-1 text-sm text-muted">{corr.reasoning}</p>
          </div>
        )}

        {cites && cites.citations.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Citations {(cites.score * 100).toFixed(0)}%
            </h3>
            <ul className="mt-1 space-y-1 text-sm">
              {cites.citations.map((c, i) => (
                <li key={i} className={c.valid ? "text-muted" : "text-amber-600 dark:text-amber-500"}>
                  {c.valid ? "valid" : "INVALID"} — {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {refusal && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Refusal
            </h3>
            <p className="mt-1 text-sm text-muted">
              {refusal.refused
                ? "The answer declined, which is correct for an unanswerable question."
                : "The answer asserted something, where it should have declined."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Chunk({
  chunk,
  rank,
  relevant,
  cited,
}: {
  chunk: RetrievedChunk;
  rank: number;
  relevant: boolean;
  cited: boolean;
}) {
  return (
    <li
      className={`border-l-2 pl-4 ${
        relevant ? "border-green-600" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-3 text-xs text-muted">
        <span className="font-medium text-foreground">#{rank}</span>
        <span>p.{chunk.page}</span>
        <span className="font-mono">{chunk.chunkId.slice(0, 8)}</span>
        <span className="tabular-nums">score {chunk.score.toFixed(4)}</span>
        {relevant && (
          <span className="text-green-700 dark:text-green-500">ground truth</span>
        )}
        {cited && <span className="font-medium text-foreground">cited</span>}
      </div>
      <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted">{chunk.text}</p>
    </li>
  );
}
