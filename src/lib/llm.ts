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

export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmProvider {
  /** Stream the completion for `messages` as a sequence of text deltas. */
  stream(messages: LlmMessage[]): AsyncIterable<string>;
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

const geminiProvider: LlmProvider = {
  async *stream(messages: LlmMessage[]): AsyncIterable<string> {
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    // Gemini uses "model" for the assistant role and has no system role in
    // `contents` — the system prompt goes in `system_instruction`.
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${config.GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemText
          ? { system_instruction: { parts: [{ text: systemText }] } }
          : {}),
        contents,
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Gemini request failed: ${res.status} ${res.statusText}` +
          (body ? ` — ${body}` : ""),
      );
    }

    // Parse the SSE stream: each event is a `data: <json>` line, separated by
    // blank lines. Buffer across chunk boundaries and emit any text parts.
    const reader = res.body.getReader();
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
};
