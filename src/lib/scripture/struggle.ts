/**
 * Map what a person writes ("I keep lying to my wife", "ሁልጊዜ እዋሻለሁ") to the
 * fixed sin-tag vocabulary in data/figures.seed.json.
 *
 * Pass 1 is a synonym table (English + Amharic) — free, instant, testable.
 * Pass 2 runs only when pass 1 finds nothing: one short LLM call constrained
 * to the vocabulary, with its output validated against it.
 */
import figures from "../../../data/figures.seed.json";

export const VOCABULARY: readonly string[] = figures.vocabulary;

/**
 * Fold Ethiopic homophone letters to one canonical form, so ሠ/ሰ, ሐ/ኀ/ሀ,
 * ዐ/አ and ፀ/ጸ spell the same word. Each family occupies an 8-codepoint row
 * with the same vowel order, so the fold is a fixed codepoint offset.
 */
export function foldEthiopic(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let f = cp;
    if (cp >= 0x1210 && cp <= 0x1217) f = cp - 0x10; // ሐ -> ሀ
    else if (cp >= 0x1280 && cp <= 0x1287) f = cp - 0x80; // ኀ -> ሀ
    else if (cp >= 0x1220 && cp <= 0x1227) f = cp + 0x10; // ሠ -> ሰ
    else if (cp >= 0x12d0 && cp <= 0x12d7) f = cp - 0x30; // ዐ -> አ
    else if (cp >= 0x1340 && cp <= 0x1347) f = cp - 0x08; // ፀ -> ጸ
    out += String.fromCodePoint(f);
  }
  return out;
}

/** Tag -> stems. English stems match word starts; Amharic stems match anywhere (after folding). */
const SYNONYMS: Record<string, { en: string[]; am?: string[] }> = {
  adultery: { en: ["adulter", "cheat on", "cheated on", "cheating on", "affair", "unfaithful", "another man's wife", "another woman's husband", "married woman", "married man", "someone's wife", "someone's husband", "someone else's wife", "someone else's husband", "my friend's wife", "my friend's husband"], am: ["ምንዝር", "አመነዘር"] },
  lust: { en: ["lust", "porn", "pornograph", "masturbat", "sexual thought", "desire for her", "desire for him", "impure thought", "chasing pleasure", "lived for pleasure", "pleasures of"], am: ["ምኞት", "ፍትወት", "ፖርን"] },
  sexual_sin: { en: ["fornicat", "sex before marriage", "premarital", "slept with", "sleep with", "prostitut", "hook up", "hooking up", "sexual sin", "sexually"], am: ["ዝሙት", "ሴሰኝነት"] },
  murder: { en: ["murder", "killed", "kill someone", "took a life"], am: ["ነፍስ ማጥፋት", "ግድያ", "ገደልኩ"] },
  violence: { en: ["violen", "hit my", "beat my", "hurt someone", "gang", "armed"], am: ["ደበደብ", "መታሁ", "ግፍ"] },
  anger: { en: ["anger", "angry", "rage", "temper", "furious", "yell", "shout", "hatred", "resent"], am: ["ቁጣ", "ተቆጣ", "ንዴት", "ተናደ", "ጥላቻ"] },
  resentment: { en: ["resent", "bitter", "can't forgive", "cannot forgive", "grudge", "unforgiv"], am: ["ቂም", "ይቅር ማለት አልቻል"] },
  deceit: { en: ["lie", "lied", "lying", "liar", "deceiv", "decept", "dishonest", "manipulat", "fake", "pretend"], am: ["ውሸት", "ዋሸ", "እዋሻ", "ማታለ", "አታለል"] },
  theft: { en: ["steal", "stole", "stolen", "theft", "thief", "shoplift", "took money", "robber", "robbed", "robbing", "robbery", "bandit", "mugged"], am: ["ስርቆት", "ሰረቅ", "ሌብነት", "ሌባ"] },
  greed: { en: ["greed", "love of money", "love money", "materialis", "covet"], am: ["ስግብግብ", "ገንዘብ ወዳድ"] },
  exploitation: { en: ["exploit", "cheated people", "overcharg", "bribe", "corrupt", "took advantage"], am: ["ጉቦ", "ሙስና", "በዘበዝ"] },
  envy: { en: ["envy", "envious", "jealous", "compare myself"], am: ["ቅናት", "ቀና"] },
  pride: { en: ["pride", "proud", "arrogan", "ego", "vain", "better than others", "look down on", "ambition", "ambitious"], am: ["ትዕቢት", "ኩራት", "ትምክህት"] },
  idolatry: { en: ["idol", "worship other", "witchcraft", "occult", "sorcer"], am: ["ጣዖት", "ጥንቆላ", "አስማት"] },
  doubt: { en: ["doubt", "don't believe", "do not believe", "lost my faith", "losing my faith", "is god real", "god exist"], am: ["ጥርጣሬ", "ተጠራጠር", "እምነቴን"] },
  despair: { en: ["despair", "hopeless", "no hope", "give up", "giving up", "too far gone", "can't go on", "worthless", "exhausted"], am: ["ተስፋ መቁረጥ", "ተስፋ ቆረጥ", "ተስፋ የለኝ"] },
  fear: { en: ["afraid", "fear", "scared", "anxious", "anxiety", "coward"], am: ["ፍርሃት", "ፈራ", "ጭንቀት"] },
  cowardice: { en: ["coward", "didn't stand up", "stayed silent", "too scared to"], am: ["ፈሪ"] },
  denial: { en: ["denied", "deny", "ashamed of my faith", "ashamed of jesus", "hid my faith", "didn't know jesus", "did not know jesus", "didn't know him", "said i didn't know", "never knew him", "denying jesus", "denying my faith"], am: ["ካድ", "ክህደት"] },
  betrayal: { en: ["betray", "backstab", "sold out", "turned on"], am: ["ከዳ", "ክህደት", "አሳልፌ"] },
  hypocrisy: { en: ["hypocri", "two-faced", "say one thing"], am: ["ግብዝ"] },
  disobedience: { en: ["disobey", "disobedien", "rebel", "ran from god", "running from god", "ignored god", "won't obey"], am: ["አለመታዘዝ", "አልታዘዝ"] },
  persecution: { en: ["persecut", "mocked christians", "hurt believers", "against the church"], am: ["አሳደድ", "ስደት"] },
  quitting: { en: ["quit", "gave up on", "walked away", "abandoned my", "left the ministry", "dropped out"], am: ["አቋረጥ", "ተውኩ"] },
  abandonment: { en: ["abandon", "left my family", "left them", "walked out on"], am: ["ጥዬ", "ተውኳቸው"] },
  shame: { en: ["shame", "ashamed", "dirty", "disgust", "unworthy", "unforgivable", "too sinful", "can god forgive"], am: ["ኀፍረት", "እፍረት", "አፍራለሁ", "ነውር"] },
};

