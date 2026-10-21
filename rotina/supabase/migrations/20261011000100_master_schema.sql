-- V0.2.3B.1: cadastro mestre; nenhuma ocorrência/progresso ou seed pessoal.
create schema if not exists routine_private;
revoke all on schema routine_private from public, anon;
grant usage on schema routine_private to authenticated;

create function routine_private.valid_days(d smallint[]) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(array_ndims(d) = 1 and array_lower(d, 1) = 1
    and cardinality(d) between 1 and 7 and array_position(d, null) is null
    and d <@ array[1,2,3,4,5,6,7]::smallint[]
    and cardinality(d) = (select count(distinct x) from unnest(d) x)
    and d = (select array_agg(x order by x) from unnest(d) x), false)
$$;
create function routine_private.valid_date(d date) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(d between date '0001-01-01' and date '9999-12-31', false)
$$;
create function routine_private.valid_time(t time) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(t < time '24:00' and extract(second from t) = 0, false)
$$;

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''), active boolean not null default true,
  sort_position integer not null default 0 check (sort_position >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''), description text check (description is null or btrim(description) <> ''),
  area_id uuid not null, status text not null default 'active' check (status in ('active','inactive')),
  type text not null check (type in ('reminder','commitment','fixedActivity','variableActivity','checklistGoal')),
  default_importance text not null check (default_importance in ('required','important','optional')),
  duration_mode text not null default 'unknown' check (duration_mode in ('unknown','fixed','minimumIdeal')),
  duration_minutes integer, min_duration_minutes integer, ideal_duration_minutes integer,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, area_id) references public.areas(user_id, id) on delete restrict,
  constraint activity_duration_shape check (
    (duration_mode = 'unknown' and duration_minutes is null and min_duration_minutes is null and ideal_duration_minutes is null)
    or (duration_mode = 'fixed' and duration_minutes is not null and duration_minutes > 0 and min_duration_minutes is null and ideal_duration_minutes is null)
    or (duration_mode = 'minimumIdeal' and duration_minutes is null and min_duration_minutes is not null and min_duration_minutes > 0
      and ideal_duration_minutes is not null and ideal_duration_minutes >= min_duration_minutes)
  )
);
create table public.reminder_configs (
  activity_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  reference_date date not null check (routine_private.valid_date(reference_date)),
  reminder_time time without time zone check (reminder_time is null or routine_private.valid_time(reminder_time)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, activity_id),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade
);
create table public.commitment_configs (
  activity_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  date date not null check (routine_private.valid_date(date)),
  start_time time without time zone not null check (routine_private.valid_time(start_time)),
  end_time time without time zone not null check (routine_private.valid_time(end_time)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, activity_id), check (end_time > start_time),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade
);
create table public.planning_contexts (
  activity_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  location text check (location is null or btrim(location) <> ''),
  preparation_minutes integer check (preparation_minutes >= 0),
  outbound_minutes integer check (outbound_minutes >= 0), return_minutes integer check (return_minutes >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, activity_id),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade
);
create table public.fixed_schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null, weekdays smallint[] not null check (routine_private.valid_days(weekdays)),
  start_time time without time zone not null check (routine_private.valid_time(start_time)),
  end_time time without time zone not null check (routine_private.valid_time(end_time)), check (end_time > start_time),
  sort_position integer not null default 0 check (sort_position >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, activity_id, id),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade
);
create table public.goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null, enabled boolean not null default true,
  metric text not null check (metric in ('count','duration','quantity')), unit text not null check (btrim(unit) <> ''),
  minimum_target numeric not null check (minimum_target > 0 and minimum_target <= 9007199254740991),
  ideal_target numeric check (ideal_target >= minimum_target and ideal_target <= 9007199254740991),
  period text not null check (period in ('day','week','month')),
  starts_on date not null check (routine_private.valid_date(starts_on)), ends_on date check (ends_on is null or routine_private.valid_date(ends_on)),
  check (ends_on is null or ends_on >= starts_on),
  sort_position integer not null default 0 check (sort_position >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, activity_id, id),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade,
  constraint goal_metric_shape check (
    (metric = 'count' and unit = 'execution' and minimum_target = trunc(minimum_target) and (ideal_target is null or ideal_target = trunc(ideal_target)))
    or (metric = 'duration' and unit = 'minute' and minimum_target = trunc(minimum_target) and minimum_target <= 2147483647
      and (ideal_target is null or (ideal_target = trunc(ideal_target) and ideal_target <= 2147483647)))
    or metric = 'quantity'
  )
);
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null, enabled boolean not null default true, label text check (label is null or btrim(label) <> ''),
  basis text not null check (basis in ('calendar','completion')), pattern text not null check (pattern in ('interval','weekdays','monthDay','monthWeekday')),
  interval_count integer not null check (interval_count > 0), unit text not null check (unit in ('day','week','month')),
  anchor_date date check (anchor_date is null or routine_private.valid_date(anchor_date)),
  weekdays smallint[] check (weekdays is null or routine_private.valid_days(weekdays)),
  day_of_month smallint check (day_of_month between 1 and 31), ordinal smallint check (ordinal in (-1,1,2,3,4,5)),
  weekday smallint check (weekday between 1 and 7), invalid_date_policy text check (invalid_date_policy in ('lastValidDay','skip')),
  starts_on date not null check (routine_private.valid_date(starts_on)), ends_on date check (ends_on is null or routine_private.valid_date(ends_on)),
  check (ends_on is null or ends_on >= starts_on),
  sort_position integer not null default 0 check (sort_position >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, activity_id, id),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade,
  constraint recurrence_shape check (
    ((basis = 'calendar' and anchor_date is not null) or (basis = 'completion' and anchor_date is null and pattern = 'interval' and unit in ('day','month')))
    and ((unit = 'month' and invalid_date_policy is not null) or (unit <> 'month' and invalid_date_policy is null))
    and (
      (pattern = 'interval' and weekdays is null and day_of_month is null and ordinal is null and weekday is null)
      or (basis = 'calendar' and pattern = 'weekdays' and unit = 'week' and weekdays is not null and day_of_month is null and ordinal is null and weekday is null)
      or (basis = 'calendar' and pattern = 'monthDay' and unit = 'month' and weekdays is null and day_of_month is not null and ordinal is null and weekday is null)
      or (basis = 'calendar' and pattern = 'monthWeekday' and unit = 'month' and weekdays is null and day_of_month is null and ordinal is not null and weekday is not null)
    )
  )
);
create table public.time_windows (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null, recurrence_rule_id uuid,
  kind text not null check (kind in ('weekdays','timeRange','fixedStart')), effect text not null check (effect in ('preferred','allowed','forbidden')),
  coverage text not null check (coverage in ('startOnly','wholeActivity')),
  weekdays smallint[] check (weekdays is null or routine_private.valid_days(weekdays)),
  start_time time without time zone check (start_time is null or routine_private.valid_time(start_time)),
  end_time time without time zone check (end_time is null or routine_private.valid_time(end_time)),
  end_day_offset smallint,
  starts_on date not null check (routine_private.valid_date(starts_on)), ends_on date check (ends_on is null or routine_private.valid_date(ends_on)),
  check (ends_on is null or ends_on >= starts_on),
  sort_position integer not null default 0 check (sort_position >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (user_id, activity_id) references public.activities(user_id, id) on delete cascade,
  foreign key (user_id, activity_id, recurrence_rule_id) references public.recurrence_rules(user_id, activity_id, id) on delete restrict,
  constraint time_window_shape check (
    (kind = 'weekdays' and weekdays is not null and start_time is null and end_time is null and end_day_offset is null)
    or (kind = 'fixedStart' and start_time is not null and end_time is null and end_day_offset is null and coverage = 'startOnly')
    or (kind = 'timeRange' and start_time is not null and end_time is not null and end_day_offset is not null
      and ((end_day_offset = 0 and end_time > start_time) or (end_day_offset = 1 and end_time <= start_time)))
  )
);

create index areas_order_idx on public.areas(user_id, sort_position, id);
create index activities_list_idx on public.activities(user_id, updated_at desc, id);
create index activities_area_idx on public.activities(user_id, area_id);
create index activities_type_status_idx on public.activities(user_id, type, status);
create index time_windows_activity_idx on public.time_windows(user_id, activity_id);
create index time_windows_rule_idx on public.time_windows(user_id, activity_id, recurrence_rule_id) where recurrence_rule_id is not null;

-- Policies/grants são definidos nesta mesma migration, não em rollout posterior.
do $$ declare t text; begin
  foreach t in array array['areas','activities','reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','time_windows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    if t not in ('areas','activities') then
      execute format('grant delete on public.%I to authenticated', t);
      execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    end if;
  end loop;
end $$;
grant usage on schema public to authenticated;
revoke all on all functions in schema routine_private from public, anon;
grant execute on function routine_private.valid_days(smallint[]), routine_private.valid_date(date), routine_private.valid_time(time) to authenticated;
