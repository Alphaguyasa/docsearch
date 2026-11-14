import assert from "node:assert/strict";
import { test } from "node:test";

import { JOURNEY, journeyDone } from "../src/app/journey";
import { readStored, writeStored } from "../src/app/stored";
import { addisDay, personOfDay, personOfTheDay } from "../src/lib/scripture/today";

type Store = Map<string, string>;

function withStorage(make: () => Storage | undefined, run: () => void) {
  const g = globalThis as Record<string, unknown>;
  const before = Object.getOwnPropertyDescriptor(g, "localStorage");
  Object.defineProperty(g, "localStorage", { configurable: true, get: make });
  try {
    run();
  } finally {
    if (before) Object.defineProperty(g, "localStorage", before);
    else delete g.localStorage;
  }
}

function memoryStorage(store: Store, full = false): Storage {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
}

test("a stored value is written, read back and removed", () => {
  const store: Store = new Map();
  withStorage(
    () => memoryStorage(store),
    () => {
      assert.equal(readStored("t:a"), null);
      writeStored("t:a", "coptic");
      assert.equal(store.get("t:a"), "coptic");
      assert.equal(readStored("t:a"), "coptic");
      writeStored("t:a", null);
      assert.equal(store.has("t:a"), false);
      assert.equal(readStored("t:a"), null);
    },
  );
});

test("blocked storage keeps a write for the rest of the visit instead of losing it", () => {
  withStorage(
    () => {
      throw new Error("SecurityError");
    },
    () => {
      assert.equal(readStored("t:b"), null);
      writeStored("t:b", "[1]");
      assert.equal(readStored("t:b"), "[1]");
      writeStored("t:b", null);
      assert.equal(readStored("t:b"), null);
    },
  );
});

test("a full storage keeps the newest write in memory, and storage wins again once a write succeeds", () => {
  const store: Store = new Map([["t:c", "old"]]);
  withStorage(
    () => memoryStorage(store, true),
    () => {
      writeStored("t:c", "new");
      assert.equal(store.get("t:c"), "old");
      assert.equal(readStored("t:c"), "new");
    },
  );
  withStorage(
    () => memoryStorage(store),
    () => {
      writeStored("t:c", "saved");
      store.set("t:c", "from another tab");
      assert.equal(readStored("t:c"), "from another tab");
    },
  );
});

test("journeyDone keeps only real journey days and survives damaged entries", () => {
  assert.deepEqual([...journeyDone(undefined)], []);
  assert.deepEqual([...journeyDone(null)], []);
  assert.deepEqual([...journeyDone("{not json")], []);
  assert.deepEqual([...journeyDone('{"a":1}')], []);
  assert.deepEqual([...journeyDone(JSON.stringify([JOURNEY[0], "nobody", JOURNEY[2]]))], [JOURNEY[0], JOURNEY[2]]);
});

test("personOfDay picks the same person as personOfTheDay for that day", () => {
  for (const iso of ["2026-01-01T00:00:00Z", "2026-09-25T20:59:00Z", "2026-09-25T21:00:00Z", "2026-11-14T07:00:00Z"]) {
    const date = new Date(iso);
    assert.equal(personOfDay(addisDay(date)).id, personOfTheDay(date).id, iso);
  }
});
