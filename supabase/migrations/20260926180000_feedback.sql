-- "Was this helpful?" — one row per tap. Deliberately holds nothing a person
-- wrote and nothing that identifies them: only yes/no, which people the story
-- was built around, the struggle tags, the language and the channel.
create table if not exists feedback (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  helpful  boolean not null,
  figures  text[] not null default '{}',
  tags     text[] not null default '{}',
  lang     text not null check (lang in ('en', 'am')),
  channel  text not null check (channel in ('web', 'telegram'))
);
create index if not exists feedback_at_idx on feedback (at);
alter table feedback enable row level security;

-- Writes go only through this function, which caps volume so a flood of taps
-- cannot fill the free-tier database.
create or replace function add_feedback(p_helpful boolean, p_figures text[], p_tags text[], p_lang text, p_channel text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from feedback where at > now() - interval '1 hour') >= 500 then
    return false;
  end if;
  insert into feedback (helpful, figures, tags, lang, channel)
  values (p_helpful, coalesce(p_figures, '{}'), coalesce(p_tags, '{}'), p_lang, p_channel);
  return true;
end;
$$;
revoke all on function add_feedback(boolean, text[], text[], text, text) from public, anon, authenticated;

-- What to read in the Supabase dashboard: how each person's story is landing.
create or replace view feedback_by_figure with (security_invoker = true) as
select f as figure,
       count(*) filter (where helpful) as helpful,
       count(*) filter (where not helpful) as not_helpful,
       round(100.0 * count(*) filter (where helpful) / count(*)) as percent_helpful
from feedback, unnest(figures) as f
group by f
order by count(*) desc;
