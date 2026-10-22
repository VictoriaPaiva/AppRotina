-- LOCAL CANDIDATE ONLY. Not in migrations; never db push this directory.
BEGIN;
CREATE ROLE routine_progress_executor NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT
 NOCREATEROLE NOCREATEDB NOREPLICATION;
-- PREFLIGHT TEMPORARY PRIVILEGES BEGIN
-- PostgreSQL 17: transfer needs SET; following ACL/trigger DDL needs owner privileges.
-- Only the trusted migration caller receives this temporary membership.
GRANT routine_progress_executor TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
GRANT CREATE ON SCHEMA public, routine_private TO routine_progress_executor;
-- PREFLIGHT TEMPORARY PRIVILEGES END
create table public.user_temporal_preferences (
  user_id uuid primary key references auth.users(id)
    on update restrict on delete restrict,
  timezone text not null check (btrim(timezone) = timezone and timezone <> ''),
  revision bigint not null default 1 check (revision >= 1),
  confirmed_at timestamptz not null default clock_timestamp()
    check (isfinite(confirmed_at)),
  created_at timestamptz not null default clock_timestamp()
    check (isfinite(created_at)),
  updated_at timestamptz not null default clock_timestamp()
    check (isfinite(updated_at))
);

create table public.progress_attempts (
  user_id uuid not null references auth.users(id)
    on update restrict on delete restrict,
  attempt_id uuid not null,
  command_kind text not null check (command_kind in ('record','void')),
  activity_id uuid not null,
  target_log_id uuid,
  expected_activity_revision integer,
  expected_date date,
  expected_temporal_revision bigint,
  result_log_id uuid not null,
  result_void_id uuid,
  accepted_at timestamptz not null check (isfinite(accepted_at)),
  created_at timestamptz not null default clock_timestamp()
    check (isfinite(created_at)),
  primary key (user_id, attempt_id),
  unique (user_id, activity_id, attempt_id),
  foreign key (user_id, activity_id)
    references public.activities(user_id,id) on update restrict on delete restrict,
  check (
    (command_kind = 'record' and target_log_id is null
      and expected_activity_revision is not null and expected_activity_revision >= 1
      and expected_date is not null and isfinite(expected_date)
      and expected_date between date '0001-01-01' and date '9999-12-31'
      and expected_temporal_revision is not null and expected_temporal_revision >= 1
      and result_void_id is null)
    or
    (command_kind = 'void' and target_log_id is not null
      and target_log_id = result_log_id and result_void_id is not null
      and expected_activity_revision is null and expected_date is null
      and expected_temporal_revision is null)
  )
);
create index progress_attempts_activity_idx
  on public.progress_attempts(user_id,activity_id);

create table public.activity_progress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  activity_id uuid not null,
  attempt_id uuid not null,
  performed_on date not null check (isfinite(performed_on)
    and performed_on between date '0001-01-01' and date '9999-12-31'),
  timezone_at_recording text not null check (btrim(timezone_at_recording) <> ''),
  temporal_revision bigint not null check (temporal_revision >= 1),
  accepted_at timestamptz not null check (isfinite(accepted_at)),
  created_at timestamptz not null default clock_timestamp()
    check (isfinite(created_at)),
  metric text not null default 'count' check (metric = 'count'),
  value integer not null default 1 check (value = 1),
  unit text not null default 'execution' check (unit = 'execution'),
  event_kind text not null default 'measurement' check (event_kind = 'measurement'),
  activity_name_at_recording text not null
    check (btrim(activity_name_at_recording) <> ''),
  activity_type_at_recording text not null
    check (activity_type_at_recording in ('checklistGoal','variableActivity')),
  activity_revision integer not null check (activity_revision >= 1),
  unique (user_id,activity_id,id),
  unique (user_id,attempt_id),
  foreign key (user_id,activity_id)
    references public.activities(user_id,id) on update restrict on delete restrict,
  foreign key (user_id,activity_id,attempt_id)
    references public.progress_attempts(user_id,activity_id,attempt_id)
    on update restrict on delete restrict deferrable initially deferred
);
create index activity_progress_logs_daily_idx
  on public.activity_progress_logs(user_id,performed_on,activity_id,metric,unit);

