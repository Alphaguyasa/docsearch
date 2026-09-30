/**
 * Safety gate — runs BEFORE retrieval and before any story is told.
 *
 * A person asking "has anyone else done what I did?" may also be at risk of
 * harming themselves, or may be describing harm done TO them. Neither should
 * receive a story about a sinner. Both get a direct, human response and
 * resources first.
 *
 * Pass 1: phrase lists (English + Amharic, homophone-folded). Pass 2: only for
 * messages with softer distress signals, one constrained LLM call. The LLM can
 * escalate to crisis but never downgrade a phrase-list hit.
 */
import resources from "../../../data/crisis-resources.json";
import { foldEthiopic } from "./struggle";

export type SafetyKind = "self_harm" | "abuse_victim" | "harm_to_others";

export interface SafetyResult {
  crisis: boolean;
  kind?: SafetyKind;
  via: "phrases" | "llm" | "none";
}

const PHRASES: Record<SafetyKind, { en: string[]; am: string[] }> = {
  self_harm: {
    en: [
      "kill myself", "killing myself", "end my life", "ending my life", "suicide", "suicidal",
      "want to die", "wanna die", "don't want to live", "do not want to live", "don't want to be alive",
      "better off dead", "better off without me", "hurt myself", "hurting myself", "cut myself",
      "cutting myself", "self harm", "self-harm", "take my own life", "no reason to live", "end it all",
      "overdose",
    ],
    am: ["ራሴን ማጥፋት", "ራሴን ላጠፋ", "ራሴን ልገድል", "ራሴን እገድላለሁ", "መሞት እፈልጋለሁ", "መኖር አልፈልግም", "ራሴን መጉዳት"],
  },
  abuse_victim: {
    en: [
      "abused me", "was abused", "been abused", "raped", "rape me", "molested", "beats me", "hits me",
      "sexually assaulted", "was assaulted", "he hurts me", "she hurts me",
      "they hurt me", "is hurting me",
    ],
    am: ["ተደፈርኩ", "ደፈረኝ", "ይደበድበኛል", "ደበደበኝ", "አስገድዶ"],
  },
  harm_to_others: {
    en: ["going to kill", "gonna kill", "want to kill him", "want to kill her", "want to kill them", "going to hurt them", "planning to hurt"],
    am: ["ልገድለው", "ልገድላት", "እገድለዋለሁ"],
  },
};

/** Softer signals that justify asking the classifier. */
const DISTRESS = /hopeless|worthless|can'?t go on|tired of living|no way out|give up on life|disappear forever|nobody would miss|ተስፋ የለኝ|ደክሞኛል/i;

export function phraseCheck(message: string): SafetyKind | undefined {
  const en = message.toLowerCase().replace(/[’']/g, "'");
  const am = foldEthiopic(message);
  for (const kind of ["self_harm", "harm_to_others", "abuse_victim"] as SafetyKind[]) {
    const { en: e, am: a } = PHRASES[kind];
    if (e.some((p) => en.includes(p)) || a.some((p) => am.includes(foldEthiopic(p)))) return kind;
  }
  return undefined;
}

export type SafetyLlm = (prompt: string) => Promise<string>;

export function safetyPrompt(message: string): string {
  return [
    "You screen messages sent to a Christian app for crisis risk. Reply with exactly one word:",
    "SELF_HARM if the writer may be thinking of suicide or harming themselves,",
    "ABUSE if the writer describes being abused or harmed by someone,",
    "OTHERS if the writer intends to harm someone,",
    "NONE otherwise. When unsure between NONE and a risk, choose the risk.",
    "",
    `Message: ${message.slice(0, 1000)}`,
  ].join("\n");
}

export async function checkSafety(message: string, llm?: SafetyLlm): Promise<SafetyResult> {
  const hit = phraseCheck(message);
  if (hit) return { crisis: true, kind: hit, via: "phrases" };
  if (!llm || !DISTRESS.test(message)) return { crisis: false, via: "none" };
  // Fail safe: if the classifier is down, treat a distress signal as a crisis.
  const reply = (await llm(safetyPrompt(message)).catch(() => "SELF_HARM")).toUpperCase();
  if (reply.includes("SELF_HARM")) return { crisis: true, kind: "self_harm", via: "llm" };
  if (reply.includes("ABUSE")) return { crisis: true, kind: "abuse_victim", via: "llm" };
  if (reply.includes("OTHERS")) return { crisis: true, kind: "harm_to_others", via: "llm" };
  return { crisis: false, via: "llm" };
}

export interface CrisisResponse {
  kind: SafetyKind;
  message: string;
  steps: string[];
  resources: { name: string; detail: string; url?: string; phone?: string }[];
}

const MESSAGES: Record<SafetyKind, string> = {
  self_harm:
    "Thank you for telling me. What you're carrying sounds really heavy, and you don't have to carry it alone. " +
    "Before anything else, please reach out to someone who can be with you in this right now.",
  abuse_victim:
    "What you describe is being done to you — it is not your sin, and it is not your fault. " +
    "You deserve to be safe. Please reach out to someone who can help you get safe.",
  harm_to_others:
    "It sounds like you're in a lot of pain and anger right now. Please step away from the situation " +
    "and talk to someone right now, before anyone gets hurt.",
};

export function crisisResponse(kind: SafetyKind): CrisisResponse {
  return {
    kind,
    message: MESSAGES[kind],
    steps: resources.always,
    resources: resources.global,
  };
}
