/**
 * Read a request body with a size cap, before anything parses it.
 *
 * `request.json()` and `request.text()` buffer whatever arrives (Vercel lets
 * up to 4.5 MB through), and only then would a zod `.max()` notice. These
 * routes take a few hundred bytes, so the body is read chunk by chunk and the
 * read stops as soon as the cap is passed. The declared Content-Length is
 * checked first, so an honest oversized request is refused without reading it.
 */

/** Byte caps per route. Each is many times the largest valid body. */
export const BODY_LIMITS = {
  /** A question is at most 1000 characters; Ethiopic is 3 bytes each in UTF-8. */
  search: 16 * 1024,
  /** A yes/no, a language, and two lists of at most 5 ids. */
  feedback: 4 * 1024,
  /**
   * A Telegram update: up to 4096 characters of text plus entities, a quoted
   * reply and the sender. Generous, because a refused update is never answered.
   */
  telegram: 256 * 1024,
} as const;

export type CappedBody =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" };

export async function readCapped(request: Request, maxBytes: number): Promise<CappedBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      // Content-Length can be missing (chunked) or wrong; stop reading either way.
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

/** The body parsed as JSON, or why it could not be: too large, or not JSON. */
export async function readJsonCapped(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too_large" | "not_json" }> {
  const body = await readCapped(request, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) };
  } catch {
    return { ok: false, reason: "not_json" };
  }
}