create table public.activity_goal_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  activity_id uuid not null,
  source_goal_id uuid not null,
  version_no bigint not null check (version_no >= 1),
  activity_revision integer not null check (activity_revision >= 1),
  transition text not null check (transition in ('baseline','upsert','removed')),
  effective_at timestamptz not null check (isfinite(effective_at)),
  created_at timestamptz not null default clock_timestamp()
    check (isfinite(created_at)),
  enabled boolean not null,
  metric text not null check (metric in ('count','duration','quantity')),
  unit text not null check (btrim(unit) <> ''),
  minimum_target numeric not null
    check (minimum_target > 0 and minimum_target <= 9007199254740991),
  ideal_target numeric check (ideal_target >= minimum_target
    and ideal_target <= 9007199254740991),
  period text not null check (period in ('day','week','month')),
  starts_on date not null check (isfinite(starts_on)
    and starts_on between date '0001-01-01' and date '9999-12-31'),
  ends_on date check (ends_on is null or (isfinite(ends_on)
    and ends_on between date '0001-01-01' and date '9999-12-31')),
  check (ends_on is null or ends_on >= starts_on),
  check (
    (metric = 'count' and unit = 'execution'
      and minimum_target = trunc(minimum_target)
      and (ideal_target is null or ideal_target = trunc(ideal_target)))
    or (metric = 'duration' and unit = 'minute'
      and minimum_target = trunc(minimum_target) and minimum_target <= 2147483647
      and (ideal_target is null or
        (ideal_target = trunc(ideal_target) and ideal_target <= 2147483647)))
    or metric = 'quantity'
  ),
  unique (user_id,activity_id,id),
  unique (user_id,source_goal_id,version_no),
  foreign key (user_id,activity_id)
    references public.activities(user_id,id) on update restrict on delete restrict
);
create index activity_goal_versions_latest_idx
  on public.activity_goal_versions(user_id,activity_id,source_goal_id,version_no desc);

create table public.progress_log_goal_versions (
  user_id uuid not null,
  activity_id uuid not null,
  progress_log_id uuid not null,
  goal_version_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
    check (isfinite(created_at)),
  primary key (user_id,activity_id,progress_log_id,goal_version_id),
  foreign key (user_id,activity_id,progress_log_id)
    references public.activity_progress_logs(user_id,activity_id,id)
    on update restrict on delete restrict,
  foreign key (user_id,activity_id,goal_version_id)
    references public.activity_goal_versions(user_id,activity_id,id)
    on update restrict on delete restrict
);
create index progress_log_goal_versions_goal_idx
  on public.progress_log_goal_versions(user_id,activity_id,goal_version_id);

create table public.activity_progress_voids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  activity_id uuid not null,
  progress_log_id uuid not null,
  winning_attempt_id uuid not null,
  voided_at timestamptz not null check (isfinite(voided_at)),
  created_at timestamptz not null default clock_timestamp()
    check (isfinite(created_at)),
  unique (user_id,activity_id,id),
  unique (user_id,activity_id,progress_log_id,id),
  unique (user_id,progress_log_id),
  unique (user_id,winning_attempt_id),
  foreign key (user_id,activity_id,progress_log_id)
    references public.activity_progress_logs(user_id,activity_id,id)
    on update restrict on delete restrict,
  foreign key (user_id,activity_id,winning_attempt_id)
    references public.progress_attempts(user_id,activity_id,attempt_id)
    on update restrict on delete restrict deferrable initially deferred
);
create index activity_progress_voids_activity_idx
  on public.activity_progress_voids(user_id,activity_id);

alter table public.progress_attempts
  add foreign key (user_id,activity_id,target_log_id)
    references public.activity_progress_logs(user_id,activity_id,id)
    on update restrict on delete restrict deferrable initially deferred,
  add foreign key (user_id,activity_id,result_log_id)
    references public.activity_progress_logs(user_id,activity_id,id)
    on update restrict on delete restrict deferrable initially deferred,
  add foreign key (user_id,activity_id,result_log_id,result_void_id)
    references public.activity_progress_voids(user_id,activity_id,progress_log_id,id)
    on update restrict on delete restrict deferrable initially deferred;
create index progress_attempts_result_log_idx
  on public.progress_attempts(user_id,activity_id,result_log_id);
create index progress_attempts_result_void_idx
  on public.progress_attempts(user_id,activity_id,result_log_id,result_void_id)
  where result_void_id is not null;

-- Dedicated function owner, never granted to the browser or authenticator.
grant usage on schema public, routine_private, auth to routine_progress_executor;
grant execute on function auth.uid() to routine_progress_executor;
grant select on public.areas, public.activities, public.goals, public.reminder_configs,
 public.commitment_configs, public.planning_contexts, public.fixed_schedules,
 public.recurrence_rules, public.time_windows to routine_progress_executor;
