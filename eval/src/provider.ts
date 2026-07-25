/**
 * LLM provider abstraction for the eval harness.
 *
 * Built here (Phase 1) rather than Phase 4 because golden set generation already
 * needs LLM calls, and docs/EVAL_HARNESS.md is explicit that retrofitting this
 * after the judges exist is the refactor that breaks judge determinism.
 *
 * Every call is temperature 0 and goes through the disk cache, so a re-run of an
 * unchanged generation costs nothing. Providers report token usage; `costUsd` is
 * computed from PRICING below.
 *
 * DEFAULT IS GEMINI. docs/EVAL_HARNESS.md writes its prompts against the
 * Anthropic API, but this project's Anthropic key is invalid and the spec's own
 * zero-cost path routes generation and judging through Gemini's free tier. The
 * Anthropic adapter is implemented and selectable, just not the default.
 */
import { cached } from "./cache";

export type ProviderName = "gemini" | "anthropic";

/**
 * Verified against the model catalog: `claude-haiku-4-5-20251001` is the dated
 * full ID for Claude Haiku 4.5 (alias `claude-haiku-4-5`), 200K context, active.
 * Kept as a constant per docs/EVAL_HARNESS.md regardless of which provider runs.
 */
export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/**
 * DELIBERATELY NOT the app's `gemini-flash-latest` (src/lib/llm.ts).
 *
 * Measured on this project's key: `gemini-flash-latest` allows 20 requests PER
 * DAY on the free tier (quota `GenerateRequestsPerDayPerProjectPerModel`), which
 * cannot support a harness that makes hundreds of calls per run. The Flash-Lite
 * tier has real headroom, and docs/EVAL_HARNESS.md explicitly says to design for
 * Flash / Flash-Lite. Override with EVAL_GEMINI_MODEL if quotas change.
 */
export const GEMINI_MODEL = process.env.EVAL_GEMINI_MODEL ?? "gemini-flash-lite-latest";

/**
 * USD per 1,000,000 tokens.
 *
 * Anthropic: https://claude.com/pricing — Claude Haiku 4.5 is $1.00 input /
 * $5.00 output per MTok.
 *
 * Gemini: https://ai.google.dev/pricing — the free tier bills nothing, which is
 * the whole point of the zero-cost path, so it is recorded as 0. That makes
 * `costUsd` on this path a truthful 0 rather than an imagined paid-tier figure;
 * revisit if this ever moves to a billed key.
 */
