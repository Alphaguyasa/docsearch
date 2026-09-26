import { cookies, headers } from "next/headers";

import { DICTS, LANG_COOKIE, type Dict, type Lang } from "./dict";

/**
 * The reader's language on the server: their saved choice, else Amharic when
 * their browser prefers it, else English. The cookie only ever holds "en" or
 * "am" — never anything they wrote.
 */
export async function getLang(): Promise<Lang> {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  if (saved === "en" || saved === "am") return saved;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*am\b/i.test(accept) ? "am" : "en";
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: DICTS[lang] };
}