grant update(id) on public.activities to routine_progress_executor;
grant execute on function routine_private.assert_activity(uuid,uuid) to routine_progress_executor;
-- A GRANT on a managed Auth object may only warn when not delegable.
-- Require effective privileges instead of silently installing a broken owner.
DO $$ BEGIN
 IF NOT has_schema_privilege('routine_progress_executor','public','USAGE')
 OR NOT has_schema_privilege('routine_progress_executor','routine_private','USAGE')
 OR NOT has_schema_privilege('routine_progress_executor','auth','USAGE')
 OR NOT has_function_privilege('routine_progress_executor','auth.uid()','EXECUTE')
 OR NOT has_function_privilege('routine_progress_executor','routine_private.assert_activity(uuid,uuid)','EXECUTE') THEN
 RAISE EXCEPTION 'Required executor schema/function grants unavailable' USING ERRCODE='42501';
 END IF;
END $$;
do $$ declare t text; begin
 foreach t in array array['areas','activities','goals','reminder_configs','commitment_configs',
 'planning_contexts','fixed_schedules','recurrence_rules','time_windows'] loop
 execute format('create policy progress_executor_read on public.%I for select to routine_progress_executor using (user_id = (select auth.uid()))',t);
 end loop;
end $$;
create policy progress_executor_lock on public.activities for update to routine_progress_executor
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

do $$ declare t text; begin
 foreach t in array array['user_temporal_preferences','progress_attempts','activity_progress_logs',
 'activity_goal_versions','progress_log_goal_versions','activity_progress_voids'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated,routine_progress_executor',t);
 execute format('grant insert on public.%I to routine_progress_executor',t);
 execute format('create policy owner_read on public.%I for select to authenticated,routine_progress_executor using(user_id=(select auth.uid()))',t);
 execute format('create policy executor_insert on public.%I for insert to routine_progress_executor with check(user_id=(select auth.uid()))',t);
 end loop;
end $$;
grant update(timezone,revision,confirmed_at,updated_at) on public.user_temporal_preferences to routine_progress_executor;
create policy executor_update on public.user_temporal_preferences for update to routine_progress_executor
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create function routine_private.progress_immutable() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 raise exception 'Historical facts are immutable' using errcode='23514';
end $$;
do $$ declare t text; begin
 foreach t in array array['progress_attempts','activity_progress_logs','activity_goal_versions',
 'progress_log_goal_versions','activity_progress_voids'] loop
 execute format('create trigger progress_immutable before update or delete on public.%I for each row execute function routine_private.progress_immutable()',t);
 end loop;
end $$;

create function routine_private.progress_timezone_stamp() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=new.timezone
 and (z.name='UTC' or position('/' in z.name)>0)
 and z.name not like 'posix/%%' and z.name not like 'right/%%') then
 raise exception 'Invalid timezone' using errcode='22023'; end if;
 if tg_op='INSERT' then
 new.revision:=1; new.created_at:=clock_timestamp();
 else
 if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
 raise exception 'Immutable preference identity' using errcode='23514'; end if;
 if new.timezone=old.timezone then return old; end if;
 if old.revision=9223372036854775807 then raise exception 'Revision limit' using errcode='22003'; end if;
 new.revision:=old.revision+1;
 end if;
 new.confirmed_at:=clock_timestamp(); new.updated_at:=new.confirmed_at; return new;
end $$;
create trigger progress_timezone_stamp before insert or update on public.user_temporal_preferences
 for each row execute function routine_private.progress_timezone_stamp();

-- Baseline under installation locks; no inferred timezone and no fake logs.
lock table public.activities,public.goals in share row exclusive mode;
-- FORCE RLS also applies to the non-BYPASS table-owning installer.
-- Only that trusted installer may backfill existing accounts, inside this transaction.
create policy progress_install_backfill on public.activity_goal_versions
 for insert to current_user with check (true);
insert into public.activity_goal_versions(user_id,activity_id,source_goal_id,version_no,
 activity_revision,transition,effective_at,enabled,metric,unit,minimum_target,ideal_target,period,starts_on,ends_on)
 select g.user_id,g.activity_id,g.id,1,a.revision,'baseline',clock_timestamp(),g.enabled,
 g.metric,g.unit,g.minimum_target,g.ideal_target,g.period,g.starts_on,g.ends_on
 from public.goals g join public.activities a on a.user_id=g.user_id and a.id=g.activity_id;
