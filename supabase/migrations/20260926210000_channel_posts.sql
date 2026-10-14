-- The daily post to the Telegram channel: one row per Addis Ababa day. The
-- route claims the day before posting, so however often it is called (cron,
-- a retry, anyone who finds the URL) the channel gets at most one post a day.
create table if not exists channel_posts (
  day     int primary key,
  figure  text not null,
  at      timestamptz not null default now()
);
alter table channel_posts enable row level security;

create or replace function claim_channel_day(p_day int, p_figure text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into channel_posts (day, figure) values (p_day, p_figure) on conflict (day) do nothing;
  return found;
end;
$$;

-- If the post itself fails, give the day back so the next call can retry.
create or replace function release_channel_day(p_day int)
returns void
language sql
security definer
set search_path = public
as $$ delete from channel_posts where day = p_day; $$;

revoke all on function claim_channel_day(int, text) from public, anon, authenticated;
revoke all on function release_channel_day(int) from public, anon, authenticated;