export const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  [ANTHROPIC_MODEL]: { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "gemini-flash-latest": { inputPerMTok: 0, outputPerMTok: 0 },
  "gemini-flash-lite-latest": { inputPerMTok: 0, outputPerMTok: 0 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Completion {
  text: string;
  usage: Usage;
  costUsd: number;
}

export interface CompleteOptions {
  system?: string;
  maxTokens?: number;
  /** Ask the provider for raw JSON. Advisory — parse defensively regardless. */
  json?: boolean;
  /**
   * Sampling temperature. Defaults to 0 — a judge or generator that varies run
   * to run cannot be calibrated, and a cached result would disagree with a
   * fresh one. Callers may override, but every current caller wants 0.
   */
  temperature?: number;
}

/** Deterministic by default; see CompleteOptions.temperature. */
const DEFAULT_TEMPERATURE = 0;

export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(prompt: string, opts?: CompleteOptions): Promise<Completion>;
}

function costOf(model: string, usage: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (
    (usage.inputTokens / 1e6) * p.inputPerMTok +
    (usage.outputTokens / 1e6) * p.outputPerMTok
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 5;

/**
 * A per-DAY quota is exhausted. Distinct from an ordinary 429 because no amount
 * of backoff inside this run will clear it — the caller should stop, keep what
 * it has, and tell the user, rather than burning retries to fail anyway.
 */
export class QuotaExhaustedError extends Error {
  constructor(
    readonly model: string,
    readonly quotaId: string,
    readonly quotaValue: string | null,
  ) {
    super(
      `Daily free-tier quota exhausted for ${model} ` +
        `(${quotaId}${quotaValue ? `, limit ${quotaValue}/day` : ""}). ` +
        `It resets on Google's schedule — cached calls still replay for free.`,
    );
    this.name = "QuotaExhaustedError";
  }
}

/** A per-day quota violation, if the 429 body describes one. */
function dailyQuotaViolation(
  body: string,
): { quotaId: string; quotaValue: string | null } | null {
  if (!/PerDay/i.test(body)) return null;
  const quotaId = body.match(/"quotaId":\s*"([^"]*PerDay[^"]*)"/i)?.[1];
  if (!quotaId) return null;
  return { quotaId, quotaValue: body.match(/"quotaValue":\s*"(\d+)"/)?.[1] ?? null };
}

/**
 * Retry on 429 and 5xx with exponential backoff, honouring Retry-After — except
 * for per-day quota exhaustion, which fails fast.
 *
 * docs/EVAL_HARNESS.md asks for exactly this: sanity-check quota and fail with a
 * clear message rather than dying at question 60. A per-minute 429 is
 * traffic-shaping worth waiting out; a per-day cap is a wall.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  model: string,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;

    const body = await res.text().catch(() => "");

    if (res.status === 429) {
      const daily = dailyQuotaViolation(body);
      if (daily) throw new QuotaExhaustedError(model, daily.quotaId, daily.quotaValue);
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(
        `LLM request failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`,
      );
    }

    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** attempt;
    process.stderr.write(`  [rate limited — waiting ${Math.round(waitMs / 1000)}s]\n`);
    await sleep(waitMs);
  }
}

// --- Gemini (REST, no SDK — matches the project convention) ------------------

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

class GeminiProvider implements LLMProvider {
  readonly name = "gemini" as const;
  readonly model = GEMINI_MODEL;

  async complete(prompt: string, opts: CompleteOptions = {}): Promise<Completion> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.model}:generateContent?key=${apiKey}`;

    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(opts.system
            ? { system_instruction: { parts: [{ text: opts.system }] } }
            : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            // Deterministic by default, so a cached result and a fresh one agree.
            temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
            maxOutputTokens: opts.maxTokens ?? 2048,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
      this.model,
    );

    const json = (await res.json()) as GeminiResponse;
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    const usage: Usage = {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
    return { text, usage, costUsd: costOf(this.model, usage) };
  }
}

// --- Anthropic (official SDK, per project convention) ------------------------

class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  readonly model = ANTHROPIC_MODEL;

  async complete(prompt: string, opts: CompleteOptions = {}): Promise<Completion> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

    // Imported lazily so a Gemini-only run never constructs the client.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b): b is { type: "text"; text: string; citations: never } =>
        b.type === "text",
      )
      .map((b) => b.text)
      .join("");
    const usage: Usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
    return { text, usage, costUsd: costOf(this.model, usage) };
  }
}

export function getProvider(name?: string): LLMProvider {
  const selected = (name ?? process.env.EVAL_LLM_PROVIDER ?? "gemini") as ProviderName;
  switch (selected) {
    case "gemini":
      return new GeminiProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      throw new Error(`Unknown provider "${selected}". Use "gemini" or "anthropic".`);
  }
}

/**
 * A cached completion. The cache key is the full call description, so changing
 * the model, system prompt, or any option is correctly a different entry.
 */
export async function completeCached(
  provider: LLMProvider,
  prompt: string,
  opts: CompleteOptions = {},
): Promise<Completion> {
  return cached(
    "generation",
    { provider: provider.name, model: provider.model, prompt, ...opts },
    () => provider.complete(prompt, opts),
  );
}

/**
 * Parse strict JSON from a model response, defensively.
 *
 * Models wrap JSON in ``` fences even when told not to, and sometimes add a
 * sentence before it. We strip fences, then fall back to the outermost
 * brace-delimited span, and only then give up — with the raw text in the error
 * so a bad generation is diagnosable instead of just "unexpected token".
 */
export function parseJsonLoose<T>(raw: string): T {
  const text = raw.trim();

  const attempts: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) attempts.push(fenced[1]);

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(text.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    attempts.push(text.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next shape.
    }
  }
  throw new Error(
    `Model did not return parseable JSON. Raw response:\n${raw.slice(0, 500)}`,
  );
}

/**
 * Parse a single JSON OBJECT, unwrapping the array a model returns when it
 * decides to answer with `[{...}]` despite being asked for one object.
 *
 * Observed in practice on the aggregation prompt: without this, a perfectly good
 * generation is silently discarded because `.question` is undefined on an array,
 * and the bucket comes back empty for no visible reason.
 */
export function parseJsonObject<T>(raw: string): T {
  const value = parseJsonLoose<T | T[]>(raw);
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error("Model returned an empty JSON array.");
    return value[0];
  }
  return value;
}
