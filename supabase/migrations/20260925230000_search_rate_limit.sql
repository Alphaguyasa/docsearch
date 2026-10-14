-- Site-wide search rate limit (see take_search_slot). Voyage's free tier allows
-- 3 embedding requests per minute for the whole app, so the limit must be
-- global across serverless instances — hence a shared Postgres table.
create table if not exists search_hits (
  id bigserial primary key,
  at timestamptz not null default now()
);
create index if not exists search_hits_at_idx on search_hits (at);
alter table search_hits enable row level security;

create or replace function take_search_slot(max_per_minute int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(4242001);
  delete from search_hits where at < now() - interval '10 minutes';
  select count(*) into used from search_hits where at > now() - interval '1 minute';
  if used >= max_per_minute then
    return false;
  end if;
  insert into search_hits default values;
  return true;
end;
$$;

revoke all on function take_search_slot(int) from public, anon, authenticated;
