import { useSyncExternalStore } from "react";

import { addisDay } from "@/lib/scripture/today";

// The day can turn while the page sits in a background tab; look again
// whenever the reader comes back to it.
function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

const today = () => addisDay(new Date());
const notYet = () => 0;

/**
 * Today's day number in Addis Ababa, read from the reader's clock. 0 on the
 * server and in the first client render, so hydration matches and the
 * server's clock never decides what a reader sees.
 */
export function useAddisDay(): number {
  return useSyncExternalStore(subscribe, today, notYet);
}
