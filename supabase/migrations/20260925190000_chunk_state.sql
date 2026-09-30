-- Applied to not-alone-scripture on 2026-09-25.
-- Per-document chunk state for resumable ingestion: which chunk indexes exist,
-- whether their content still matches the local build, and whether they have
-- an embedding. md5 keeps the payload small (no content round-trip).
create or replace function chunk_state(doc uuid)
returns table (chunk_index int, content_md5 text, embedded boolean)
language sql stable set search_path = public as $$
  select c.chunk_index, md5(c.content), c.embedding is not null
  from chunks c where c.document_id = doc order by c.chunk_index;
$$;
revoke execute on function chunk_state(uuid) from anon, authenticated;
