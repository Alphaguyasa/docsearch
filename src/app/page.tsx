"use client";

import { useEffect, useRef, useState } from "react";

import { parseSearchStream } from "@/lib/search-stream";
import type { UiSource } from "@/app/types";

import { AnswerView } from "./components/AnswerView";
import { CitationPanel } from "./components/CitationPanel";
import { CitationTargets } from "./components/CitationTargets";
import { SearchInput } from "./components/SearchInput";
import { SourcesList } from "./components/SourcesList";
import {
  EmptyState,
  ErrorState,
  IdleExamples,
  LoadingSkeleton,
} from "./components/States";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

const EXAMPLES = [
  "How many days of paid annual leave do full-time employees get?",
  "How do I verify a webhook signature correctly?",
  "What does error E07 mean on the Helix 3000?",
];

/** Unique citation numbers referenced in the answer text. */
function extractCited(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) set.add(Number(m[1]));
  return [...set];
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [sources, setSources] = useState<UiSource[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const [docsExist, setDocsExist] = useState<boolean | null>(null);
  const lastQuestion = useRef("");

  // Detect the empty (nothing-ingested) state. A failed check doesn't block search.
  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocsExist(Array.isArray(d.documents) && d.documents.length > 0))
      .catch(() => setDocsExist(true));
  }, []);

  const busy = status === "loading" || status === "streaming";

  async function run(q: string) {
    const query = q.trim();
    if (!query || busy) return;

    lastQuestion.current = query;
    setQuestion(query);
    setStatus("loading");
    setSources([]);
    setAnswer("");
    setError(null);
    setActiveCitation(null);
    setHoveredCitation(null);

    let res: Response;
    try {
      res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setStatus("error");
      return;
    }

    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Request failed (${res.status}).`);
      setStatus("error");
      return;
    }

    try {
      for await (const msg of parseSearchStream(res.body)) {
        if (msg.type === "sources") {
          setSources(msg.chunks as unknown as UiSource[]);
          setStatus("streaming");
        } else if (msg.type === "delta") {
          setAnswer((prev) => prev + msg.text);
        } else if (msg.type === "done") {
          setStatus("done");
        } else if (msg.type === "error") {
          setError(msg.message);
          setStatus("error");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stream error.");
      setStatus("error");
    }
  }

  if (docsExist === false) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <EmptyState />
      </main>
    );
  }

  const showPanel = activeCitation !== null;
  const cited = extractCited(answer);
  const showResults = status === "streaming" || status === "done";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <SearchInput
          value={question}
          onChange={setQuestion}
          onSubmit={() => run(question)}
          disabled={busy}
        />
      </div>

      <div
        className={`mt-8 ${showPanel ? "grid gap-6 lg:grid-cols-[1fr_360px]" : ""}`}
      >
        <div className="min-w-0">
          {status === "idle" && <IdleExamples examples={EXAMPLES} onPick={run} />}
          {status === "loading" && <LoadingSkeleton />}
          {status === "error" && (
            <ErrorState
              message={error ?? "Something went wrong."}
              onRetry={() => run(lastQuestion.current)}
            />
          )}
          {showResults && (
            <div className="space-y-6">
              <CitationTargets
                sources={sources}
                activeCitation={activeCitation}
                onSelect={setActiveCitation}
                onHover={setHoveredCitation}
              />
              <AnswerView
                answer={answer}
                sources={sources}
                activeCitation={activeCitation}
                streaming={status === "streaming"}
                onCiteClick={setActiveCitation}
                onCiteHover={setHoveredCitation}
              />
              <SourcesList sources={sources} />
            </div>
          )}
        </div>

        {showPanel && (
          <div className="h-fit lg:sticky lg:top-6">
            <CitationPanel
              sources={sources}
              cited={cited}
              activeCitation={activeCitation}
              hoveredCitation={hoveredCitation}
              onClose={() => setActiveCitation(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
