-- Belt and braces: the site talks to the database only with the service role.
-- These functions run as the caller (so RLS already hides every row from the
-- public key), but the public key has no reason to call them at all.
-- Postgres grants EXECUTE to PUBLIC by default, so revoke that too; the
-- service role keeps its own explicit grant.
revoke execute on function match_chunks from public, anon, authenticated;
revoke execute on function keyword_chunks from public, anon, authenticated;
revoke execute on function chunk_state from public, anon, authenticated;
revoke execute on function remaining_chunks from public, anon, authenticated;
