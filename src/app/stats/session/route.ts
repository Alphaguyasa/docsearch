import { NextResponse, type NextRequest } from "next/server";

import {
  STATS_COOKIE,
  STATS_KEY_MAX,
  statsCookieAttributes,
  statsKeyOk,
  statsToken,
} from "@/lib/stats-auth";

/**
 * POST /stats/session — the form on /stats posts here.
 *   key=…      right key: set the cookie and go to /stats; wrong: back with ?wrong=1
 *   forget=1   clear the cookie (sign this browser out)
 *
 * Every answer is a 303 to /stats, so a reload never re-posts the key, and the
 * key itself never appears in a URL.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const to = (wrong: boolean) => {
    const url = new URL("/stats", request.url);
    if (wrong) url.searchParams.set("wrong", "1");
    return NextResponse.redirect(url, 303);
  };

  // A few hundred bytes is plenty for one form field. Look at the declared
  // length first, then at what actually arrived, before parsing anything.
  const limit = STATS_KEY_MAX + 64;
  if (Number(request.headers.get("content-length") ?? 0) > limit) return to(true);
  const body = await request.text();
  if (body.length > limit) return to(true);
  const form = new URLSearchParams(body);

  if (form.get("forget") === "1") {
    const res = to(false);
    res.cookies.set(STATS_COOKIE, "", statsCookieAttributes(0));
    return res;
  }

  const key = process.env.STATS_KEY;
  const given = form.get("key")?.trim();
  if (!key || !statsKeyOk(given, key)) return to(true);

  const res = to(false);
  res.cookies.set(STATS_COOKIE, await statsToken(key), statsCookieAttributes());
  return res;
}
