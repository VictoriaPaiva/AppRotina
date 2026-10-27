-- Manual MVP notes, independent of Activities, Projects and progress.
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null default '' check (char_length(content) <= 100000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index ideas_owner_updated_idx on public.ideas(user_id, updated_at desc, id);

create function routine_private.guard_idea() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Idea identity is immutable' using errcode = '23514';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function routine_private.guard_idea() from public, anon, authenticated;
create trigger guard_idea before insert or update on public.ideas
  for each row execute function routine_private.guard_idea();
alter table public.ideas enable row level security;
create policy ideas_select on public.ideas for select to authenticated
  using (user_id = (select auth.uid()));
create policy ideas_insert on public.ideas for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy ideas_update on public.ideas for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.ideas from public, anon, authenticated;
grant select on public.ideas to authenticated;
grant insert (id, user_id, title, content) on public.ideas to authenticated;
grant update (title, content) on public.ideas to authenticated;
