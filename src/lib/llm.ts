/**
 * SERVER-ONLY. Generation provider abstraction.
 *
 * This is the ONLY module that may reference a concrete LLM provider. Everything
 * downstream (answer.ts, the API route) talks to the `LlmProvider` interface and
 * is provider-agnostic. The active provider is chosen by GENERATION_PROVIDER.
 *
 * Both providers expose the same contract: `stream(messages)` returns an async
 * iterable of plain text deltas. Nothing else about the provider leaks out — the
 * anthropic backend disables thinking so its stream is pure text, matching the
 * gemini backend, so switching providers changes nothing downstream.
 *
 * Per CLAUDE.md: the Anthropic side uses the official SDK; the Gemini side calls
 * the REST API directly with fetch (no SDK). Never import this into a client
 * component.
 */
import Anthropic from "@anthropic-ai/sdk";

import { config } from "./env";
import { backoffMs, isRetryableStatus } from "./transient";

export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

/** Tokens a provider reported for one call. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletion {
  text: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  /** Stream the completion for `messages` as a sequence of text deltas. */
  stream(messages: LlmMessage[]): AsyncIterable<string>;
  /**
   * Non-streaming completion that also reports token usage.
   *
   * ADDED RATHER THAN CHANGING `stream()`, deliberately. The eval harness needs
   * usage to compute costUsd, and `stream()` yields bare strings with nowhere to
   * put it. Widening `stream()` to yield a union, or making it return a handle,
   * would touch the live SSE path used by /api/search and scripts/ask.ts — the
   * one code path in this app where a mistake is visible to a user mid-response.
   *
   * So the harness gets its own entry point. Both methods share the provider
   * selection, the model constants, and the prompt built by answer.ts, which is
   * what "reuse the app's generation path" has to mean here: the harness cannot
   * drift from production on anything that affects the answer, only on how the
   * bytes arrive.
   */
  complete(
    messages: LlmMessage[],
    maxTokens?: number,
    /**
     * Override the provider's default model.
     *
     * For the eval harness: `Variant.generation.model` names the model an
     * experiment arm runs on, and experiment 7 in docs/EVAL_HARNESS.md varies
     * it directly. Without this the field is decorative — every arm would
     * silently run whatever the app is configured for, and a "model comparison"
     * would compare a model against itself. Production passes nothing.
     */
    model?: string,
  ): Promise<LlmCompletion>;
}

/** The model each provider will use by default, for cost attribution. */
export function activeGenerationModel(): string {
  return config.GENERATION_PROVIDER === "anthropic" ? ANTHROPIC_MODEL : GEMINI_MODEL;
}

const ANTHROPIC_MODEL = "claude-sonnet-5";
// gemini-2.5-flash (the original target) is retired for new API keys; this is
// the stable flash alias Google points such keys to.
const GEMINI_MODEL = "gemini-flash-latest";
const MAX_OUTPUT_TOKENS = 4096;

/** Resolve the provider named by GENERATION_PROVIDER. */
export function getLlm(): LlmProvider {
  switch (config.GENERATION_PROVIDER) {
    case "anthropic":
      return anthropicProvider;
    case "gemini":
      return geminiProvider;
  }
}

// --- Anthropic (official SDK) ------------------------------------------------

// Lazily constructed so a gemini-only deployment never instantiates a client
// (and never needs an Anthropic key).
let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    // env.ts guarantees the key is present when this provider is selected.
    anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

const anthropicProvider: LlmProvider = {
  async *stream(messages: LlmMessage[]): AsyncIterable<string> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages
      .filter((m): m is LlmMessage & { role: "user" | "assistant" } =>
        m.role !== "system",
      )
      .map((m) => ({ role: m.role, content: m.content }));

    const stream = getAnthropicClient().messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Disable thinking so the event stream is pure text deltas — the same
      // shape the gemini backend yields. Sonnet 5 runs adaptive thinking by
      // default, which would interleave thinking blocks we'd have to filter.
      thinking: { type: "disabled" },
      ...(system ? { system } : {}),
      messages: turns,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  },

  async complete(
    messages: LlmMessage[],
    maxTokens?: number,
    model?: string,
  ): Promise<LlmCompletion> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages
      .filter((m): m is LlmMessage & { role: "user" | "assistant" } =>
        m.role !== "system",
      )
      .map((m) => ({ role: m.role, content: m.content }));

    const message = await getAnthropicClient().messages.create({
      model: model ?? ANTHROPIC_MODEL,
      max_tokens: maxTokens ?? MAX_OUTPUT_TOKENS,
      thinking: { type: "disabled" },
      ...(system ? { system } : {}),
      messages: turns,
    });

    return {
      text: message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(""),
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  },
};

// --- Gemini (REST, no SDK) ---------------------------------------------------

interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}
interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Split a message list into Gemini's system_instruction + contents shape. */
function toGeminiPayload(messages: LlmMessage[]): {
  systemText: string;
  contents: { role: string; parts: { text: string }[] }[];
} {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return { systemText, contents };
}

