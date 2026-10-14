-- Plain daily counts for the owner's numbers page (/stats): how many stories
-- were asked for, which struggles and people they found, how many were
-- crisis answers. Only names and numbers — never anything a person wrote.
create table if not exists daily_counts (
  day   int  not null,
  name  text not null,
  n     int  not null default 0,
  primary key (day, name)
);
alter table daily_counts enable row level security;

create or replace function bump_counts(p_day int, p_names text[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_counts (day, name, n)
  select distinct p_day, x, 1 from unnest(p_names) as x where length(x) between 1 and 64
  on conflict (day, name) do update set n = daily_counts.n + 1;
$$;

revoke all on function bump_counts(int, text[]) from public, anon, authenticated;
grant execute on function bump_counts(int, text[]) to service_role;
