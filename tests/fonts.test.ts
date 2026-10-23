/**
 * The site fonts are self-hosted. next/font/google downloads them from Google
 * Fonts during every build, and that download failed CI builds on main
 * ("next/font/google queries have exactly one entry"); these checks keep the
 * build offline and every referenced file present and licensed.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const layout = readFileSync("src/app/layout.tsx", "utf8");

test("no page loads fonts from Google at build time", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    assert.doesNotMatch(readFileSync(path.join("src", f), "utf8"), /from "next\/font\/google"/, `${f} imports next/font/google`);
  }
});

test("every font file the layout names exists and is listed in the fonts README", () => {
  const paths = [...layout.matchAll(/path: "\.\/fonts\/([^"]+)"/g)].map((m) => m[1]);
  assert.equal(paths.length, 9);
  const readme = readFileSync("src/app/fonts/README.md", "utf8");
  for (const p of paths) {
    assert.ok(existsSync(path.join("src/app/fonts", p)), `missing src/app/fonts/${p}`);
    assert.match(p, /\.woff2$/);
  }
  assert.match(readme, /Open Font License/);
  for (const family of ["EB Garamond", "Cormorant Garamond", "Cinzel", "Noto Serif Ethiopic"]) {
    assert.ok(readme.includes(family), `README does not list ${family}`);
  }
});

test("the Ethiopic face is not preloaded on English pages", () => {
  const ethiopic = layout.slice(layout.indexOf("const ethiopic"));
  assert.match(ethiopic.slice(0, ethiopic.indexOf("});")), /preload: false/);
});
