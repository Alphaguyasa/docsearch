-- Answers to the home page's fixed example questions, shared by every server
-- instance so a cold start does not spend Gemini quota on them again
-- (src/lib/example-cache.ts). Keys are only those fixed sentences, checked in
-- the app before saving — never anything a reader wrote. Additive: a new
-- table and two functions; nothing existing changes.
create table if not exists example_answers (
  key   text        primary key check (length(key) between 1 and 300),
  body  text        not null check (length(body) <= 200000),
  at    timestamptz not null default now()
);
alter table example_answers enable row level security;

-- The answer for a key, or null when there is none younger than p_max_age seconds.
create or replace function get_example(p_key text, p_max_age int)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select body from example_answers
  where key = p_key and at > now() - make_interval(secs => p_max_age);
$$;

create or replace function put_example(p_key text, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into example_answers (key, body, at) values (p_key, p_body, now())
  on conflict (key) do update set body = excluded.body, at = excluded.at;
$$;

revoke all on function get_example(text, int) from public, anon, authenticated;
revoke all on function put_example(text, text) from public, anon, authenticated;
grant execute on function get_example(text, int) to service_role;
grant execute on function put_example(text, text) to service_role;