drop policy progress_install_backfill on public.activity_goal_versions;

create function routine_private.finalize_goal_versions(p_user_id uuid,p_activity_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare g public.goals; h public.activity_goal_versions; a public.activities; n bigint;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into a from public.activities where user_id=p_user_id and id=p_activity_id for update;
 if not found then return; end if;
 perform routine_private.assert_activity(p_activity_id,p_user_id);
 for g in select * from public.goals where user_id=p_user_id and activity_id=p_activity_id order by id loop
 select * into h from public.activity_goal_versions where user_id=p_user_id and source_goal_id=g.id order by version_no desc limit 1;
 if found then
 if h.activity_id<>p_activity_id or h.transition='removed' then raise exception 'Goal identity cannot be reused' using errcode='23514'; end if;
 if jsonb_build_array(h.enabled,h.metric,h.unit,h.minimum_target,h.ideal_target,h.period,h.starts_on,h.ends_on)
 =jsonb_build_array(g.enabled,g.metric,g.unit,g.minimum_target,g.ideal_target,g.period,g.starts_on,g.ends_on) then continue; end if;
 n:=h.version_no+1;
 else n:=1; end if;
 insert into public.activity_goal_versions(user_id,activity_id,source_goal_id,version_no,activity_revision,
 transition,effective_at,enabled,metric,unit,minimum_target,ideal_target,period,starts_on,ends_on)
 values(p_user_id,p_activity_id,g.id,n,a.revision,'upsert',clock_timestamp(),g.enabled,g.metric,g.unit,
 g.minimum_target,g.ideal_target,g.period,g.starts_on,g.ends_on);
 end loop;
 for h in select v.* from (select distinct on(source_goal_id) * from public.activity_goal_versions
 where user_id=p_user_id and activity_id=p_activity_id order by source_goal_id,version_no desc) v
 where v.transition<>'removed' and not exists(select 1 from public.goals x where x.user_id=p_user_id and x.activity_id=p_activity_id and x.id=v.source_goal_id)
 loop
 insert into public.activity_goal_versions(user_id,activity_id,source_goal_id,version_no,activity_revision,
 transition,effective_at,enabled,metric,unit,minimum_target,ideal_target,period,starts_on,ends_on)
 values(p_user_id,p_activity_id,h.source_goal_id,h.version_no+1,a.revision,'removed',clock_timestamp(),h.enabled,
 h.metric,h.unit,h.minimum_target,h.ideal_target,h.period,h.starts_on,h.ends_on);
 end loop;
end $$;
alter function routine_private.finalize_goal_versions(uuid,uuid) owner to routine_progress_executor;

create function routine_private.capture_progress_history() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare a uuid; u uuid;
begin
 if tg_table_name='activities' then
 if tg_op='DELETE' then a:=old.id; u:=old.user_id; else a:=new.id;u:=new.user_id;end if;
 else
 if tg_op='DELETE' then a:=old.activity_id;u:=old.user_id;else a:=new.activity_id;u:=new.user_id;end if;
 end if;
 perform routine_private.finalize_goal_versions(u,a); return null;
end $$;
alter function routine_private.capture_progress_history() owner to routine_progress_executor;
create constraint trigger z_progress_history after insert or update or delete on public.activities
 deferrable initially deferred for each row execute function routine_private.capture_progress_history();
create constraint trigger z_progress_history after insert or update or delete on public.goals
 deferrable initially deferred for each row execute function routine_private.capture_progress_history();

create function routine_private.assert_progress_integrity(p_user_id uuid,p_attempt_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare a public.progress_attempts; l public.activity_progress_logs; x public.activity_progress_voids; ids uuid[]; actual uuid[];
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Authentication required' using errcode='42501';end if;
 select * into strict a from public.progress_attempts where user_id=p_user_id and attempt_id=p_attempt_id;
 select * into strict l from public.activity_progress_logs where user_id=p_user_id and activity_id=a.activity_id and id=a.result_log_id;
 if a.command_kind='record' then
 if l.attempt_id<>a.attempt_id or l.accepted_at<>a.accepted_at
 or l.performed_on<>a.expected_date or l.activity_revision<>a.expected_activity_revision
 or l.temporal_revision<>a.expected_temporal_revision then raise exception 'Invalid receipt' using errcode='23514';end if;
 select array_agg(v.id order by v.id) into ids from public.activity_goal_versions v
 where v.user_id=p_user_id and v.activity_id=l.activity_id and v.transition<>'removed' and v.enabled
 and v.metric=l.metric and v.unit=l.unit and v.period='day'
 and v.starts_on<=l.performed_on and (v.ends_on is null or v.ends_on>=l.performed_on)
 -- Historical eligibility follows the accepted aggregate revision, not wall-clock
 -- ordering (clock adjustments/ties must not reinterpret the accepted version).
 and v.activity_revision<=l.activity_revision
 and not exists(select 1 from public.activity_goal_versions newer where newer.user_id=v.user_id and newer.source_goal_id=v.source_goal_id
 and newer.version_no>v.version_no and newer.activity_revision<=l.activity_revision);
 select array_agg(s.goal_version_id order by s.goal_version_id) into actual from public.progress_log_goal_versions s
 where s.user_id=p_user_id and s.activity_id=l.activity_id and s.progress_log_id=l.id;
 if cardinality(coalesce(ids,'{}'::uuid[]))=0 or ids is distinct from actual then raise exception 'Invalid associations' using errcode='23514';end if;
 else
 select * into strict x from public.activity_progress_voids where user_id=p_user_id and activity_id=a.activity_id and id=a.result_void_id;
 if x.progress_log_id<>l.id then raise exception 'Invalid void receipt' using errcode='23514';end if;
 end if;
end $$;
alter function routine_private.assert_progress_integrity(uuid,uuid) owner to routine_progress_executor;
create function routine_private.check_progress_receipt() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare k uuid; a public.progress_attempts; l public.activity_progress_logs;
begin
 if tg_table_schema<>'public' then raise exception 'Unexpected integrity target' using errcode='23514';end if;
 if tg_table_name='progress_attempts' then k:=new.attempt_id;
 elsif tg_table_name='activity_progress_logs' then
 select * into strict a from public.progress_attempts where user_id=new.user_id and attempt_id=new.attempt_id;
 if a.command_kind<>'record' or a.result_log_id<>new.id then
 raise exception 'Log requires its reciprocal record receipt' using errcode='23514';end if;
 k:=new.attempt_id;
 elsif tg_table_name='progress_log_goal_versions' then
 select * into strict l from public.activity_progress_logs where user_id=new.user_id and activity_id=new.activity_id and id=new.progress_log_id;
 k:=l.attempt_id;
 elsif tg_table_name='activity_progress_voids' then
 select * into strict a from public.progress_attempts where user_id=new.user_id and attempt_id=new.winning_attempt_id;
 if a.command_kind<>'void' or a.activity_id<>new.activity_id or a.target_log_id<>new.progress_log_id
 or a.result_log_id<>new.progress_log_id or a.result_void_id<>new.id or a.accepted_at<>new.voided_at then
 raise exception 'Void requires its reciprocal winning receipt' using errcode='23514';end if;
 k:=new.winning_attempt_id;
 else raise exception 'Unexpected integrity target' using errcode='23514';
 end if;
 perform routine_private.assert_progress_integrity(new.user_id,k);return null;
end $$;
alter function routine_private.check_progress_receipt() owner to routine_progress_executor;
create constraint trigger progress_receipt_integrity after insert on public.progress_attempts
 deferrable initially deferred for each row execute function routine_private.check_progress_receipt();
create constraint trigger progress_effect_integrity after insert on public.activity_progress_logs
 deferrable initially deferred for each row execute function routine_private.check_progress_receipt();
create constraint trigger progress_association_integrity after insert on public.progress_log_goal_versions
 deferrable initially deferred for each row execute function routine_private.check_progress_receipt();
create constraint trigger progress_void_integrity after insert on public.activity_progress_voids
 deferrable initially deferred for each row execute function routine_private.check_progress_receipt();


create function public.record_activity_progress(p_attempt_id uuid,p_activity_id uuid,p_expected_activity_revision integer,p_expected_date date,p_expected_temporal_revision bigint) returns table(o_attempt_id uuid,o_log_id uuid,o_performed_on date,o_timezone text,o_voided boolean) language plpgsql volatile security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare
  v_uid uuid := auth.uid();
  v_previous public.progress_attempts%rowtype;
  v_pref public.user_temporal_preferences%rowtype;
  v_activity public.activities%rowtype;
  v_log public.activity_progress_logs%rowtype;
  v_accepted_at timestamptz;
  v_day date;
  v_goal_versions uuid[];
  v_log_id uuid;
begin
  if v_uid is null then
    raise sqlstate '42501' using message = 'Authentication required';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise sqlstate '22023' using message = 'Unsupported transaction context';
  end if;
  if p_attempt_id is null or p_activity_id is null
     or p_expected_activity_revision is null or p_expected_activity_revision < 1
     or p_expected_temporal_revision is null or p_expected_temporal_revision < 1
     or p_expected_date is null or not isfinite(p_expected_date)
     or p_expected_date not between date '0001-01-01' and date '9999-12-31' then
    raise sqlstate '22023' using message = 'Invalid progress command';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    250501, pg_catalog.hashtext(v_uid::text || ':' || p_attempt_id::text));
  select a.* into v_previous from public.progress_attempts a
    where a.user_id = v_uid and a.attempt_id = p_attempt_id;
  if found then
    if v_previous.command_kind is distinct from 'record'
       or v_previous.activity_id is distinct from p_activity_id
       or v_previous.expected_activity_revision
          is distinct from p_expected_activity_revision
       or v_previous.expected_date is distinct from p_expected_date
       or v_previous.expected_temporal_revision
          is distinct from p_expected_temporal_revision then
      raise sqlstate 'PT409' using message = 'attempt-mismatch';
    end if;
    select l.* into strict v_log from public.activity_progress_logs l
      where l.user_id = v_uid and l.activity_id = v_previous.activity_id
        and l.id = v_previous.result_log_id;
    return query select p_attempt_id, v_log.id, v_log.performed_on,
      v_log.timezone_at_recording, exists (
        select 1 from public.activity_progress_voids x
        where x.user_id = v_uid and x.progress_log_id = v_log.id);
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(250502, pg_catalog.hashtext(v_uid::text));
  select p.* into v_pref from public.user_temporal_preferences p
    where p.user_id = v_uid;
  if not found then
    raise sqlstate 'PT409' using message = 'temporal-preference-required';
  end if;
  select a.* into v_activity from public.activities a
    where a.user_id = v_uid and a.id = p_activity_id for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Activity unavailable';
  end if;
  if v_activity.revision <> p_expected_activity_revision then
    raise sqlstate 'PT409' using message = 'activity-changed';
  end if;
  if v_activity.status <> 'active'
     or v_activity.type not in ('checklistGoal','variableActivity') then
    raise sqlstate 'PT409' using message = 'activity-not-eligible';
  end if;
  perform routine_private.finalize_goal_versions(v_uid,p_activity_id);

  -- Captura única, depois de locks/materialização, nunca now()/CURRENT_DATE.
  v_accepted_at := pg_catalog.clock_timestamp();
  v_day := (v_accepted_at at time zone v_pref.timezone)::date;
  if v_pref.revision <> p_expected_temporal_revision
     or v_day <> p_expected_date then
    raise sqlstate 'PT409' using message = 'temporal-context-changed';
  end if;
  select array_agg(g.id order by g.id) into v_goal_versions
  from (
    select distinct on (h.source_goal_id) h.*
    from public.activity_goal_versions h
    where h.user_id = v_uid and h.activity_id = p_activity_id
    order by h.source_goal_id,h.version_no desc
  ) g
  where g.transition <> 'removed' and g.enabled
    and g.metric = 'count' and g.unit = 'execution' and g.period = 'day'
    and g.starts_on <= v_day and (g.ends_on is null or g.ends_on >= v_day);
  if coalesce(cardinality(v_goal_versions),0) = 0 then
    raise sqlstate 'PT409' using message = 'goal-not-eligible';
  end if;

  v_log_id := gen_random_uuid();
  insert into public.progress_attempts (
    user_id,attempt_id,command_kind,activity_id,expected_activity_revision,
    expected_date,expected_temporal_revision,result_log_id,accepted_at
  ) values (
    v_uid,p_attempt_id,'record',p_activity_id,p_expected_activity_revision,
    p_expected_date,p_expected_temporal_revision,v_log_id,v_accepted_at
  );
  insert into public.activity_progress_logs (
    id,user_id,activity_id,attempt_id,performed_on,timezone_at_recording,
    temporal_revision,accepted_at,metric,value,unit,event_kind,
    activity_name_at_recording,activity_type_at_recording,activity_revision
  ) values (
    v_log_id,v_uid,p_activity_id,p_attempt_id,v_day,v_pref.timezone,
    v_pref.revision,v_accepted_at,'count',1,'execution','measurement',
    v_activity.name,v_activity.type,v_activity.revision
  );
  insert into public.progress_log_goal_versions (
    user_id,activity_id,progress_log_id,goal_version_id
  ) select v_uid,p_activity_id,v_log_id,s.id
    from unnest(v_goal_versions) as s(id);
  perform routine_private.assert_progress_integrity(v_uid,p_attempt_id);
  return query select p_attempt_id,v_log_id,v_day,v_pref.timezone,false;
end;
$$;

create function public.void_activity_progress(p_attempt_id uuid,p_progress_log_id uuid) returns table(o_attempt_id uuid,o_log_id uuid,o_void_id uuid,o_performed_on date,o_voided boolean) language plpgsql volatile security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare
  v_uid uuid := auth.uid();
  v_previous public.progress_attempts%rowtype;
  v_log public.activity_progress_logs%rowtype;
  v_void public.activity_progress_voids%rowtype;
  v_activity_id uuid;
  v_void_id uuid;
  v_at timestamptz;
begin
  if v_uid is null then
    raise sqlstate '42501' using message = 'Authentication required';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise sqlstate '22023' using message = 'Unsupported transaction context';
  end if;
  if p_attempt_id is null or p_progress_log_id is null then
    raise sqlstate '22023' using message = 'Invalid void command';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    250501, pg_catalog.hashtext(v_uid::text || ':' || p_attempt_id::text));
  select a.* into v_previous from public.progress_attempts a
    where a.user_id = v_uid and a.attempt_id = p_attempt_id;
  if found then
    if v_previous.command_kind is distinct from 'void'
       or v_previous.target_log_id is distinct from p_progress_log_id then
      raise sqlstate 'PT409' using message = 'attempt-mismatch';
    end if;
    select l.* into strict v_log from public.activity_progress_logs l
      where l.user_id = v_uid and l.id = v_previous.result_log_id;
    return query select p_attempt_id,v_log.id,v_previous.result_void_id,
      v_log.performed_on,true;
    return;
  end if;

  select l.activity_id into v_activity_id from public.activity_progress_logs l
    where l.user_id = v_uid and l.id = p_progress_log_id;
  if not found then
    raise sqlstate 'PT404' using message = 'Measurement unavailable';
  end if;
  perform 1 from public.activities a
    where a.user_id = v_uid and a.id = v_activity_id for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Measurement unavailable';
  end if;
  -- Novo comando SQL após eventual espera pelo pai.
  select l.* into strict v_log from public.activity_progress_logs l
    where l.user_id = v_uid and l.activity_id = v_activity_id
      and l.id = p_progress_log_id;
  select x.* into v_void from public.activity_progress_voids x
    where x.user_id = v_uid and x.progress_log_id = p_progress_log_id;
  if found then
    v_void_id := v_void.id;
    v_at := pg_catalog.clock_timestamp();
  else
    v_void_id := gen_random_uuid();
    v_at := pg_catalog.clock_timestamp();
    insert into public.activity_progress_voids (
      id,user_id,activity_id,progress_log_id,winning_attempt_id,voided_at
    ) values (
      v_void_id,v_uid,v_activity_id,p_progress_log_id,p_attempt_id,v_at
    );
  end if;
  insert into public.progress_attempts (
    user_id,attempt_id,command_kind,activity_id,target_log_id,
    result_log_id,result_void_id,accepted_at
  ) values (
    v_uid,p_attempt_id,'void',v_activity_id,p_progress_log_id,
    p_progress_log_id,v_void_id,v_at
  );
  perform routine_private.assert_progress_integrity(v_uid,p_attempt_id);
  return query select p_attempt_id,p_progress_log_id,v_void_id,
    v_log.performed_on,true;
