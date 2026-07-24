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
export function middleware(req: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (supplied === password) return NextResponse.next();
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
