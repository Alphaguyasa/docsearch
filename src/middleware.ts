import { NextResponse, type NextRequest } from "next/server";

/**
 * Opt-in HTTP Basic auth gate for a public deployment.
 *
 * If APP_PASSWORD is set, every request must present Basic credentials whose
 * password matches it (any username). If it is unset, the app is open — for
 * local development, or when it sits behind platform-level access protection.
 *
 * This is a lightweight single-user lock so a public URL doesn't expose the
 * upload/delete/search endpoints (which cost embedding and LLM tokens) to
 * anyone. It is not a multi-user auth system.
 */
/**
 * Constant-time string compare. A plain `===` bails at the first differing
 * byte, so response latency leaks how much of a guessed password is correct
 * and makes the secret recoverable one character at a time.
 */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  // Always walk the full expected length so the loop count doesn't vary with
  // the supplied value; the length mismatch is folded into the same result.
  let diff = av.length ^ bv.length;
  for (let i = 0; i < bv.length; i++) {
    diff |= (av[i] ?? 0) ^ bv[i];
  }
  return diff === 0;
}

export function middleware(req: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // Malformed header — fall through to the challenge.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="DocSearch", charset="UTF-8"' },
  });
}

export const config = {
  // Gate everything except Next internals and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
