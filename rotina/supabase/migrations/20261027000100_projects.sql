create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 100000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, id)
);
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint project_tasks_owner_project_fkey foreign key (user_id, project_id)
    references public.projects(user_id, id) on delete cascade
);
create index projects_owner_created_idx on public.projects(user_id, created_at, id);
create index project_tasks_owner_project_idx on public.project_tasks(user_id, project_id, created_at, id);

create function routine_private.guard_project_record() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    if tg_table_name = 'project_tasks' then new.completed_at := null; end if;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Project record identity is immutable' using errcode = '23514';
    end if;
    if tg_table_name = 'project_tasks' then
      if new.project_id is distinct from old.project_id then
        raise exception 'Task project is immutable' using errcode = '23514';
      end if;
      if new.completed_at is not null then
        new.completed_at := coalesce(old.completed_at, clock_timestamp());
      end if;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function routine_private.guard_project_record() from public, anon, authenticated;
create trigger guard_project before insert or update on public.projects
  for each row execute function routine_private.guard_project_record();
create trigger guard_project_task before insert or update on public.project_tasks
  for each row execute function routine_private.guard_project_record();

alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
create policy projects_select on public.projects for select to authenticated using (user_id = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated with check (user_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy project_tasks_select on public.project_tasks for select to authenticated using (user_id = (select auth.uid()));
create policy project_tasks_insert on public.project_tasks for insert to authenticated with check (user_id = (select auth.uid()));
create policy project_tasks_update on public.project_tasks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.projects, public.project_tasks from public, anon, authenticated;
grant select on public.projects, public.project_tasks to authenticated;
grant insert (id, user_id, title, description) on public.projects to authenticated;
grant update (title, description) on public.projects to authenticated;
grant insert (id, user_id, project_id, title) on public.project_tasks to authenticated;
grant update (title, completed_at) on public.project_tasks to authenticated;
