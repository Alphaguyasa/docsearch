/**
 * SERVER-ONLY. Voyage AI embeddings via the REST API — no SDK, per project
 * convention. Reads VOYAGE_API_KEY through the validated config. Never import
 * this module into a client component.
 */
import { config } from "./env";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";
const EXPECTED_DIM = 1024; // must match the schema's vector(1024) column
const BATCH_SIZE = 100;
const MAX_RETRIES = 5;

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
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    out.push(...(await embedBatch(batch, inputType)));
  }
  return out;
}

async function embedBatch(input: string[], inputType: InputType): Promise<number[][]> {
  // Retry on 429 and 5xx with exponential backoff + jitter, up to MAX_RETRIES.
  for (let attempt = 0; ; attempt++) {
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
      // Network-level failure — treat as transient.
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(backoffMs(attempt));
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

    // Honor Retry-After on 429 when present; otherwise exponential backoff.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : backoffMs(attempt);
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

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 250; // 0.5s, 1s, 2s, 4s, 8s (+jitter)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
