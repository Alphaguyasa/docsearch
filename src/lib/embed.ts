/**
 * SERVER-ONLY. Voyage AI embeddings via the REST API — no SDK, per project
 * convention. Reads VOYAGE_API_KEY through the validated config. Never import
 * this module into a client component.
 */
import { countTokens } from "./chunk";
import { config } from "./env";
import { batchByTokens, RateLimiter } from "./ratelimit";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * voyage-4. Verified against docs.voyageai.com: 1024 default dimensions
 * (configurable), 32k context, and covered by the 200M-token free allocation
 * shared with voyage-4-large / voyage-4-lite / voyage-context-4 / voyage-code-3.
 *
 * The previous pin, voyage-3.5, is NOT in that allocation and bills from the
 * first token — which is why this moved.
 *
 * CHANGING THIS IS A RE-INDEX, NOT A CONFIG TWEAK. Embeddings from different
 * model generations occupy different vector spaces; mixing them in one table
 * makes cosine distance meaningless between rows and degrades retrieval with no
 * error and no obvious symptom. If you change the model, delete every chunk and
 * re-embed the whole corpus.
 */
const MODEL = "voyage-4";
const EXPECTED_DIM = 1024; // must match the schema's vector(1024) column
const BATCH_SIZE = 100;
const MAX_RETRIES = 5;

/**
 * Target tokens per request.
 *
 * On a free account the binding constraint is 3 requests/min against 10,000
 * tokens/min — so a request carrying one 200-token chunk burns a third of the
 * minute's request budget to move 2% of its token budget. Packing to ~3,000
 * tokens spends all three slots against the full token allowance instead.
 *
 * Kept below the per-minute token budget so a single batch is always sendable.
 */
const MAX_BATCH_TOKENS = 3_000;

/** First 429 backoff. Deliberately long: at 3 rpm a shorter wait just 429s again. */
const BASE_429_BACKOFF_MS = 20_000;

/**
 * One limiter per process, shared by ingestion and live queries — they draw on
 * the same account allowance, so separate limiters would together exceed it.
 */
let limiter: RateLimiter | null = null;
function getLimiter(): RateLimiter {
  if (!limiter) {
    limiter = new RateLimiter({ rpm: config.VOYAGE_RPM, tpm: config.VOYAGE_TPM });
  }
  return limiter;
}

/** Progress/ETA reporting for long ingests. */
export function limiterState(): {
  requestsMade: number;
  tokensSpent: number;
  totalWaitedMs: number;
} {
  const { requestsMade, tokensSpent, totalWaitedMs } = getLimiter().state;
  return { requestsMade, tokensSpent, totalWaitedMs };
}

/** Lower bound on how long `tokens` more tokens will take, given the limits. */
export function estimateRemainingMs(tokens: number, requests: number): number {
  return getLimiter().estimateRemainingMs(tokens, requests);
}

// Voyage distinguishes the two sides of the search. Documents are embedded at
// ingestion as "document"; the live query is embedded as "query". Using the
// wrong one quietly degrades retrieval quality, so it is never defaulted.
type InputType = "document" | "query";

interface VoyageResponse {
  data?: { embedding: number[]; index: number }[];
}

/**
 * Embed corpus documents (input_type "document"). Inputs are sent in batches of
 * 100; the returned array is aligned 1:1 with `texts` (same order). Every vector
 * is asserted to be exactly 1024-dimensional so a model/schema mismatch fails
 * loudly here, not as an opaque insert error downstream.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}

/**
 * Embed a single search query (input_type "query" — deliberately different from
 * ingestion). Returns one 1024-dim vector.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}

async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  // Pack by TOKENS, not item count: the request budget is the scarce resource,
  // so each request should carry as much of the token allowance as it can.
  const batches = batchByTokens(texts, countTokens, MAX_BATCH_TOKENS, BATCH_SIZE);

  const out: number[][] = [];
  for (const batch of batches) {
    out.push(...(await embedBatch(batch, inputType)));
  }
  return out;
}

async function embedBatch(input: string[], inputType: InputType): Promise<number[][]> {
  const batchTokens = input.reduce((sum, text) => sum + countTokens(text), 0);

  for (let attempt = 0; ; attempt++) {
    // Wait for BOTH a request slot and the token budget before every attempt,
    // including retries — a retry is another request against the same limits.
    await getLimiter().acquire(batchTokens);

    let res: Response;
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input,
          input_type: inputType,
          output_dimension: EXPECTED_DIM,
        }),
      });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const waitMs = backoffMs(attempt);
      console.warn(
        `  [embed] network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — ` +
          `retrying in ${Math.round(waitMs / 1000)}s`,
      );
      await sleep(waitMs);
      continue;
    }

    if (res.ok) {
      const json = (await res.json()) as VoyageResponse;
      return parseVectors(json, input.length);
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Voyage embeddings request failed: ${res.status} ${res.statusText}` +
          (body ? ` — ${body}` : ""),
      );
    }

    // Honour Retry-After when present; otherwise exponential from 20s. A
    // shorter first backoff is pointless at 3 requests/min — the next call
    // would simply 429 again.
    const retryAfter = Number(res.headers.get("retry-after"));
    const honoured = res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0;
    const waitMs = honoured ? retryAfter * 1000 : backoffMs(attempt);

    console.warn(
      `  [embed] ${res.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — ` +
        `waiting ${Math.round(waitMs / 1000)}s` +
        (honoured ? " (Retry-After)" : "") +
        `, ${input.length} chunk(s) / ${batchTokens} tokens`,
    );

    // Drain the buckets too: the provider has just told us we are over the
    // limit, so the local accounting is optimistic and must catch up.
    getLimiter().penalise(waitMs);
    await sleep(waitMs);
  }
}

function parseVectors(json: VoyageResponse, expectedCount: number): number[][] {
  if (!json.data || json.data.length !== expectedCount) {
    throw new Error(
      `Voyage returned ${json.data?.length ?? 0} embeddings for ${expectedCount} inputs`,
    );
  }
  // Voyage tags each item with its input `index`; sort to restore input order.
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((item, i) => {
    if (item.embedding.length !== EXPECTED_DIM) {
      throw new Error(
        `Voyage embedding dimension mismatch at input ${i}: got ` +
          `${item.embedding.length}, expected ${EXPECTED_DIM}. The schema's ` +
          `vector(${EXPECTED_DIM}) column and the model's output_dimension must agree.`,
      );
    }
    return item.embedding;
  });
}

/** 20s, 40s, 80s, 160s, 320s (+jitter). Sized for a 3 requests/min account. */
function backoffMs(attempt: number): number {
  return BASE_429_BACKOFF_MS * 2 ** attempt + Math.random() * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
