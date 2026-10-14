-- The 40-day journey in the bot (/journey): which day each chat is on, or
-- null for the plain story of the day. The claim now returns it too.
alter table bot_subscribers add column if not exists journey_day int
  check (journey_day between 1 and 40);

drop function if exists claim_daily_subscribers(int, int);
create function claim_daily_subscribers(p_day int, p_limit int)
returns table (chat_id bigint, lang text, journey_day int)
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
  returning s.chat_id, s.lang, s.journey_day;
$$;

revoke all on function claim_daily_subscribers(int, int) from public, anon, authenticated;
grant execute on function claim_daily_subscribers(int, int) to service_role;
