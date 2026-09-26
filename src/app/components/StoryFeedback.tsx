"use client";

import { useState } from "react";

import { Lock } from "./Icons";
import { useT } from "../i18n/client";

/**
 * "Did this story help you?" — two quiet buttons under a finished story. One
 * tap, then a thank-you; the tap is sent with the people and tags the story
 * used, never with what the person wrote.
 */
export function StoryFeedback({ figures, tags }: { figures: string[]; tags: string[] }) {
  const { lang, t } = useT();
  const f = t.story.feedback;
  const [sent, setSent] = useState<null | boolean>(null);

  function send(helpful: boolean) {
    setSent(helpful);
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ helpful, figures: figures.slice(0, 5), tags: tags.slice(0, 5), lang }),
      keepalive: true,
    }).catch(() => {});
  }

  const pill =
    "min-h-11 rounded-full border px-5 py-2 font-caps text-[12px] font-semibold tracking-[0.14em] transition-[background-color,border-color,color,transform] duration-300 active:scale-[0.97]";

  return (
    <section
      aria-live="polite"
      className="rise mt-12 rounded-[22px] border border-border bg-panel/60 px-6 py-6 text-center sm:px-8"
    >
      {sent === null ? (
        <>
          <p className="font-display text-2xl font-semibold">{f.question}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => send(true)}
              className={`${pill} border-gold bg-gold text-background hover:shadow-[0_0_30px_-6px_rgb(232_181_96_/_0.7)]`}
            >
              {f.yes}
            </button>
            <button
              type="button"
              onClick={() => send(false)}
              className={`${pill} border-border text-muted hover:border-gold/60 hover:text-foreground`}
            >
              {f.no}
            </button>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <Lock className="h-3 w-3 text-gold" /> {f.privacy}
          </p>
        </>
      ) : (
        <p className="rise font-serif text-[18px] leading-7">{sent ? f.thanks : f.thanksNo}</p>
      )}
    </section>
  );
}
