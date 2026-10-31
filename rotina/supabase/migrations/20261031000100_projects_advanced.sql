-- V0.3: additive evolution; existing policies and owner/project boundaries stay intact.
alter table public.projects
  add column progress_mode text not null default 'tasks'
    check (progress_mode in ('tasks','manual','hybrid')),
  add column manual_progress_percent integer not null default 0
    check (manual_progress_percent between 0 and 100);
alter table public.project_tasks
  add column parent_task_id uuid,
  add column progress_stage text not null default 'not_started'
    check (progress_stage in ('not_started','started','early_progress','in_progress','advanced','finishing','completed')),
  add column progress_weight integer not null default 1 check (progress_weight > 0);

-- Backfill without changing historical completion/audit timestamps.
alter table public.project_tasks disable trigger guard_project_task;
update public.project_tasks set progress_stage = 'completed' where completed_at is not null;
alter table public.project_tasks enable trigger guard_project_task;
alter table public.project_tasks
  add constraint project_tasks_owner_project_id_key unique (user_id, project_id, id),
  add constraint project_tasks_parent_fkey foreign key (user_id, project_id, parent_task_id)
    references public.project_tasks(user_id, project_id, id) on delete cascade,
  add constraint project_tasks_no_self_parent check (parent_task_id is distinct from id),
  add constraint project_tasks_completion_stage check ((progress_stage = 'completed') = (completed_at is not null));
create index project_tasks_parent_idx on public.project_tasks(user_id, project_id, parent_task_id);

create or replace function routine_private.guard_project_record() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'project_tasks' then
    -- Serialize task mutations within the project, including child insertion vs leaf edits.
    perform 1 from public.projects where user_id = new.user_id and id = new.project_id for update;
    if tg_op = 'UPDATE' then
      if new.project_id is distinct from old.project_id or new.parent_task_id is distinct from old.parent_task_id then
        raise exception 'Task hierarchy is immutable' using errcode = '23514';
      end if;
      -- Compatibility for existing completion callers; explicit stage takes precedence.
      if new.progress_stage is not distinct from old.progress_stage and new.completed_at is distinct from old.completed_at then
        new.progress_stage := case when new.completed_at is null then 'not_started' else 'completed' end;
      end if;
      if new.progress_stage is distinct from old.progress_stage and exists (
        select 1 from public.project_tasks where user_id = old.user_id and project_id = old.project_id and parent_task_id = old.id
      ) then
        raise exception 'Parent progress is derived from children' using errcode = '23514';
      end if;
    elsif new.parent_task_id is not null then
      -- Parent must already exist: immutable edges can never close a cycle.
      if new.parent_task_id = new.id or not exists (
        select 1 from public.project_tasks where user_id = new.user_id and project_id = new.project_id and id = new.parent_task_id
      ) then
        raise exception 'Invalid task parent' using errcode = '23514';
      end if;
    end if;
    if new.progress_stage = 'completed' then
      if tg_op = 'UPDATE' then new.completed_at := coalesce(old.completed_at, clock_timestamp());
      else new.completed_at := clock_timestamp(); end if;
    else new.completed_at := null;
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp(); new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
      raise exception 'Project record identity is immutable' using errcode = '23514';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function routine_private.guard_project_record() from public, anon, authenticated;
grant insert (progress_mode, manual_progress_percent) on public.projects to authenticated;
grant update (progress_mode, manual_progress_percent) on public.projects to authenticated;
grant insert (parent_task_id, progress_stage, progress_weight) on public.project_tasks to authenticated;
grant update (progress_stage, progress_weight) on public.project_tasks to authenticated;
