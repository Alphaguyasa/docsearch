/**
 * The site's Content-Security-Policy, sent from next.config.ts (report-only for
 * now; see the comment there). Kept here so a test can read it for dev and prod.
 *
 * One directive per entry. Dev mode also needs eval and a websocket for React's
 * tooling and hot reload.
 */
export function contentSecurityPolicy(dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
