"use client";

import { useEffect, useRef, useState } from "react";

import { TRADITION_KEY, type TraditionChoice } from "@/app/traditions";
import type { UiSource } from "@/app/types";
import { parseSearchStream, type CrisisPayload, type FigureSummary } from "@/lib/search-stream";
import { peopleFor } from "@/lib/scripture/people-for";
import { crisisResponse, phraseCheck } from "@/lib/scripture/safety";

import { AnswerView } from "./components/AnswerView";
import { StoryFallback } from "./components/StoryFallback";
import { StoryFeedback } from "./components/StoryFeedback";
import { CrisisCard } from "./components/CrisisCard";
import { Hero } from "./components/Hero";
import { Passages } from "./components/Passages";
import { ExampleCards } from "./components/ExampleCards";
import { ErrorState, LoadingSkeleton } from "./components/States";
import { StoryFigures } from "./components/StoryFigures";
import { ClosingCta, HowItWorks } from "./components/HomeSections";
import { ScrollWords } from "./components/ScrollWords";
import { StickyStories } from "./components/StickyStories";
import { StoryGallery } from "./components/StoryGallery";
import { StruggleInput } from "./components/StruggleInput";
import { TodayStory } from "./components/TodayStory";
import { useT } from "./i18n/client";

type Status = "idle" | "loading" | "streaming" | "done" | "error" | "crisis";

function extractCited(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) set.add(Number(m[1]));
  return [...set];
}

export default function Home() {
  const { t } = useT();
  const [question, setQuestion] = useState("");
  const [tradition, setTradition] = useState<TraditionChoice>("all");
  const [status, setStatus] = useState<Status>("idle");
  const [sources, setSources] = useState<UiSource[]>([]);
  const [figures, setFigures] = useState<FigureSummary[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [crisis, setCrisis] = useState<CrisisPayload | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyServer, setBusyServer] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const lastQuestion = useRef("");
  const results = useRef<HTMLDivElement>(null);

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

  /**
   * A failure before the server answered never passed its safety gate, so run
   * the same phrase check here first: a person at risk gets help, not stories.
   */
  function failEarly(message: string, busyNow = false) {
    const kind = phraseCheck(lastQuestion.current);
    if (kind) {
      setCrisis(crisisResponse(kind));
      setStatus("crisis");
      return;
    }
    setBusyServer(busyNow);
    setError(message);
    setStatus("error");
  }

  function reset() {
    setStatus("idle");
    setCrisis(null);
    setAnswer("");
    setSources([]);
    setFigures([]);
    setTags([]);
  }

  async function run(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    lastQuestion.current = query;
    setQuestion(query);
    setStatus("loading");
    setSources([]);
    setFigures([]);
    setTags([]);
    setCrisis(null);
    setAnswer("");
    setError(null);
    setBusyServer(false);
    setActiveCitation(null);
    // Bring the reader down to where the story will appear.
    requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    let res: Response;
    try {
      res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, ...(tradition !== "all" ? { tradition } : {}) }),
      });
    } catch {
      failEarly(t.story.errors.offline);
      return;
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      failEarly(body?.error ?? t.story.errors.failed(res.status), res.status === 429);
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
          setTags(msg.tags ?? []);
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
      setError(t.story.errors.stopped);
      setStatus("error");
    }
  }

  const showResults = status === "streaming" || status === "done";
  // People the server already chose, or — if it never got that far — the free synonym match.
  const fallbackPeople =
    status !== "error"
      ? []
      : figures.length
        ? figures
        : peopleFor(lastQuestion.current, tradition !== "all" ? tradition : undefined);

  return (
    <main>
      <Hero>
        {status === "crisis" && crisis ? (
          <CrisisCard crisis={crisis} onBack={reset} />
        ) : (
          <StruggleInput
            value={question}
            onChange={setQuestion}
            onSubmit={() => run(question)}
            disabled={busy}
            tradition={tradition}
            onTradition={chooseTradition}
          />
        )}
      </Hero>

      <div
        ref={results}
        className={`mx-auto max-w-5xl scroll-mt-4 px-4 sm:px-6 ${status === "crisis" ? "" : "pb-20 pt-10"}`}
      >
        {status === "idle" && <ExampleCards examples={t.examples.list} onPick={run} />}
        {status === "loading" && (
          <div className="mx-auto max-w-3xl">
            <LoadingSkeleton />
          </div>
        )}
        {status === "error" &&
          (fallbackPeople.length > 0 ? (
            <StoryFallback people={fallbackPeople} busy={busyServer} onRetry={() => run(lastQuestion.current)} />
          ) : (
            <div className="mx-auto max-w-3xl">
              <ErrorState message={error ?? t.story.errors.generic} onRetry={() => run(lastQuestion.current)} />
            </div>
          ))}

        {showResults && (
          <article className="mx-auto min-w-0 max-w-3xl">
            <StoryFigures figures={figures} />
            <div className="illuminated font-serif text-[19px] leading-8 sm:text-[20px] sm:leading-9">
              <AnswerView
                answer={answer}
                sources={sources}
                activeCitation={activeCitation}
                streaming={status === "streaming"}
                onCiteClick={setActiveCitation}
              />
            </div>
            {status === "done" && answer.trim() && <StoryFeedback figures={figures.map((f) => f.id)} tags={tags} />}
            {sources.length > 0 && (
              <div className="mt-12">
                <Passages
                  sources={sources}
                  cited={extractCited(answer)}
                  active={activeCitation}
                  onClear={() => setActiveCitation(null)}
                />
              </div>
            )}
          </article>
        )}
      </div>

      {status === "idle" && (
        <>
          <TodayStory />
          <ScrollWords />
          <StickyStories />
          <StoryGallery />
          <HowItWorks />
          <ClosingCta />
        </>
      )}
    </main>
  );
}
