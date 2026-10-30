/**
 * Which language a piece of text is in, judged by its script. Amharic is the
 * only language here written in Ethiopic (U+1200–U+137F), so the script is
 * enough; shared by the bot and the web page so both judge the same way.
 */
export const ETHIOPIC = /[ሀ-፿]/;

const ETHIOPIC_ALL = /[ሀ-፿]/g;
const LATIN_ALL = /[A-Za-z]/g;

export function hasEthiopic(text: string): boolean {
  return ETHIOPIC.test(text);
}

/**
 * "am" or "en" by whichever script has more letters, or null before there are
 * any. A majority, not "any Ethiopic", so an English story that quotes one
 * Amharic word keeps an English voice in a screen reader.
 */
export function textLang(text: string): "am" | "en" | null {
  const am = text.match(ETHIOPIC_ALL)?.length ?? 0;
  const en = text.match(LATIN_ALL)?.length ?? 0;
  if (!am && !en) return null;
  return am > en ? "am" : "en";
}