end;
$$;

create function public.set_progress_timezone(p_timezone text,p_expected_revision bigint) returns table(o_timezone text,o_temporal_revision bigint,o_today date) language plpgsql volatile security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare
  v_uid uuid := auth.uid();
  v_pref public.user_temporal_preferences%rowtype;
  v_at timestamptz;
begin
  if v_uid is null then
    raise sqlstate '42501' using message = 'Authentication required';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise sqlstate '22023' using message = 'Unsupported transaction context';
  end if;
  if p_timezone is null or p_timezone = '' or btrim(p_timezone) <> p_timezone
     or (p_expected_revision is not null and p_expected_revision < 1) then
    raise sqlstate '22023' using message = 'Invalid timezone command';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names z
    where z.name = p_timezone
      and (z.name = 'UTC' or position('/' in z.name) > 0)
      and z.name not like 'posix/%' and z.name not like 'right/%'
  ) then
    raise sqlstate '22023' using message = 'Unsupported timezone';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(250502,pg_catalog.hashtext(v_uid::text));
  select p.* into v_pref from public.user_temporal_preferences p
    where p.user_id = v_uid;
  if not found then
    if p_expected_revision is not null then
      raise sqlstate 'PT409' using message = 'temporal-context-changed';
    end if;
    v_at := pg_catalog.clock_timestamp();
    insert into public.user_temporal_preferences (
      user_id,timezone,revision,confirmed_at,created_at,updated_at
    ) values (v_uid,p_timezone,1,v_at,v_at,v_at)
    returning * into v_pref;
  else
    if p_expected_revision is null or v_pref.revision <> p_expected_revision then
      raise sqlstate 'PT409' using message = 'temporal-context-changed';
    end if;
    if v_pref.timezone <> p_timezone then
      if v_pref.revision = 9223372036854775807 then
        raise sqlstate '22003' using message = 'Temporal revision limit reached';
      end if;
      update public.user_temporal_preferences p
        set timezone = p_timezone
        where p.user_id = v_uid and p.revision = p_expected_revision
        returning p.* into v_pref;
      -- BEFORE UPDATE enforces old.revision+1 and database timestamps.
      if not found then
        raise sqlstate 'PT409' using message = 'temporal-context-changed';
      end if;
    end if;
  end if;
  v_at := pg_catalog.clock_timestamp();
  return query select v_pref.timezone,v_pref.revision,
    (v_at at time zone v_pref.timezone)::date;
