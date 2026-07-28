/**
 * Variant-configurable retrieve → answer, for one question.
 *
 * REUSES THE APP'S CODE PATHS rather than reimplementing them, per Phase 4 of
 * docs/EVAL_HARNESS.md:
 *   retrieval  — src/lib/retrieve.ts (hybrid + RRF, the live implementation)
 *   embedding  — src/lib/embed.ts
 *   prompt     — src/lib/answer.ts buildMessages, byte-identical to production
 *   generation — src/lib/llm.ts, same provider selection and model constants
 *
 * Three settings that were module constants in retrieve.ts (`searchTop`,
 * `rrfK`) and llm.ts (usage reporting) were made configurable there rather than
 * copied here, so the harness and production cannot drift: an experiment that
 * changes retrieval depth changes the same code the app runs.
 *
 * Stages the app does not have — reranking and query rewriting — live in this
 * directory, because production does not do them and adding dead paths to
 * src/lib would be worse than keeping them in the harness.
 */
import { answerOnce } from "../../src/lib/answer";
import { embedQueryDetailed } from "../../src/lib/embed";
import { activeGenerationModel, type LlmCompletion } from "../../src/lib/llm";
import { retrieve, type RetrieveMode } from "../../src/lib/retrieve";

import { cachedDetailed } from "./cache";
import { extractCitations } from "./metrics/judge";
import { costOf, emptyCost, type CostBreakdown } from "./pricing";
import { withLlmPacing } from "./provider";
import { rerank } from "./rerank";
import { rewriteQuery } from "./rewrite";
import type { Citation, Latency, RetrievedChunk, Variant } from "./types";

export interface PipelineResult {
  retrieved: RetrievedChunk[];
  answer: string;
  citations: Citation[];
  latency: Latency;
  cost: CostBreakdown;
  /** Populated when a rewrite ran, for the run record. */
  rewrittenQuery: string | null;
  /** True when hybrid retrieval lost one of its two sources. */
  degraded: boolean;
  /** `[n]` markers pointing outside the supplied context — invented sources. */
  danglingCitations: number;
}

/**
 * The spec says `dense`; the app calls the same thing `vector`. `keyword` and
 * `hybrid` are named identically on both sides.
 *
 * Exhaustive rather than a two-branch ternary: the old form mapped everything
 * that was not `dense` to `hybrid`, so adding `keyword` to RetrievalMode would
 * have silently run a keyword arm as hybrid and produced a duplicate of the
 * baseline under a different name. A switch makes the compiler catch the next
 * mode added.
 */
function toRetrieveMode(mode: Variant["retrieval"]["mode"]): RetrieveMode {
  switch (mode) {
    case "dense":
      return "vector";
    case "keyword":
      return "keyword";
    case "hybrid":
      return "hybrid";
  }
}

export interface PipelineOptions {
  /**
   * Stop after retrieval: no generation, no citations, no judging.
   *
   * Most Phase 6 experiments — top-k sweep, chunk size, dense vs hybrid,
   * reranking, embedding model — change nothing downstream of retrieval. Running
   * generation for them spends LLM quota producing answers whose scores cannot
   * move, and on a capped free tier that is the difference between a sweep
   * taking an afternoon and taking weeks.
   *
   * It is also the only mode whose numbers are unaffected by the baseline's
   * deviation from production's generation model (see eval/config/README.md).
   */
  retrievalOnly?: boolean;
}

