"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";

import { DICTS, LANG_COOKIE, LANGS, type Dict, type Lang } from "./dict";

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** The reader's language and its dictionary, in any client component. */
export function useT(): { lang: Lang; t: Dict } {
  const lang = useContext(LangContext);
  return { lang, t: DICTS[lang] };
}

/**
 * English | አማርኛ. Saves the choice for a year and re-renders the page on the
 * server in the new language; nothing else is stored.
 */
export function LangToggle() {
  const { lang, t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="radiogroup"
      aria-label={t.lang.label}
      className={`flex h-8 items-center rounded-full bg-white/[0.08] p-0.5 text-[12px] ring-1 ring-white/10 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          lang={l}
          onClick={() => {
            if (l === lang) return;
            document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
            start(() => router.refresh());
          }}
          className={`h-7 rounded-full px-2.5 transition-colors ${
            lang === l ? "bg-[#e8b560] font-semibold text-[#0b0907]" : "text-[#f1e9dc]/75 hover:text-[#f1e9dc]"
          }`}
        >
          {l === "en" ? "EN" : "አማ"}
        </button>
      ))}
    </div>
  );
}
