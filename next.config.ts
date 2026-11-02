import type { NextConfig } from "next";

import { contentSecurityPolicy } from "./src/lib/csp";

// Baseline security headers applied to every response.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Report-only for now (ROADMAP 44): the browser logs what the policy would
  // block and blocks nothing, so a missed source cannot break a page. Enforce it
  // once production shows no violations. Scripts and styles need 'unsafe-inline'
  // because Next streams inline bootstrap scripts (no nonces here) and the JSON-LD
  // block is inline. Everything the site loads (fonts, paintings, the service
  // worker, /api) is same-origin.
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
];

const nextConfig: NextConfig = {
  // No page uses next/image, so the optimizer endpoint (/_next/image) only adds
  // attack surface: a critical RCE (GHSA-2464-fhr4-w9xw) lived there. With
  // this set, Next answers 404 on it.
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The worker must never be served stale, or a fix could take days to reach phones.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
