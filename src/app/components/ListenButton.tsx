"use client";

import { useEffect, useRef, useState } from "react";

import { pickVoice, speakableText, speechChunks } from "@/lib/speech";
import { useT } from "../i18n/client";

type State = "idle" | "playing" | "paused";

/**
 * "Listen" for a finished story, read by the browser's own voice. Shown only
 * when the device has a voice for the story's language: many phones have no
 * Amharic voice, and an English voice reading Ethiopic is worse than silence.
 * Nothing is sent anywhere; the speech is made on the device.
 */
export function ListenButton({ text, lang }: { text: string; lang: "en" | "am" }) {
  const { t } = useT();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [state, setState] = useState<State>("idle");
  // Bumped on every stop, so the end events of cancelled utterances are ignored.
  const run = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    // Chrome fills the voice list late and says so with voiceschanged.
    const update = () => setVoice(pickVoice(synth.getVoices(), lang));
    update();
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, [lang]);

  // A new story, a language change or leaving the page stops the old one.
  useEffect(() => {
    const counter = run; // the counter itself, not a DOM node: reading it at cleanup is the point
    return () => {
      counter.current++;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setState("idle");
    };
  }, [text, lang]);

  if (!voice) return null;

  function play() {
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++run.current;
    const chunks = speechChunks(speakableText(text));
    if (!chunks.length || !voice) return;
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.95; // a little slower: these stories are read closely
      if (i === chunks.length - 1) u.onend = () => run.current === id && setState("idle");
      u.onerror = () => run.current === id && setState("idle");
      synth.speak(u);
    });
    setState("playing");
  }

  function pause() {
    window.speechSynthesis.pause();
    setState("paused");
  }

  function resume() {
    window.speechSynthesis.resume();
    setState("playing");
  }

  function stop() {
    run.current++;
    window.speechSynthesis.cancel();
    setState("idle");
  }

  const pill =
    "inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 py-2 font-sans text-sm text-muted transition-colors duration-300 hover:border-gold/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-gold";

  return (
    <div role="group" aria-label={t.story.listen.label} className="mt-8 flex flex-wrap gap-3">
      {state === "idle" && (
        <button type="button" className={pill} onClick={play}>
          <span aria-hidden="true">▶</span>
          {t.story.listen.play}
        </button>
      )}
      {state === "playing" && (
        <button type="button" className={pill} onClick={pause}>
          <span aria-hidden="true">❚❚</span>
          {t.story.listen.pause}
        </button>
      )}
      {state === "paused" && (
        <button type="button" className={pill} onClick={resume}>
          <span aria-hidden="true">▶</span>
          {t.story.listen.resume}
        </button>
      )}
      {state !== "idle" && (
        <button type="button" className={pill} onClick={stop}>
          <span aria-hidden="true">■</span>
          {t.story.listen.stop}
        </button>
      )}
    </div>
  );
}
