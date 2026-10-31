/**
 * Per-chat share of the site's search limit, for the Telegram bot.
 *
 * WHY: the site-wide limiter (take_search_slot, 3 a minute for Voyage's free
 * tier) has no per-person share, so one chat sending message after message
 * could leave everyone else with "busy". Each chat may start CHAT_SEARCHES
 * searches per CHAT_WINDOW_MS; the rest of the site's slots stay for others.
 *
 * PRIVACY: only the chat number and the times of its last few searches are
 * kept, in memory, for one window; never what was written. Each server
 * instance has its own map, so this is a fair share, not a hard guarantee.
 *
 * No imports, so it can be unit-tested without the environment.
 */
export const CHAT_SEARCHES = 2;
export const CHAT_WINDOW_MS = 3 * 60_000;
/** Bound on chats tracked at once, so a flood of new chats cannot grow memory without end. */
const MAX_CHATS = 10_000;

export interface ChatLimiterOptions {
  max?: number;
  windowMs?: number;
  maxChats?: number;
  now?: () => number;
}

export class ChatLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxChats: number;
  private readonly now: () => number;
  /** Chat → start times of its searches inside the window, oldest first. */
  private readonly seen = new Map<number, number[]>();

  constructor(options: ChatLimiterOptions = {}) {
    this.max = options.max ?? CHAT_SEARCHES;
    this.windowMs = options.windowMs ?? CHAT_WINDOW_MS;
    this.maxChats = options.maxChats ?? MAX_CHATS;
    this.now = options.now ?? Date.now;
  }

  /** True, and counted, when this chat may search now; false when it has used its share. */
  take(chatId: number): boolean {
    const now = this.now();
    const recent = (this.seen.get(chatId) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.seen.set(chatId, recent);
      return false;
    }
    recent.push(now);
    // Re-insert so the Map's order stays least-recently-used first.
    this.seen.delete(chatId);
    this.seen.set(chatId, recent);
    if (this.seen.size > this.maxChats) this.prune(now);
    return true;
  }

  /** Chats tracked right now (for tests). */
  get size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    for (const [id, times] of this.seen) {
      if (times.every((t) => now - t >= this.windowMs)) this.seen.delete(id);
    }
    // Still full of live chats: forget the least recently used. At worst they get one extra search.
    for (const id of this.seen.keys()) {
      if (this.seen.size <= this.maxChats) break;
      this.seen.delete(id);
    }
  }
}
