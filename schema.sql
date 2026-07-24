-- DocSearch — initial schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- NOTE ON DIMENSIONS: vector(1024) matches voyage-3.
-- If you switch embedding models, change every 1024 below to match:
--   voyage-3            -> 1024
--   voyage-3-lite       -> 512
--   text-embedding-3-small (OpenAI) -> 1536
-- The column and the match_chunks function must agree, or inserts will fail.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector;
create extension if not exists pgcrypto;   -- for gen_random_uuid()


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  filename    text        not null,
  byte_size   bigint,
  page_count  int,
  -- Phase 6 adds browser uploads; these are here from the start so you don't
  -- need a migration later.
  status      text        not null default 'complete'
                check (status in ('pending', 'processing', 'complete', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);

-- Idempotent ingestion: same file + same size = already loaded.
create unique index if not exists documents_filename_size_idx
  on documents (filename, byte_size);


create table if not exists chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  content      text not null,
  page_number  int,
  chunk_index  int  not null,
  token_count  int,
  embedding    vector(1024),
  tsv          tsvector generated always as (to_tsvector('english', content)) stored,
  created_at   timestamptz not null default now()
);

create unique index if not exists chunks_doc_index_idx
  on chunks (document_id, chunk_index);


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- HNSW for vector similarity. Cosine distance (<=>) — must match the operator
-- class used in match_chunks below.
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);

-- GIN for keyword / full-text search.
create index if not exists chunks_tsv_idx
  on chunks using gin (tsv);

create index if not exists chunks_document_id_idx
  on chunks (document_id);


-- ---------------------------------------------------------------------------
-- Search functions
-- ---------------------------------------------------------------------------

-- Vector search. Returns cosine similarity in 0..1 (higher is better).
create or replace function match_chunks (
  query_embedding vector(1024),
  match_count     int default 20
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  page_number int,
  similarity  float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.page_number,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;


-- Keyword search, so the whole hybrid query is one round trip per mode.
create or replace function keyword_chunks (
  query_text  text,
  match_count int default 20
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  page_number int,
  rank        float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.page_number,
    ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) as rank
  from chunks c
  where c.tsv @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Single-user project accessed only from the server with the service role key,
-- which bypasses RLS. RLS is enabled anyway with no permissive policies, so
-- that if the anon key ever leaks into client code, it reads nothing.
-- Add real per-user policies when you add auth.

alter table documents enable row level security;
alter table chunks    enable row level security;


-- ---------------------------------------------------------------------------
-- Sanity checks — run these after ingestion
-- ---------------------------------------------------------------------------
-- select count(*) from documents;
-- select count(*) from chunks;
-- select count(*) from chunks where embedding is null;        -- expect 0
-- select avg(token_count), min(token_count), max(token_count) from chunks;
-- select content from chunks order by random() limit 5;       -- read these
