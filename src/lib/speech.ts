/**
 * Reading a story aloud with the browser's own voices (speechSynthesis): free,
 * on the device, nothing sent anywhere. These helpers are pure so they can be
 * tested without a browser; the button lives in app/components/ListenButton.
 */

/** The parts of SpeechSynthesisVoice we look at. */
export interface VoiceLike {
  lang: string;
  name: string;
  default?: boolean;
  localService?: boolean;
}

/**
 * A voice that speaks `lang` ("en" or "am"), or null when the device has none.
 * Matching is on the primary subtag only ("am-ET", "am" and "AM_et" all match
 * "am"), never a fallback to another language: an Amharic story read by an
 * English voice is worse than no button. Prefers the browser's default, then a
 * voice that runs on the device (works offline, nothing leaves the phone).
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  const want = lang.toLowerCase();
  const matching = voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === want);
  if (!matching.length) return null;
  return matching.find((v) => v.default) ?? matching.find((v) => v.localService) ?? matching[0];
}

/**
 * The story as it should be heard: no [n] citation markers (read aloud they are
 * "bracket one bracket"), no markdown emphasis or heading marks, and blank lines
 * kept as pauses.
 */
export function speakableText(answer: string): string {
  return answer
    .replace(/\s*\[\d+\]/g, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Sentence ends in English and Amharic (። full stop, ፧ and ፨ question/paragraph marks).
const SENTENCE = /[^.!?።፧፨\n]+(?:[.!?።፧፨]+["'”’)]*|\n+|$)/g;

/**
 * The text cut into utterances of at most `max` characters, on sentence ends
 * where possible. Chrome stops a single long utterance after about 15 seconds,
 * and short ones also let pause and stop take effect between sentences.
 */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > max) {
      push();
      // A sentence longer than the cap is cut on spaces (Amharic separates words
      // with spaces or ፡, both handled), and hard-cut only if a word is longer.
      let rest = s;
      while (rest.length > max) {
        const window = rest.slice(0, max);
        const cut = Math.max(window.lastIndexOf(" "), window.lastIndexOf("፡"));
        const at = cut > 0 ? cut + 1 : max;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      cur = rest;
      continue;
    }
    if (cur && cur.length + 1 + s.length > max) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

/** The parts of a person page's story that listening needs (StoryPart, structurally). */
export interface ListenPart {
  role: "fall" | "restoration" | "context";
  ref: string;
  passages: readonly { ref: string; content: string }[];
}

/**
 * What "Listen" reads on a person page: the passages as the page shows them,
 * each under its heading and with its reference, in one language only, because
 * one voice reads it all. An Amharic reader hears the 1962 Amharic Bible where
 * the page shows it (passages it has no Amharic for are left out, rather than
 * read in Ethiopic by an English voice or the other way round); everyone else,
 * or an Amharic reader on a page with no Amharic passage, hears the English.
 */
export function personListening(
  parts: readonly ListenPart[],
  readerLang: "en" | "am",
  headings: Record<ListenPart["role"], string>,
  amharic: (ref: string) => { ref: string; text: string } | null,
): { text: string; lang: "en" | "am" } | null {
  // A heading is read once per run of its role, closed by the language's own full stop.
  const blocks = (rows: { role: ListenPart["role"]; body: string }[], stop: string) =>
    rows
      .map((r, i) => (i === 0 || rows[i - 1].role !== r.role ? `${headings[r.role]}${stop}\n\n${r.body}` : r.body))
      .join("\n\n");

  if (readerLang === "am") {
    const rows = parts.flatMap((p) => {
      const am = amharic(p.ref);
      return am ? [{ role: p.role, body: `${am.ref}።\n${am.text}` }] : [];
    });
    if (rows.length) return { text: blocks(rows, "።"), lang: "am" };
  }
  const rows = parts.flatMap((p) =>
    p.passages.filter((x) => x.content.trim()).map((x) => ({ role: p.role, body: `${x.ref}.\n${x.content.trim()}` })),
  );
  return rows.length ? { text: blocks(rows, "."), lang: "en" } : null;
}
