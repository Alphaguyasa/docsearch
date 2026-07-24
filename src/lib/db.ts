/**
 * SERVER-ONLY. Do not import this module into a client component.
 *
 * This client is built with the Supabase service role key, which bypasses
 * Row Level Security and grants full read/write access to the database.
 * Exposing it to the browser would leak full database access.
 */
import { createClient } from "@supabase/supabase-js";

import { config } from "./env";

export const db = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      // No user sessions on the server; don't persist or refresh tokens.
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