// When a model is overloaded or out of free quota, the next one is tried.
// Each has its own free-tier quota, so a day's traffic is spread across them;
// Gemma's free quota is by far the largest. Gemma takes no system_instruction,
// so its system prompt rides at the top of the first user turn.
const GEMINI_FALLBACKS = ["gemini-flash-lite-latest", "gemma-3-27b-it"];
const GEMINI_ATTEMPTS = 3;

/**
 * The model for short classification calls (safety, struggle tags):
 * Flash-Lite, so Flash's small free quota is kept for writing answers.
 *
 * MEASURED: a full eval's worth of classification (about 60 calls) ran on
 * Flash-Lite's free tier without running out. Moving it to Gemma made every
 * LLM-tagged question come back with no tags (holdout figure hit 100% -> 60%),
 * so Gemma stays a last resort only.
 */
export function lightModel(): string | undefined {
  return config.GENERATION_PROVIDER === "gemini" ? GEMINI_FALLBACKS[0] : undefined;
}

interface GeminiRequest {
  systemText: string;
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig?: Record<string, unknown>;
}

function geminiBody(model: string, req: GeminiRequest): unknown {
  if (model.startsWith("gemma") && req.systemText) {
    const [first, ...rest] = req.contents;
    const merged = first
      ? [{ ...first, parts: [{ text: `${req.systemText}\n\n${first.parts.map((p) => p.text).join("")}` }] }, ...rest]
      : [{ role: "user", parts: [{ text: req.systemText }] }];
    return { contents: merged, ...(req.generationConfig ? { generationConfig: req.generationConfig } : {}) };
  }
  return {
    ...(req.systemText ? { system_instruction: { parts: [{ text: req.systemText }] } } : {}),
    contents: req.contents,
    ...(req.generationConfig ? { generationConfig: req.generationConfig } : {}),
  };
}

/**
 * POST to Gemini, riding out trouble instead of failing the reader:
 * - per-minute limits and overload (429 / 5xx) are retried with backoff;
 * - a used-up daily free quota is not retried (it will not clear today) —
 *   the next model in the chain is tried instead, as is an overloaded model
 *   that stays overloaded, a model this key cannot use (404), or a request
 *   one model rejects (400).
 * Retrying is safe for streaming too: nothing has been read from the body.
 * A bad key (401/403) throws at once; anything else throws once every model
 * in the chain has failed.
 */
async function geminiPost(
  method: "streamGenerateContent?alt=sse&" | "generateContent?",
  model: string,
  req: GeminiRequest,
): Promise<Response> {
  const post = (m: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:${method}key=${config.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(m, req)),
    });

  const chain = [model, ...GEMINI_FALLBACKS.filter((m) => m !== model)];
  let last = "";
  for (const m of chain) {
    let res = await post(m);
    for (let attempt = 0; ; attempt++) {
      if (res.ok && res.body) return res;
      const text = await res.text().catch(() => "");
      last = `Gemini request failed (${m}): ${res.status} ${res.statusText}` + (text ? ` — ${text}` : "");
      // A bad key fails the same on every model: stop at once.
      if (res.status === 401 || res.status === 403) throw new Error(last);
      // A model this key cannot use (404) or a request it rejects (400) may
      // still work on the next model in the chain.
      if (!isRetryableStatus(res.status)) break;
      if (/PerDay/i.test(text) || attempt >= GEMINI_ATTEMPTS - 1) break; // next model
      await new Promise((r) => setTimeout(r, backoffMs(attempt, res.headers.get("retry-after"))));
      res = await post(m);
    }
  }
  throw new Error(last);
}

const geminiProvider: LlmProvider = {
  async *stream(messages: LlmMessage[]): AsyncIterable<string> {
    // Gemini uses "model" for the assistant role and has no system role in
    // `contents` — the system prompt goes in `system_instruction`.
    const { systemText, contents } = toGeminiPayload(messages);

    const res = await geminiPost("streamGenerateContent?alt=sse&", GEMINI_MODEL, { systemText, contents });

    // Parse the SSE stream: each event is a `data: <json>` line, separated by
    // blank lines. Buffer across chunk boundaries and emit any text parts.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        const chunk = JSON.parse(payload) as GeminiStreamChunk;
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.text) yield part.text;
        }
      }
    }
  },

  async complete(
    messages: LlmMessage[],
    maxTokens?: number,
    model?: string,
  ): Promise<LlmCompletion> {
    const { systemText, contents } = toGeminiPayload(messages);

    const res = await geminiPost("generateContent?", model ?? GEMINI_MODEL, {
      systemText,
      contents,
      generationConfig: { maxOutputTokens: maxTokens ?? MAX_OUTPUT_TOKENS },
    });

    const json = (await res.json()) as GeminiResponse;
    return {
      text: (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join(""),
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  },
};