export async function runPipeline(
  question: string,
  variant: Variant,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const t0 = performance.now();
  const cost = emptyCost();

  let embedMs = 0;
  let searchMs = 0;
  let rerankMs = 0;

  // --- Query rewriting -----------------------------------------------------
  // Timed under embed: it is pre-retrieval work, and the spec's Latency shape
  // has no field of its own for it. Recorded in `rewrittenQuery` either way.
  const rewriteStart = performance.now();
  const rewrite = await rewriteQuery(question, variant.queryRewrite);
  embedMs += performance.now() - rewriteStart;
  cost.generate += costOf("generate", rewrite.model, rewrite.usage);

  // --- Retrieval -----------------------------------------------------------
  // Fetch wider than topK when reranking, so the reranker has candidates to
  // reorder. Without this, "rerank top 50 → 10" would rerank exactly the 10
  // already chosen and could only ever permute them.
  const rerankConfig = variant.retrieval.rerank ?? null;
  const retrieveLimit = rerankConfig
    ? Math.max(variant.retrieval.topK, rerankConfig.topN)
    : variant.retrieval.topK;

  const mode = toRetrieveMode(variant.retrieval.mode);
  const searchStart = performance.now();

  // Question embeddings are cached on the same key shape validate-golden-set.ts
  // uses, so an embedding paid for by either tool is free in the other. Voyage's
  // free tier is 3 requests/minute — the slowest limit in the project — so an
  // uncached re-run spends most of its wall clock waiting to re-embed text it
  // has already embedded.
  // Queries whose embedding came from disk — those cost nothing this run.
  const embedCacheHits = new Set<string>();
  const embedder = async (text: string) => {
    const { value, hit } = await cachedDetailed(
      "question-embedding-detailed",
      { model: variant.embeddingModel, inputType: "query", text },
      () => embedQueryDetailed(text),
    );
    if (hit) embedCacheHits.add(text);
    return value;
  };

  const perQuery = await Promise.all(
    rewrite.queries.map((q) =>
      retrieve(q, {
        limit: retrieveLimit,
        mode,
        searchTop: variant.retrieval.searchTop,
        rrfK: variant.retrieval.rrfK,
        embedder,
      }),
    ),
  );
  const retrieveSpan = performance.now() - searchStart;

  // Embedding happens INSIDE retrieve(), so its time is subtracted out of the
  // search span rather than being attributed to search. On a rate-limited tier
  // the embed wait dominates, and a breakdown that folded it into `searchMs`
  // would point at the wrong stage. Queries run concurrently, so the largest
  // embed wait — not their sum — is what the span actually contains.
  const slowestEmbed = Math.max(0, ...perQuery.map((r) => r.embedMs ?? 0));
  embedMs += slowestEmbed;
  searchMs += Math.max(0, retrieveSpan - slowestEmbed);

  const degraded = perQuery.some((r) => r.degraded);

  // Union across rewritten queries, keeping each chunk's best fused score. A
  // chunk found by two sub-questions is evidence for both, so it must not be
  // demoted by whichever query ranked it worse.
  const bestByChunk = new Map<
    string,
    { chunk: (typeof perQuery)[number]["results"][number]; score: number }
  >();
  for (const result of perQuery) {
    for (const chunk of result.results) {
      const existing = bestByChunk.get(chunk.id);
      if (!existing || chunk.fusedScore > existing.score) {
        bestByChunk.set(chunk.id, { chunk, score: chunk.fusedScore });
      }
    }
  }

  let ordered = [...bestByChunk.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({ chunk: entry.chunk, score: entry.score }));

  // Embedding cost comes back FROM retrieve(), which already embedded. Costing
  // it by embedding again would double the calls against a 3-request/minute
  // free tier and inflate the very stage being measured. Null in keyword mode
  // or when the vector branch degraded — nothing was embedded, nothing billed.
  for (const [i, result] of perQuery.entries()) {
    if (result.embedTokens === null) continue;
    // A cached embedding was paid for on an earlier run.
    if (embedCacheHits.has(rewrite.queries[i])) continue;
    cost.embed += costOf("embed", variant.embeddingModel, {
      inputTokens: result.embedTokens,
      outputTokens: 0,
    });
  }

  // --- Reranking -----------------------------------------------------------
  if (rerankConfig && ordered.length > 0) {
    const rerankStart = performance.now();
    const candidates = ordered.slice(0, rerankConfig.topN);

    const result = await rerank(
      // Rerank against the ORIGINAL question, not a rewrite: the cross-encoder
      // scores relevance to what was actually asked, and handing it a
      // hypothetical answer would score documents against a fiction.
      question,
      candidates.map((c) => ({ chunkId: c.chunk.id, text: c.chunk.content })),
      { model: rerankConfig.model, topN: rerankConfig.topN },
    );

    const byId = new Map(candidates.map((c) => [c.chunk.id, c.chunk]));
    ordered = result.ranked
      .map((r) => ({ chunk: byId.get(r.chunkId)!, score: r.score }))
      .filter((entry) => entry.chunk !== undefined);

    cost.rerank += costOf("rerank", rerankConfig.model, {
      inputTokens: result.usage.totalTokens,
      outputTokens: 0,
    });
    rerankMs = performance.now() - rerankStart;
  }

  const top = ordered.slice(0, variant.retrieval.topK);

  const retrieved: RetrievedChunk[] = top.map((entry, i) => ({
    chunkId: entry.chunk.id,
    // The document's id, NOT its filename: the golden set's relevantDocIds are
    // UUIDs, so matching on filename scores every document-level metric zero.
    docId: entry.chunk.documentId,
    page: entry.chunk.pageNumber,
    text: entry.chunk.content,
    score: entry.score,
    rank: i + 1,
  }));

  // --- Retrieval-only exit -------------------------------------------------
  // Everything scored from here on is downstream of generation. Nothing above
  // this line touched an LLM except an optional query rewrite, so returning
  // here yields the full retrieval metric set at zero generation cost.
  if (options.retrievalOnly) {
    cost.total = cost.embed + cost.rerank + cost.generate + cost.judge;
    return {
      retrieved,
      answer: "",
      citations: [],
      latency: {
        embedMs: Math.round(embedMs),
        searchMs: Math.round(searchMs),
        rerankMs: Math.round(rerankMs),
        generateMs: 0,
        totalMs: Math.round(performance.now() - t0),
      },
      cost,
      rewrittenQuery: rewrite.rewritten,
      degraded,
      danglingCitations: 0,
    };
  }

  // --- Generation ----------------------------------------------------------
  // CACHED, and this is load-bearing beyond cost. The judges key their cache on
  // the answer text, so a non-deterministic generator gives every judge a fresh
  // key on every run: the first version of this measured 4 cache hits against
  // 17 misses on an identical re-run, and faithfulness moved 83.3% → 66.7%
  // between two runs of the same variant. Caching generation makes a re-run
  // both reproducible and nearly free, which is what Phase 4 asks for.
  //
  // The key is everything that determines the prompt: the question, the exact
  // passages in the exact order they are numbered into it, the model, and the
  // prompt version — so changing any of them is correctly a different entry.
  // The variant names the model; the app's configured default is only a
  // fallback. Without honouring this, every arm of a model-comparison
  // experiment would silently run the same model.
  const generationModel = variant.generation.model || activeGenerationModel();
  const generateStart = performance.now();
  const { value: completion, hit: generationHit } = await cachedDetailed<LlmCompletion>(
    "answer",
    {
      model: generationModel,
      promptVersion: variant.generation.promptVersion,
      maxTokens: variant.generation.maxTokens,
      question,
      chunkIds: top.map((entry) => entry.chunk.id),
    },
    () =>
      // Paced and retried under the shared limiter. The app's generation path
      // has no rate limiting of its own — production serves one user — so an
      // unpaced harness running questions concurrently alongside judge calls
      // reliably 429s.
      withLlmPacing("generate", () =>
        answerOnce(
          question,
          top.map((entry) => entry.chunk),
          variant.generation.maxTokens,
          generationModel,
        ),
      ),
  );
  const generateMs = performance.now() - generateStart;

  if (!generationHit) {
    cost.generate += costOf("generate", generationModel, completion.usage);
  }
  cost.total = cost.embed + cost.rerank + cost.generate + cost.judge;

  // Citations are [n] markers over the passages actually in the prompt, so they
  // resolve against `retrieved` in prompt order. A marker outside that range is
  // DANGLING — the model invented a source. Those are counted, not silently
  // dropped, and reported as a metric; they carry no chunk to point at, so they
  // cannot be represented in the Citation shape.
  const byChunkId = new Map(retrieved.map((r) => [r.chunkId, r]));
  const extracted = extractCitations(completion.text, retrieved);

  const citations: Citation[] = [];
  let danglingCitations = 0;
  for (const c of extracted) {
    const chunk = c.chunkId === null ? undefined : byChunkId.get(c.chunkId);
    if (!chunk) {
      danglingCitations++;
      continue;
    }
    citations.push({ chunkId: chunk.chunkId, docId: chunk.docId, page: chunk.page });
  }

  return {
    retrieved,
    answer: completion.text,
    citations,
    latency: {
      embedMs: Math.round(embedMs),
      searchMs: Math.round(searchMs),
      rerankMs: Math.round(rerankMs),
      generateMs: Math.round(generateMs),
      totalMs: Math.round(performance.now() - t0),
    },
    cost,
    rewrittenQuery: rewrite.rewritten,
    degraded,
    danglingCitations,
  };
}