end;
$$;
-- Lock down both RPCs and trigger helpers before committing deployment.
create function public.get_progress_context()
returns table(configured boolean,timezone text,temporal_revision bigint,today date)
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp set row_security=on as $$
declare u uuid:=auth.uid();p public.user_temporal_preferences; t timestamptz;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Unsupported transaction context' using errcode='22023';end if;
 perform pg_advisory_xact_lock(250502,hashtext(u::text));
 select * into p from public.user_temporal_preferences where user_id=u;
 if not found then return query select false,null::text,null::bigint,null::date;return;end if;
 t:=clock_timestamp();return query select true,p.timezone,p.revision,(t at time zone p.timezone)::date;
end $$;
alter function public.get_progress_context() owner to routine_progress_executor;
revoke all on function public.get_progress_context() from public,anon,authenticated;
grant execute on function public.get_progress_context() to authenticated;
alter function public.record_activity_progress(uuid,uuid,integer,date,bigint) owner to routine_progress_executor;
alter function public.void_activity_progress(uuid,uuid) owner to routine_progress_executor;
alter function public.set_progress_timezone(text,bigint) owner to routine_progress_executor;
revoke all on function public.record_activity_progress(uuid,uuid,integer,date,bigint),
 public.void_activity_progress(uuid,uuid),public.set_progress_timezone(text,bigint) from public,anon,authenticated;
