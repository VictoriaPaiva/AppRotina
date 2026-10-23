-- MVP manual: independent of occurrences, goals and progress candidates.
create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null,
  planned_date date not null check (routine_private.valid_date(planned_date)),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint daily_plan_items_owner_activity_fkey foreign key (user_id, activity_id)
    references public.activities(user_id, id) on delete restrict,
  constraint daily_plan_items_activity_date_key unique (user_id, activity_id, planned_date)
);
create index daily_plan_items_owner_date_idx on public.daily_plan_items(user_id, planned_date);

create function routine_private.guard_daily_plan_item() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    -- Serialize admission against deactivation; existing plans do not depend on status.
    perform 1 from public.activities
      where id = new.activity_id and user_id = new.user_id and status = 'active' for share;
    if not found then
      raise exception 'Activity unavailable for planning' using errcode = '23503';
    end if;
    new.completed_at := null;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.activity_id is distinct from old.activity_id or new.created_at is distinct from old.created_at then
      raise exception 'Plan identity is immutable' using errcode = '23514';
    end if;
    if new.planned_date is distinct from old.planned_date
      and (old.completed_at is not null or new.completed_at is not null) then
      raise exception 'Completed plans cannot be rescheduled' using errcode = '23514';
    end if;
    if new.completed_at is not null then
      new.completed_at := coalesce(old.completed_at, clock_timestamp());
    end if;
    -- Preserve full microsecond precision and make every accepted write a new snapshot.
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function routine_private.guard_daily_plan_item() from public, anon, authenticated;
create trigger guard_daily_plan_item before insert or update on public.daily_plan_items
  for each row execute function routine_private.guard_daily_plan_item();

alter table public.daily_plan_items enable row level security;
create policy daily_plan_items_select on public.daily_plan_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy daily_plan_items_insert on public.daily_plan_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy daily_plan_items_update on public.daily_plan_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.daily_plan_items from public, anon, authenticated;
grant select on public.daily_plan_items to authenticated;
grant insert (id, user_id, activity_id, planned_date) on public.daily_plan_items to authenticated;
grant update (planned_date, completed_at) on public.daily_plan_items to authenticated;
