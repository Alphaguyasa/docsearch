/**
 * The image optimizer is off: no page uses next/image, and /_next/image is
 * where the critical Next advisory GHSA-2464-fhr4-w9xw lived (2026-10-25).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import nextConfig from "../next.config";
import { contentSecurityPolicy } from "../src/lib/csp";

test("the image optimizer endpoint is turned off", () => {
  assert.equal(nextConfig.images?.unoptimized, true);
});

test("no page imports next/image, which would need the optimizer", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    assert.doesNotMatch(readFileSync(path.join("src", f), "utf8"), /from "next\/image"/, `${f} imports next/image`);
  }
});

// Next 16 builds and serves with Turbopack by default. A bundler flag in the
// scripts is either noise (--turbopack) or a silent switch back (--webpack).
test("dev and build use Next's default bundler", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(scripts.dev, "next dev");
  assert.equal(scripts.build, "next build");
});

// ROADMAP 44: a CSP, report-only until production shows no violations.
test("every page gets the report-only Content-Security-Policy", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((r) => r.source === "/:path*");
  const csp = all?.headers.find((h) => h.key === "Content-Security-Policy-Report-Only")?.value;
  assert.ok(csp, "the catch-all rule sends the CSP");
  assert.equal(csp, contentSecurityPolicy(false));
});

test("the production policy allows only same-origin loads and no eval", () => {
  const directives = new Map(
    contentSecurityPolicy(false).split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values] as const;
    }),
  );
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("connect-src"), ["'self'"], "the story stream and feedback are same-origin");
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  for (const [name, values] of directives) {
    assert.ok(!values.includes("'unsafe-eval'"), `${name} allows eval in production`);
    assert.ok(!values.some((v) => v.startsWith("http")), `${name} names another host: ${values.join(" ")}`);
    assert.ok(!values.includes("*"), `${name} allows any host`);
  }
});

test("dev mode adds only what React's tooling and hot reload need", () => {
  const dev = contentSecurityPolicy(true);
  assert.match(dev, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(dev, /connect-src 'self' ws:/);
});