grant execute on function public.record_activity_progress(uuid,uuid,integer,date,bigint),
 public.void_activity_progress(uuid,uuid),public.set_progress_timezone(text,bigint) to authenticated;
revoke all on function routine_private.finalize_goal_versions(uuid,uuid),
 routine_private.capture_progress_history(),routine_private.assert_progress_integrity(uuid,uuid),
 routine_private.check_progress_receipt(),routine_private.progress_immutable(),
 routine_private.progress_timezone_stamp() from public,anon,authenticated;
-- PREFLIGHT CLEANUP BEGIN
REVOKE CREATE ON SCHEMA public, routine_private FROM routine_progress_executor;
REVOKE routine_progress_executor FROM CURRENT_USER;
-- PostgreSQL may retain its automatic ADMIN-only creator membership.
-- It must not retain SET/INHERIT; the trusted installer already administers roles.
DO $$ BEGIN
 IF has_schema_privilege('routine_progress_executor','public','CREATE')
 OR has_schema_privilege('routine_progress_executor','routine_private','CREATE')
 OR (NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
     AND (pg_has_role(current_user,'routine_progress_executor','SET')
          OR pg_has_role(current_user,'routine_progress_executor','USAGE'))) THEN
 RAISE EXCEPTION 'Deployment privileges were not fully removed' USING ERRCODE='42501';
 END IF;
END $$;
-- PREFLIGHT CLEANUP END
COMMIT;
