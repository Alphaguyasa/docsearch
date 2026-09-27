"use client";

import { useEffect, useRef, useState } from "react";

import { parseSearchStream } from "@/lib/search-stream";
import type { UiSource } from "@/app/types";

import { AnswerView } from "./components/AnswerView";
import { AskControls, type Mode, type TraditionFilter } from "./components/AskControls";
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

/**
 * Examples per mode, because the modes want genuinely different questions and a
 * single list would teach the wrong shape for two of them. The counsel examples
 * are written in the first person on purpose: that mode only works when someone
 * describes their own situation rather than naming a topic.
 */
const EXAMPLES: Record<Mode, string[]> = {
  answer: [
    "What do the Fathers teach about the resurrection of the body?",
    "Why does the Ethiopian Church read the Book of Enoch as scripture?",
    "What is the difference between the essence and the energies of God?",
  ],
  compare: [
    "Is there anyone besides Christ who rose from the dead?",
    "What does each tradition say about fasting?",
    "How do the Eastern and Oriental Churches understand the Council of Chalcedon?",
  ],
  counsel: [
    "I have been praying for years and feel nothing. Have I been abandoned?",
    "Someone I love died suddenly and I cannot stop being angry at God.",
    "I keep falling into the same sin and I am losing hope that I can change.",
  ],
};

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
  const [mode, setMode] = useState<Mode>("answer");
  const [tradition, setTradition] = useState<TraditionFilter>("all");
  const lastQuestion = useRef("");

  // Detect the empty state. Specifically: are there any LIBRARY books, not any
  // documents at all — the database can hold uploads and leftovers that the
  // answer path deliberately never retrieves, and counting those would show a
  // working search page over a library with nothing in it.
  // A failed check does not block searching.
  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) =>
        setDocsExist(
          Array.isArray(d.documents) &&
            d.documents.some((doc: { tradition: string | null }) => doc.tradition !== null),
        ),
      )
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
        body: JSON.stringify({
          question: query,
          mode,
          // "all" is the absence of a filter, not a third value the API knows.
          ...(tradition === "all" ? {} : { tradition }),
        }),
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
        <div className="mt-4">
          <AskControls
            mode={mode}
            tradition={tradition}
            onModeChange={setMode}
            onTraditionChange={setTradition}
            disabled={busy}
          />
        </div>
      </div>

      <div
        className={`mt-8 ${showPanel ? "grid gap-6 lg:grid-cols-[1fr_360px]" : ""}`}
      >
        <div className="min-w-0">
          {status === "idle" && <IdleExamples examples={EXAMPLES[mode]} onPick={run} />}
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
