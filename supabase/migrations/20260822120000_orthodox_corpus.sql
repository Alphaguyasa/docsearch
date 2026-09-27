-- Orthodox corpus: work provenance on documents, citable references on chunks.
--
-- WHY: the previous corpus was research papers, where "title, page 7" is a
-- complete citation and every document carries the same authority. Neither is
-- true of this one.
--
--  * A passage from the canons of an Ecumenical Council and a passage from one
--    desert elder's saying are both "documents" to the old schema. They are not
--    the same kind of claim, and an answer that cites them identically has
--    misled the reader about what the Church actually holds.
--
--  * "What does each tradition say" is a first-class question here. Answering it
--    requires knowing, per chunk, which communion and which Church a text
--    belongs to. That has to be filterable and groupable in SQL, not inferred
--    from a filename afterwards.
--
--  * "Genesis 1:1" is the citation an Orthodox reader can check. "lxx-brenton
--    p.412" is not — there are no pages; it came from a zip of verse lines.
--
-- Safe to run on the existing database: every column is added nullable, and the
-- research-paper documents already loaded keep working (they simply have no
-- work metadata, and the filters treat that as "unclassified").

-- ---------------------------------------------------------------------------
-- documents: which work this is, and whose it is
-- ---------------------------------------------------------------------------

alter table documents
  add column if not exists work_id          text,
  add column if not exists author           text,
  add column if not exists tradition        text,
  add column if not exists lineages         text[],
  add column if not exists category         text,
  add column if not exists century          int,
  add column if not exists translation_year int,
  add column if not exists translator       text,
  add column if not exists notes            text;

-- Mirrors src/lib/corpus/types.ts. Enforced here as well as in TypeScript
-- because ingestion is not the only thing that will ever write this table.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_tradition_check') then
    alter table documents add constraint documents_tradition_check
      check (tradition is null or tradition in ('eastern', 'oriental', 'both'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'documents_category_check') then
    alter table documents add constraint documents_category_check
      check (category is null or category in (
        'scripture', 'deuterocanon', 'patristic', 'ascetic', 'liturgical',
        'canon-law', 'council', 'hagiography', 'history'
      ));
  end if;
end $$;

-- One row per catalogued work. Re-ingesting a work replaces it rather than
-- silently doubling every passage in it — which would also double its weight in
-- every answer, quietly overrepresenting whichever book was loaded twice.
create unique index if not exists documents_work_id_idx
  on documents (work_id) where work_id is not null;

create index if not exists documents_tradition_idx on documents (tradition);
create index if not exists documents_category_idx  on documents (category);

-- ---------------------------------------------------------------------------
-- chunks: the reference a reader can actually look up
-- ---------------------------------------------------------------------------

alter table chunks
  -- Human-readable locator, rendered by the ingester from whatever structure
  -- the source had: "Genesis 1:1-14", "Homily XXXIII on Matthew", "Canon VI of
  -- Nicaea". Shown in citations instead of a page number when present.
  add column if not exists reference text,
  -- For scripture only: the book, so "what does the Gospel of John say" can be
  -- answered without a text match on the reference string.
  add column if not exists book      text;

create index if not exists chunks_book_idx on chunks (book) where book is not null;

-- ---------------------------------------------------------------------------
-- Search functions, with tradition/category/work filtering
-- ---------------------------------------------------------------------------
--
-- These REPLACE match_chunks/keyword_chunks rather than sitting beside them.
-- Two nearly-identical retrieval paths is exactly how an eval harness ends up
-- measuring a query the application never runs, so there is one of each.
--
-- Every filter is null-means-no-filter, so an unfiltered call behaves exactly
-- as the old function did. The join to documents is what makes filtering
-- possible at all; it also returns the metadata the caller previously fetched
-- in a second round trip.

drop function if exists match_chunks(vector, int);
drop function if exists keyword_chunks(text, int);

create or replace function match_chunks (
  query_embedding    vector(1024),
  match_count        int    default 20,
  filter_traditions  text[] default null,
  filter_categories  text[] default null,
  filter_work_ids    text[] default null
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  page_number int,
  reference   text,
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
    c.reference,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where c.embedding is not null
    -- A work marked 'both' belongs to either side, so a one-sided query must
    -- still see it: filtering Oriental questions down to Oriental-only texts
    -- would hide St Athanasius from the Coptic Church that claims him.
    and (filter_traditions is null or d.tradition = any(filter_traditions) or d.tradition = 'both')
    and (filter_categories is null or d.category  = any(filter_categories))
    and (filter_work_ids   is null or d.work_id   = any(filter_work_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function keyword_chunks (
  query_text         text,
  match_count        int    default 20,
  filter_traditions  text[] default null,
  filter_categories  text[] default null,
  filter_work_ids    text[] default null
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  page_number int,
  reference   text,
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
    c.reference,
    ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) as rank
  from chunks c
  join documents d on d.id = c.document_id
  where c.tsv @@ websearch_to_tsquery('english', query_text)
    and (filter_traditions is null or d.tradition = any(filter_traditions) or d.tradition = 'both')
    and (filter_categories is null or d.category  = any(filter_categories))
    and (filter_work_ids   is null or d.work_id   = any(filter_work_ids))
  order by rank desc
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Corpus overview, for the UI and for sanity checks
-- ---------------------------------------------------------------------------
-- What is actually loaded, by tradition and category. The site tells users
-- which books it can answer from; that claim should come from the database
-- rather than from the catalog, so it stays true when a fetch has failed.

create or replace view corpus_overview as
  select
    d.tradition,
    d.category,
    count(distinct d.id) as works,
    count(c.id)          as chunks
  from documents d
  left join chunks c on c.document_id = d.id
  where d.work_id is not null
  group by d.tradition, d.category;
