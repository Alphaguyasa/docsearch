/**
 * SERVER-ONLY. Global search rate limit, shared by every serverless instance
 * through Postgres (take_search_slot). Default 3/min matches Voyage's free
 * tier; raise SEARCH_PER_MINUTE after upgrading the Voyage plan.
 *
 * Fails OPEN: if the limiter itself errors (e.g. the function is missing on an
 * older database), the search proceeds and Voyage's own 429 handling applies.
 */
import { db } from "../db";

export const SEARCH_PER_MINUTE = Number(process.env.SEARCH_PER_MINUTE ?? 3);

export const BUSY_MESSAGE =
  "Many people are reading right now. Please wait a minute and try again. / ብዙ ሰዎች እየተጠቀሙ ነው፤ እባክዎ ከአንድ ደቂቃ በኋላ ይሞክሩ።";

export async function takeSearchSlot(): Promise<boolean> {
  const { data, error } = await db.rpc("take_search_slot", { max_per_minute: SEARCH_PER_MINUTE });
  if (error) {
    console.warn(`rate limiter unavailable, allowing request: ${error.message}`);
    return true;
  }
  return data === true;
}
