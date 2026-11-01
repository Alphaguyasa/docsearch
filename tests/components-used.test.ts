/**
 * Leftover DocSearch components (a PDF search box, citation targets, an
 * "ingest PDFs" empty state) sat unused for weeks (ROADMAP 41). Every
 * component file and every component it exports must be used somewhere else.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

const COMPONENTS = "src/app/components";
const files = walk("src");
const source = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

test("every component exported from src/app/components is used outside its own file", () => {
  const unused: string[] = [];
  for (const file of files.filter((f) => f.startsWith(COMPONENTS))) {
    const names = [...source.get(file)!.matchAll(/export (?:async )?function (\w+)|export const (\w+)/g)].map(
      (m) => m[1] ?? m[2],
    );
    assert.ok(names.length > 0, `${file} exports nothing`);
    for (const name of names) {
      const used = files.some((f) => f !== file && new RegExp(`\\b${name}\\b`).test(source.get(f)!));
      if (!used) unused.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(unused, []);
});

test("the home page metadata exists in both languages", async () => {
  const { SITE_META } = await import("../src/app/site-meta");
  for (const lang of ["en", "am"] as const) {
    assert.ok(SITE_META[lang].title.length > 0);
    assert.ok(SITE_META[lang].description.length > 0);
  }
  assert.match(SITE_META.am.description, /[ሀ-፿]/, "Amharic description is in Ethiopic script");
  assert.match(source.get("src/app/layout.tsx")!, /export async function generateMetadata/);
  assert.doesNotMatch(source.get("src/app/layout.tsx")!, /export const metadata/);
});
