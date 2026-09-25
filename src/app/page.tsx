"use client";

import { useEffect, useRef, useState } from "react";

import { TRADITION_KEY, type TraditionChoice } from "@/app/traditions";
import type { UiSource } from "@/app/types";
import { parseSearchStream, type CrisisPayload, type FigureSummary } from "@/lib/search-stream";

import { AnswerView } from "./components/AnswerView";
import { CitationPanel } from "./components/CitationPanel";
import { CrisisCard } from "./components/CrisisCard";
import { SourcesList } from "./components/SourcesList";
import { ErrorState, LoadingSkeleton } from "./components/States";
import { StruggleInput } from "./components/StruggleInput";

type Status = "idle" | "loading" | "streaming" | "done" | "error" | "crisis";

const EXAMPLES = [
  "I keep lying to my parents and I can't stop.",
  "I cheated on my wife. I don't know how to live with it.",
  "I have walked away from God for years.",
  "ሁልጊዜ በጣም እቆጣለሁ፣ ቤተሰቤን እጎዳለሁ።",
];

function extractCited(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) set.add(Number(m[1]));
  return [...set];
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [tradition, setTradition] = useState<TraditionChoice>("all");
  const [status, setStatus] = useState<Status>("idle");
  const [sources, setSources] = useState<UiSource[]>([]);
  const [figures, setFigures] = useState<FigureSummary[]>([]);
  const [crisis, setCrisis] = useState<CrisisPayload | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const lastQuestion = useRef("");

  // Remember the reader's church on this device only.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRADITION_KEY) as TraditionChoice | null;
      if (saved) setTradition(saved);
    } catch {}
  }, []);
  function chooseTradition(t: TraditionChoice) {
    setTradition(t);
    try {
      localStorage.setItem(TRADITION_KEY, t);
    } catch {}
  }

  const busy = status === "loading" || status === "streaming";

  function reset() {
    setStatus("idle");
    setCrisis(null);
    setAnswer("");
    setSources([]);
    setFigures([]);
  }

  async function run(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    lastQuestion.current = query;
    setQuestion(query);
    setStatus("loading");
    setSources([]);
    setFigures([]);
    setCrisis(null);
    setAnswer("");
    setError(null);
    setActiveCitation(null);
    setHoveredCitation(null);

    let res: Response;
    try {
      res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, ...(tradition !== "all" ? { tradition } : {}) }),
      });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setStatus("error");
      return;
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `The request failed (${res.status}). Try again.`);
      setStatus("error");
      return;
    }

    try {
      for await (const msg of parseSearchStream(res.body)) {
        if (msg.type === "crisis") {
          setCrisis(msg.crisis);
          setStatus("crisis");
        } else if (msg.type === "sources") {
          setSources(msg.chunks as unknown as UiSource[]);
          setFigures(msg.figures ?? []);
          setStatus("streaming");
        } else if (msg.type === "delta") {
          setAnswer((prev) => prev + msg.text);
        } else if (msg.type === "done") {
          setStatus((s) => (s === "crisis" ? "crisis" : "done"));
        } else if (msg.type === "error") {
          setError(msg.message);
          setStatus("error");
        }
      }
    } catch {
      setError("The story stopped partway. Try again.");
      setStatus("error");
    }
  }

  const showPanel = activeCitation !== null;
  const showResults = status === "streaming" || status === "done";

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:pt-16">
      {status !== "crisis" && (
        <StruggleInput
          value={question}
          onChange={setQuestion}
          onSubmit={() => run(question)}
          disabled={busy}
          tradition={tradition}
          onTradition={chooseTradition}
        />
      )}

      <div className="mt-10">
        {status === "idle" && (
          <div>
            <p className="text-sm text-muted">Or start from something others have written:</p>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => run(q)}
                    className="block w-full py-3 text-left font-serif text-[17px] leading-7 transition-colors hover:text-accent"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {status === "loading" && <LoadingSkeleton />}
        {status === "error" && (
          <ErrorState message={error ?? "Something went wrong."} onRetry={() => run(lastQuestion.current)} />
        )}
        {status === "crisis" && crisis && <CrisisCard crisis={crisis} onBack={reset} />}

        {showResults && (
          <div className={showPanel ? "grid gap-8 lg:-mr-[380px] lg:grid-cols-[1fr_340px]" : ""}>
            <article className="min-w-0">
              {figures.length > 0 && (
                <p className="mb-4 text-sm text-muted">
                  Stories of {figures.map((f) => f.name).join(", ").replace(/, ([^,]*)$/, " and $1")}
                </p>
              )}
              <div className="font-serif text-[18px] leading-8">
                <AnswerView
                  answer={answer}
                  sources={sources}
                  activeCitation={activeCitation}
                  streaming={status === "streaming"}
                  onCiteClick={setActiveCitation}
                  onCiteHover={setHoveredCitation}
                />
              </div>
              <div className="mt-10">
                <SourcesList sources={sources} />
              </div>
            </article>
            {showPanel && (
              <div className="h-fit lg:sticky lg:top-6">
                <CitationPanel
                  sources={sources}
                  cited={extractCited(answer)}
                  activeCitation={activeCitation}
                  hoveredCitation={hoveredCitation}
                  onClose={() => setActiveCitation(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
