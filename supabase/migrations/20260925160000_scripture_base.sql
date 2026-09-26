-- Not Alone — base schema (from schema.sql) + scripture additions (docs/PIVOT.md)
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  filename    text        not null,
  byte_size   bigint,
  page_count  int,
  status      text        not null default 'complete'
                check (status in ('pending','processing','complete','failed')),
  error       text,
  source_id   text unique,
  license     text,
  source_url  text,
  kind        text check (kind in ('scripture','tradition')),
  created_at  timestamptz not null default now()
);
create unique index if not exists documents_filename_size_idx on documents (filename, byte_size);

create table if not exists chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  content       text not null,
  page_number   int,
  chunk_index   int  not null,
  token_count   int,
  embedding     vector(1024),
  tsv           tsvector generated always as (to_tsvector('english', content)) stored,
  ref           text,
  book          text,
  chapter_start int,
  verse_start   int,
  verse_end     int,
  traditions    text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create unique index if not exists chunks_doc_index_idx on chunks (document_id, chunk_index);
create index if not exists chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_tsv_idx on chunks using gin (tsv);
create index if not exists chunks_document_id_idx on chunks (document_id);
create index if not exists chunks_traditions_idx on chunks using gin (traditions);
create index if not exists chunks_book_idx on chunks (book, chapter_start, verse_start);

create table if not exists figures (
  id          text primary key,
  name        text not null,
  kind        text not null check (kind in ('scripture','tradition')),
  sins        text[] not null,
  summary     text not null,
  traditions  text[] not null,
  note        text
);
create index if not exists figures_sins_idx on figures using gin (sins);

create table if not exists figure_passages (
  figure_id  text not null references figures(id) on delete cascade,
  role       text not null check (role in ('fall','restoration','context')),
  ref        text not null,
  source_id  text not null,
  primary key (figure_id, ref)
);

create or replace function match_chunks (
  query_embedding   vector(1024),
  match_count       int default 20,
  filter_traditions text[] default null
)
returns table (id uuid, document_id uuid, content text, page_number int,
               ref text, traditions text[], similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, c.page_number, c.ref, c.traditions,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.embedding is not null
    and (filter_traditions is null or c.traditions && filter_traditions)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function keyword_chunks (
  query_text        text,
  match_count       int default 20,
  filter_traditions text[] default null
)
returns table (id uuid, document_id uuid, content text, page_number int,
               ref text, traditions text[], rank float)
language sql stable as $$
  select c.id, c.document_id, c.content, c.page_number, c.ref, c.traditions,
         ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) as rank
  from chunks c
  where c.tsv @@ websearch_to_tsquery('english', query_text)
    and (filter_traditions is null or c.traditions && filter_traditions)
  order by rank desc
  limit match_count;
$$;

-- Chunks still to embed — the resumable ingestion reads this.
create or replace function remaining_chunks() returns bigint
language sql stable as $$ select count(*) from chunks where embedding is null $$;

alter table documents       enable row level security;
alter table chunks          enable row level security;
alter table figures         enable row level security;
alter table figure_passages enable row level security;
