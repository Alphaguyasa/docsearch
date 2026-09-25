import assert from "node:assert/strict";
import { test } from "node:test";

import canonJson from "../data/canon.json";
import sourcesJson from "../corpus/scripture/sources.json";
import figuresJson from "../data/figures.seed.json";
import { canonByCode, traditionsFor, validateCanon } from "../src/lib/scripture/canon";
import {
  activeSources,
  pickArchiveItems,
  pickDjvuText,
  validateManifest,
  type Manifest,
  type SourceConfig,
} from "../src/lib/scripture/manifest";

test("canon.json is valid and complete for the 66-book Protestant canon", () => {
  const canon = validateCanon(canonJson);
  const proto = canon.books.filter((b) => b.section === "protocanon");
  assert.equal(proto.length, 66);
});

test("no deuterocanonical book leaks into the protestant filter", () => {
  for (const b of canonByCode().values()) {
    if (b.section === "deuterocanon") assert.ok(!b.traditions.includes("protestant"), b.code);
  }
});

test("Prayer of Manasseh is orthodox + ethiopian only", () => {
  assert.deepEqual(traditionsFor("MAN").sort(), ["ethiopian_orthodox", "orthodox"]);
});

test("unknown book code throws instead of guessing", () => {
  assert.throws(() => traditionsFor("XYZ"), /unknown book code/);
});

test("validateCanon rejects a protocanonical book missing a tradition", () => {
  const bad = { ...canonJson, books: [{ code: "GEN", name: "Genesis", traditions: ["catholic"], section: "protocanon" }] };
  assert.throws(() => validateCanon(bad), /must carry all traditions/);
});

test("sources.json: every active source has a license and a fetch target", () => {
  const active = activeSources(sourcesJson.sources as SourceConfig[]);
  assert.ok(active.length >= 4);
  for (const s of active) {
    assert.ok(s.license.length > 0, s.id);
    assert.ok(s.url || s.archiveQuery, s.id);
  }
  assert.ok(!active.some((s) => s.id === "kjv"), "kjv is deferred in v1");
});

test("every figure passage points at a known source id or 'pending'", () => {
  const ids = new Set([...sourcesJson.sources.map((s) => s.id), "pending"]);
  for (const f of figuresJson.figures) {
    for (const p of f.passages) assert.ok(ids.has(p.sourceId), `${f.id}: ${p.sourceId}`);
  }
});

test("pickArchiveItems keeps matching text items in identifier order", () => {
  const docs = [
    { identifier: "bookofsaints02budg", title: "The Book of the Saints of the Ethiopian Church vol 2", mediatype: "texts" },
    { identifier: "bookofsaints01budg", title: "The book of the saints of the Ethiopian church", mediatype: "texts" },
    { identifier: "unrelated", title: "Egyptian Book of the Dead", mediatype: "texts" },
    { identifier: "audio", title: "Book of the Saints of the Ethiopian Church", mediatype: "audio" },
  ];
  const picked = pickArchiveItems(docs, "The Book of the Saints of the Ethiopian Church ");
  assert.deepEqual(picked.map((d) => d.identifier), ["bookofsaints01budg", "bookofsaints02budg"]);
});

test("pickDjvuText finds the OCR text file", () => {
  assert.equal(pickDjvuText([{ name: "a.pdf" }, { name: "a_djvu.txt" }]), "a_djvu.txt");
  assert.equal(pickDjvuText([{ name: "a.pdf" }]), null);
});

test("validateManifest catches bad hashes and missing licenses", () => {
  const m: Manifest = {
    version: 1,
    generatedAt: "",
    entries: [{ id: "x", title: "X", kind: "scripture", format: "usfm-zip", license: "", retrievedAt: "",
      files: [{ name: "f", url: "http://x", sha256: "nope", bytes: 0 }] }],
  };
  assert.throws(() => validateManifest(m), (e: Error) =>
    /missing license/.test(e.message) && /bad sha256/.test(e.message) && /non-https/.test(e.message));
});
