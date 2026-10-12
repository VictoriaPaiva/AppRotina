-- Integridade entre tabelas, auditoria e revision (sem SECURITY DEFINER).
create function routine_private.stamp_row() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at
      or (to_jsonb(new)->'id') is distinct from (to_jsonb(old)->'id')
      or (to_jsonb(new)->'activity_id') is distinct from (to_jsonb(old)->'activity_id') then
      raise exception 'Identity, ownership and creation timestamp are immutable' using errcode = '23514';
    end if;
  else new.created_at := clock_timestamp(); end if;
  new.updated_at := clock_timestamp();
  if tg_table_name = 'activities' then
    if tg_op = 'INSERT' then
      if new.status <> 'active' then raise exception 'New activities must be active' using errcode = '23514'; end if;
      new.revision := 1;
    else
      if old.revision = 2147483647 then raise exception 'Revision limit reached' using errcode = '22003'; end if;
      new.revision := old.revision + 1;
    end if;
    if tg_op = 'INSERT' or new.area_id is distinct from old.area_id then
      perform 1 from public.areas where id = new.area_id and user_id = new.user_id and active for share;
      if not found then raise exception 'A new area must be active and owned by the user' using errcode = '23503'; end if;
    end if;
  end if;
  return new;
end $$;

create function routine_private.lock_parent() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare a uuid; u uuid;
begin
  if tg_op = 'DELETE' then a := old.activity_id; u := old.user_id;
  else a := new.activity_id; u := new.user_id; end if;
  perform 1 from public.activities where id = a and user_id = u for update;
  if not found and tg_op <> 'DELETE' then
    raise exception 'Parent activity unavailable' using errcode = '23503';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create function routine_private.touch_parent() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare a uuid; u uuid;
begin
  if tg_op = 'DELETE' then a := old.activity_id; u := old.user_id;
  else a := new.activity_id; u := new.user_id; end if;
  -- Atualizar o pai dispara somente stamp_row/validação, nunca este trigger de filha.
  update public.activities set updated_at = clock_timestamp() where id = a and user_id = u;
  return null;
end $$;

create function routine_private.assert_activity(a uuid, u uuid) returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare k text; r integer; c integer; p integer; f integer; g integer; q integer; w integer;
begin
  select type into k from public.activities where id = a and user_id = u for update;
  if not found then return; end if; -- Remoção administrativa do mestre/cascata.
  select count(*) into r from public.reminder_configs where activity_id = a and user_id = u;
  select count(*) into c from public.commitment_configs where activity_id = a and user_id = u;
  select count(*) into p from public.planning_contexts where activity_id = a and user_id = u;
  select count(*) into f from public.fixed_schedules where activity_id = a and user_id = u;
  select count(*) into g from public.goals where activity_id = a and user_id = u;
  select count(*) into q from public.recurrence_rules where activity_id = a and user_id = u;
  select count(*) into w from public.time_windows where activity_id = a and user_id = u;
  if r <> (case when k = 'reminder' then 1 else 0 end)
    or c <> (case when k = 'commitment' then 1 else 0 end)
    or (p > 0 and k not in ('commitment','fixedActivity','variableActivity'))
    or (k = 'fixedActivity' and f = 0) or (k <> 'fixedActivity' and f > 0)
    or (k = 'checklistGoal' and g = 0) or (k not in ('variableActivity','checklistGoal') and g > 0)
    or (k not in ('reminder','commitment') and q > 0)
    or (k <> 'variableActivity' and w > 0) then
    raise exception 'Invalid aggregate for activity type %', k using errcode = '23514';
  end if;
  if exists (select 1 from public.time_windows where activity_id = a and user_id = u
    and (effect <> 'preferred' or kind not in ('weekdays','timeRange') or recurrence_rule_id is not null)) then
    raise exception 'Only unlinked preferences are enabled in this version' using errcode = '23514';
  end if;
end $$;
create function routine_private.validate_aggregate() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'activities' then
    if tg_op <> 'DELETE' then perform routine_private.assert_activity(new.id, new.user_id); end if;
  else
    if tg_op <> 'INSERT' then perform routine_private.assert_activity(old.activity_id, old.user_id); end if;
    if tg_op <> 'DELETE' then perform routine_private.assert_activity(new.activity_id, new.user_id); end if;
  end if;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['areas','activities','reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','time_windows'] loop
    execute format('create trigger a_stamp before insert or update on public.%I for each row execute function routine_private.stamp_row()', t);
    if t <> 'areas' then
      execute format('create constraint trigger aggregate_valid after insert or update or delete on public.%I deferrable initially deferred for each row execute function routine_private.validate_aggregate()', t);
    end if;
    if t not in ('areas','activities') then
      execute format('create trigger b_lock_parent before insert or update or delete on public.%I for each row execute function routine_private.lock_parent()', t);
      execute format('create trigger c_touch_parent after insert or update or delete on public.%I for each row execute function routine_private.touch_parent()', t);
    end if;
  end loop;
end $$;
revoke all on all functions in schema routine_private from public, anon;
grant execute on all functions in schema routine_private to authenticated;