// Deliberately absent: being abused, harmed, or assaulted. A person describing
// what was done TO them must never be matched to a sin — the safety layer
// (Session 5) routes those messages to support instead of stories.

/** Every tag in the table must exist in the vocabulary (checked by tests). */
export const SYNONYM_TAGS = Object.keys(SYNONYMS);

export function matchTags(message: string): string[] {
  const en = ` ${message.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ")} `;
  const am = foldEthiopic(message);
  const tags = new Set<string>();
  for (const [tag, { en: enStems, am: amStems = [] }] of Object.entries(SYNONYMS)) {
    if (enStems.some((s) => en.includes(` ${s}`))) tags.add(tag);
    if (amStems.some((s) => am.includes(foldEthiopic(s)))) tags.add(tag);
  }
  // "I can't forgive myself" is shame, not resentment of someone else.
  if (/ forgiv(e|ing) (myself|me) /.test(en)) {
    tags.delete("resentment");
    tags.add("shame");
  }
  return [...tags].filter((t) => VOCABULARY.includes(t));
}

export type TagLlm = (prompt: string) => Promise<string>;

/** Parse an LLM reply into vocabulary tags; anything off-vocabulary is dropped. */
export function parseLlmTags(reply: string): string[] {
  const m = reply.match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown[];
    return [...new Set(arr.filter((x): x is string => typeof x === "string" && VOCABULARY.includes(x)))].slice(0, 3);
  } catch {
    return [];
  }
}

export function tagPrompt(message: string): string {
  return [
    "Classify the struggle described below into at most 3 tags from this exact list:",
    VOCABULARY.join(", "),
    "Reply with ONLY a JSON array of tags, e.g. [\"deceit\"]. Reply [] if none fit.",
    "",
    `Message: ${message.slice(0, 1000)}`,
  ].join("\n");
}

export interface StruggleTags {
  tags: string[];
  via: "synonyms" | "llm" | "none";
}

export async function mapStruggle(message: string, llm?: TagLlm): Promise<StruggleTags> {
  const tags = matchTags(message);
  if (tags.length) return { tags, via: "synonyms" };
  if (!llm) return { tags: [], via: "none" };
  const fromLlm = parseLlmTags(await llm(tagPrompt(message)).catch(() => "[]"));
  return fromLlm.length ? { tags: fromLlm, via: "llm" } : { tags: [], via: "none" };
}
