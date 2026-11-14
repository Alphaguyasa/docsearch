import { useSyncExternalStore } from "react";

/**
 * Values this reader keeps in their own browser (church, journey, journal),
 * read through useSyncExternalStore rather than copied into state by an
 * effect. The server and the first client render see `undefined`, so
 * hydration matches; the stored value follows straight after, as before.
 *
 * When storage is blocked or full (private mode, quota), a write is kept in
 * memory for the rest of the visit, so the page still answers the reader
 * even though nothing will be there next time.
 */

const CHANGED = "not-alone:stored";
const unsaved = new Map<string, string | null>();

export function readStored(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, value);
  }
  // Same-tab readers; other tabs hear the browser's own "storage" event.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The stored string, null if there is none, undefined before hydration. */
export function useStored(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => undefined,
  );
}
