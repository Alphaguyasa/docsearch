-- People who asked the bot (/daily) for the story of the day in their private
-- chat. Only the chat number and language are kept — never anything they
-- wrote — and /stop deletes the row.
create table if not exists bot_subscribers (
  chat_id   bigint primary key,
  lang      text not null default 'en' check (lang in ('en', 'am')),
  last_day  int not null default 0,
  at        timestamptz not null default now()
);
alter table bot_subscribers enable row level security;

-- Hands out up to p_limit subscribers who haven't had day p_day yet, marking
-- them as sent in the same statement, so two callers never message the same
-- person twice.
create or replace function claim_daily_subscribers(p_day int, p_limit int)
returns table (chat_id bigint, lang text)
language sql
security definer
set search_path = public
as $$
  update bot_subscribers s set last_day = p_day
  where s.chat_id in (
    select b.chat_id from bot_subscribers b
    where b.last_day < p_day
    order by b.chat_id
    limit p_limit
    for update skip locked
  )
  returning s.chat_id, s.lang;
$$;

revoke all on function claim_daily_subscribers(int, int) from public, anon, authenticated;
grant execute on function claim_daily_subscribers(int, int) to service_role;
