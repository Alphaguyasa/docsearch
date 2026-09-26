"use client";

import { useState } from "react";

import { useT } from "../i18n/client";

/**
 * Share a person's page where people in Ethiopia actually talk: Telegram
 * first, then WhatsApp, then a plain link. On phones with a share sheet the
 * link button opens it instead.
 */
export function ShareStory({ url, name }: { url: string; name: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const text = t.person.shareText(name);
  const enc = encodeURIComponent;

  async function copy() {
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* dismissed */
    }
  }

  const pill =
    "inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 py-2 text-sm transition-colors duration-300 hover:border-gold/60 hover:text-foreground";

  return (
    <div>
      <p className="font-caps text-[12px] font-semibold tracking-[0.2em] text-gold">{t.person.share}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-muted">
        <a
          className={pill}
          href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`}
          target="_blank"
          rel="noreferrer"
        >
          Telegram
        </a>
        <a className={pill} href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <button type="button" className={pill} onClick={copy} aria-live="polite">
          {copied ? t.person.copied : t.person.copy}
        </button>
      </div>
    </div>
  );
}
