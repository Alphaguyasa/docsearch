"use client";

import { useRef, useState } from "react";

import {
  parseSearchStream,
  type SearchStreamMessage,
  type SourceChunk,
} from "@/lib/search-stream";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [sources, setSources] = useState<SourceChunk[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const sourceRefs = useRef(new Map<number, HTMLLIElement>());

  const busy = status === "loading" || status === "streaming";

  function focusSource(n: number) {
    setActiveSource(n);
    sourceRefs.current.get(n)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;

    // Reset for a fresh run.
    setStatus("loading");
    setSources([]);
    setAnswer("");
    setError(null);
    setActiveSource(null);

    let res: Response;
    try {
      res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setStatus("error");
      return;
    }

    // Pre-stream failures (400/502) arrive as a JSON body { error }, not NDJSON.
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Request failed (${res.status}).`);
      setStatus("error");
      return;
    }

    try {
      for await (const msg of parseSearchStream(res.body)) {
        handleMessage(msg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stream error.");
      setStatus("error");
    }
  }

  function handleMessage(msg: SearchStreamMessage) {
    switch (msg.type) {
      case "sources":
        // Render citation targets immediately — this fires before any delta.
        setSources(msg.chunks);
        setStatus("streaming");
        break;
      case "delta":
        setAnswer((prev) => prev + msg.text);
        break;
      case "done":
        setStatus("done");
        break;
      case "error":
        setError(msg.message);
        setStatus("error");
        break;
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Document search</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Answers are grounded in the corpus and cited. Uncovered questions are refused.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          placeholder="Ask a question about the documents…"
          className="flex-1 rounded-lg border border-black/15 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length === 0}
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-40"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Citation targets — rendered the instant the sources line arrives, before
          the answer begins streaming. */}
      {sources.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Citation targets
          </h2>
          <ol className="space-y-1.5">
            {sources.map((s) => (
              <li
                key={s.n}
                ref={(el) => {
                  if (el) sourceRefs.current.set(s.n, el);
                }}
                className={`flex gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  activeSource === s.n
                    ? "bg-amber-400/20 ring-1 ring-amber-500/40"
                    : "bg-black/[.03] dark:bg-white/[.04]"
                }`}
              >
                <span className="font-mono text-xs text-black/50 dark:text-white/50">
                  [{s.n}]
                </span>
                <span>
                  <span className="font-medium">{s.title}</span>
                  {s.pageNumber !== null && (
                    <span className="text-black/50 dark:text-white/50">
                      {" "}· p.{s.pageNumber}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(answer || status === "streaming" || status === "done") && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Answer
          </h2>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
            <AnswerText answer={answer} sources={sources} onCite={focusSource} />
            {status === "streaming" && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Render answer text, turning [n] markers into buttons that focus source n. */
function AnswerText({
  answer,
  sources,
  onCite,
}: {
  answer: string;
  sources: SourceChunk[];
  onCite: (n: number) => void;
}) {
  const parts = answer.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;

        const n = Number(m[1]);
        const known = sources.some((s) => s.n === n);
        return (
          <sup key={i}>
            <button
              type="button"
              disabled={!known}
              onClick={() => onCite(n)}
              title={known ? `Jump to source [${n}]` : `Unknown source [${n}]`}
              className={`mx-0.5 rounded px-1 font-mono text-[11px] ${
                known
                  ? "bg-amber-400/25 text-amber-700 hover:bg-amber-400/40 dark:text-amber-300"
                  : "bg-red-500/20 text-red-600 dark:text-red-400"
              }`}
            >
              [{n}]
            </button>
          </sup>
        );
      })}
    </>
  );
}
