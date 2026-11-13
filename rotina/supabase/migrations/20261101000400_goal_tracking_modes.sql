-- One Meta / Checklist block, two explicit modes; existing data is retained.
alter table public.activities add column goal_tracking_mode text not null default 'checklist'
  check(goal_tracking_mode in ('quantity','checklist'));
-- Existing textual definitions take precedence; old numeric definitions reopen as quantity.
update public.activities set goal_tracking_mode='quantity'
where type='checklistGoal' and checklist_items='[]'::jsonb
  and exists(select 1 from public.goals g where g.activity_id=activities.id and g.user_id=activities.user_id);
grant insert(goal_tracking_mode),update(goal_tracking_mode) on public.activities to authenticated;

alter table public.daily_plan_items add column goal_tracking_mode_snapshot text check(goal_tracking_mode_snapshot in ('quantity','checklist'));

-- Explicit definitions preserve the contract through 00300, adding only tracking mode.
-- CREATE OR REPLACE preserves ownership, existing ACLs and trigger dependencies.
CREATE OR REPLACE FUNCTION public.save_activity_aggregate(p_activity jsonb, p_relations jsonb DEFAULT '{}'::jsonb, p_expected_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare u uuid := auth.uid(); a uuid; prior public.activities; incoming public.activities; j jsonb; k text; exists_prior boolean;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_activity) is distinct from 'object' or jsonb_typeof(p_relations) is distinct from 'object' then raise exception 'Invalid aggregate payload' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_activity) loop
    if k not in ('id','name','description','area_id','status','type','default_importance','duration_mode','duration_minutes','min_duration_minutes','ideal_duration_minutes','goal_tracking_mode') then
      raise exception 'Unknown or protected activity field: %', k using errcode = '22023';
    end if;
  end loop;
  for k in select jsonb_object_keys(p_relations) loop
    if k not in ('reminder_config','commitment_config','planning_context','fixed_schedules','goals','recurrence_rules','time_windows') then raise exception 'Unknown relation field' using errcode = '22023'; end if;
  end loop;
  for k in select unnest(array['duration_minutes','min_duration_minutes','ideal_duration_minutes']) loop
    if p_activity->k is not null and p_activity->k <> 'null'::jsonb then
      if jsonb_typeof(p_activity->k) <> 'number' then raise exception 'Expected an integer JSON number' using errcode = '22023'; end if;
      if (p_activity->>k)::numeric <> trunc((p_activity->>k)::numeric) or (p_activity->>k)::numeric not between -2147483648 and 2147483647 then
        raise exception 'Fractional or out-of-range integer' using errcode = '22023';
      end if;
    end if;
  end loop;
  a := coalesce((p_activity->>'id')::uuid, gen_random_uuid());
  select * into prior from public.activities where id = a and user_id = u for update;
  exists_prior := found;
  if (exists_prior and (p_expected_revision is null or p_expected_revision <> prior.revision)) or (not exists_prior and p_expected_revision is not null) then
    raise sqlstate 'PT409' using message = 'Stale or unavailable activity revision';
  end if;
  j := jsonb_build_object('status','active','duration_mode','unknown','default_importance','important') || p_activity
    || jsonb_build_object('id',a,'user_id',u,'name',btrim(p_activity->>'name'),'description',nullif(btrim(p_activity->>'description'),''));
  select * into incoming from jsonb_populate_record(null::public.activities,j);
  if not exists_prior then
    if incoming.status <> 'active' then raise exception 'New activities must be active' using errcode = '23514'; end if;
    insert into public.activities(id,user_id,name,description,area_id,status,type,default_importance,duration_mode,duration_minutes,min_duration_minutes,ideal_duration_minutes,goal_tracking_mode)
      values(a,u,incoming.name,incoming.description,incoming.area_id,incoming.status,incoming.type,incoming.default_importance,incoming.duration_mode,incoming.duration_minutes,incoming.min_duration_minutes,incoming.ideal_duration_minutes,coalesce(p_activity->>'goal_tracking_mode',prior.goal_tracking_mode,'checklist'));
  else
    update public.activities set name=incoming.name, description=incoming.description, area_id=incoming.area_id,status=incoming.status,type=incoming.type,
      default_importance=incoming.default_importance,duration_mode=incoming.duration_mode,duration_minutes=incoming.duration_minutes,min_duration_minutes=incoming.min_duration_minutes,ideal_duration_minutes=incoming.ideal_duration_minutes,goal_tracking_mode=coalesce(p_activity->>'goal_tracking_mode',prior.goal_tracking_mode,'checklist')
      where id=a and user_id=u;
  end if;
  -- A mesma ordem de substituição da B.1, agora sem chamar helpers privados.
  declare
    t text; relation text; payload jsonb; rows jsonb; item jsonb; ids uuid[];
    j jsonb; key text; col record; v uuid; cols text; updates text; matched integer;
  begin
    foreach t in array array['time_windows','recurrence_rules','goals','fixed_schedules','reminder_configs','commitment_configs','planning_contexts'] loop
      relation := case t when 'reminder_configs' then 'reminder_config' when 'commitment_configs' then 'commitment_config' when 'planning_contexts' then 'planning_context' else t end;
      if t in ('reminder_configs','commitment_configs','planning_contexts') then
        payload := p_relations->relation;
        if payload is null or payload = 'null'::jsonb or (t = 'planning_contexts' and jsonb_strip_nulls(payload) = '{}'::jsonb) then
          execute format('delete from public.%I where user_id = $1 and activity_id = $2',t) using u,a;
          continue;
        end if;
        rows := jsonb_build_array(payload);
      else
        rows := coalesce(p_relations->relation,'[]'::jsonb);
        if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Invalid relation array' using errcode = '22023'; end if;
      end if;
      ids := array[]::uuid[];
      for item in select value from jsonb_array_elements(rows) loop
        payload := item;
          if t not in ('reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','time_windows')
            or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid child payload' using errcode = '22023'; end if;
          for key in select jsonb_object_keys(payload) loop
            if key in ('user_id','activity_id','created_at','updated_at') or not exists (
              select 1 from pg_attribute where attrelid = to_regclass(format('public.%I',t)) and attname = key and attnum > 0 and not attisdropped
            ) then raise exception 'Unknown or protected child field: %', key using errcode = '22023'; end if;
          end loop;
          j := jsonb_build_object('enabled',true,'sort_position',0) || payload;
          -- Não permitir que json -> integer arredonde 30.5 silenciosamente.
          for col in select attname from pg_attribute where attrelid = to_regclass(format('public.%I',t)) and atttypid in ('int4'::regtype,'int2'::regtype) and attnum > 0 loop
            if j ? col.attname then if j->col.attname <> 'null'::jsonb then
                if jsonb_typeof(j->col.attname) <> 'number' then raise exception 'Expected an integer JSON number' using errcode = '22023'; end if;
                if (j->>col.attname)::numeric <> trunc((j->>col.attname)::numeric) or (j->>col.attname)::numeric not between -2147483648 and 2147483647 then
                  raise exception 'Fractional or out-of-range integer' using errcode = '22023';
                end if;
              end if; end if;
          end loop;
          if t in ('reminder_configs','commitment_configs','planning_contexts') then key := 'activity_id'; v := a;
          else key := 'id'; v := coalesce((payload->>'id')::uuid, gen_random_uuid()); end if;
          j := j || jsonb_build_object(key,v,'activity_id',a,'user_id',u,'created_at',clock_timestamp(),'updated_at',clock_timestamp());
          select string_agg(format('%I',attname),', ' order by attnum),
            string_agg(format('%1$I = excluded.%1$I',attname),', ' order by attnum) filter (where attname not in ('id','activity_id','user_id','created_at','updated_at'))
            into cols, updates from pg_attribute where attrelid = to_regclass(format('public.%I',t)) and attnum > 0 and not attisdropped;
          execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1)
            on conflict (%3$I) do update set %4$s where %1$I.user_id = excluded.user_id and %1$I.activity_id = excluded.activity_id',t,cols,key,updates)
            using j;
          get diagnostics matched = row_count;
          if matched <> 1 then raise exception 'Child ID belongs to another aggregate' using errcode = '23514'; end if;

        if v = any(ids) then raise exception 'Duplicate child ID' using errcode = '22023'; end if;
        ids := array_append(ids,v);
      end loop;
      if t not in ('reminder_configs','commitment_configs','planning_contexts') then
        execute format('delete from public.%I where user_id = $1 and activity_id = $2 and not (id = any($3))',t) using u,a,ids;
      end if;
    end loop;
  end;
  -- Validação imediata da RPC, além das constraints diferidas no COMMIT.
  declare k text; r integer; c integer; p integer; f integer; g integer; q integer; w integer;
  begin
    select type into k from public.activities where id = a and user_id = u for update;
    if not found then return null; end if; -- Remoção administrativa do mestre/cascata.
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
      or (k not in ('variableActivity','checklistGoal') and g > 0)
      or (k not in ('reminder','commitment') and q > 0)
      or (k <> 'variableActivity' and w > 0) then
      raise exception 'Invalid aggregate for activity type %', k using errcode = '23514';
    end if;
    if exists (select 1 from public.time_windows where activity_id = a and user_id = u
      and (effect <> 'preferred' or kind not in ('weekdays','timeRange') or recurrence_rule_id is not null)) then
      raise exception 'Only unlinked preferences are enabled in this version' using errcode = '23514';
    end if;
  end;
  declare result jsonb;
  begin
select jsonb_build_object('activity',to_jsonb(x),
    'reminder_config',(select to_jsonb(r) from public.reminder_configs r where r.activity_id = x.id and r.user_id = x.user_id),
    'commitment_config',(select to_jsonb(c) from public.commitment_configs c where c.activity_id = x.id and c.user_id = x.user_id),
    'planning_context',(select to_jsonb(p) from public.planning_contexts p where p.activity_id = x.id and p.user_id = x.user_id),
    'fixed_schedules',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_position,s.id) from public.fixed_schedules s where s.activity_id = x.id and s.user_id = x.user_id),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_position,g.id) from public.goals g where g.activity_id = x.id and g.user_id = x.user_id),'[]'::jsonb),
    'recurrence_rules',coalesce((select jsonb_agg(to_jsonb(q) order by q.sort_position,q.id) from public.recurrence_rules q where q.activity_id = x.id and q.user_id = x.user_id),'[]'::jsonb),
    'time_windows',coalesce((select jsonb_agg(to_jsonb(w) order by w.sort_position,w.id) from public.time_windows w where w.activity_id = x.id and w.user_id = x.user_id),'[]'::jsonb))
  into result
  from public.activities x where x.id = a and x.user_id = (select auth.uid());
    return result;
  end;
end $function$;

CREATE OR REPLACE FUNCTION routine_private.guard_daily_plan_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare total bigint; selected_count integer; all_subs boolean:=true; all_checks boolean:=true; direct_completion boolean:=false; a public.activities;
begin
  if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Invalid owner' using errcode='42501';end if;
  if tg_op='INSERT' or new.planned_date is distinct from old.planned_date then
    -- Serialize empty-day insertion as well as subsequent ordering operations.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||new.planned_date::text,0));
    select coalesce(max(sort_order)+1,0),coalesce(bool_or(manual_order),false) into new.sort_order,new.manual_order
      from public.daily_plan_items where user_id=new.user_id and planned_date=new.planned_date and id<>new.id;
  end if;
  if tg_op='INSERT' then
    select * into a from public.activities where id=new.activity_id and user_id=new.user_id and status='active' for share;
    if not found then raise exception 'Activity unavailable for planning' using errcode='23503';end if;
    if new.subitem_snapshot is null and exists(select 1 from public.activity_subitems where user_id=new.user_id and root_activity_id=new.activity_id) then raise exception 'Configure subitems before planning' using errcode='23514';end if;
    new.activity_type_snapshot:=a.type;new.goal_tracking_mode_snapshot:=case when a.type='checklistGoal' then a.goal_tracking_mode else null end;
    if a.type='checklistGoal' then new.activity_name_snapshot:=a.name;end if;
    if a.type='checklistGoal' and a.goal_tracking_mode='checklist' then
      select coalesce(jsonb_agg(value||jsonb_build_object('completedAt',null) order by ordinality),'[]'::jsonb) into new.checklist_snapshot
        from jsonb_array_elements(a.checklist_items) with ordinality;
    else new.checklist_snapshot:=null;end if;
    new.completed_at:=null;new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
  else
    if new.goal_tracking_mode_snapshot is distinct from old.goal_tracking_mode_snapshot or new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.activity_id is distinct from old.activity_id or new.created_at is distinct from old.created_at
      or new.activity_type_snapshot is distinct from old.activity_type_snapshot or new.activity_name_snapshot is distinct from old.activity_name_snapshot then raise exception 'Plan identity is immutable' using errcode='23514';end if;
    if new.planned_date is distinct from old.planned_date and (old.completed_at is not null or new.completed_at is not null) then raise exception 'Completed plans cannot be rescheduled' using errcode='23514';end if;
    direct_completion:=new.completed_at is distinct from old.completed_at and new.subitem_snapshot is not distinct from old.subitem_snapshot and new.checklist_snapshot is not distinct from old.checklist_snapshot;
    if new.completed_at is not null then new.completed_at:=coalesce(old.completed_at,clock_timestamp());end if;
    new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
    if direct_completion and new.checklist_snapshot is not null then
      select jsonb_agg(value||jsonb_build_object('completedAt',to_jsonb(new.completed_at)) order by ordinality) into new.checklist_snapshot from jsonb_array_elements(new.checklist_snapshot) with ordinality;
      if old.checklist_snapshot='[]'::jsonb then new.checklist_snapshot:='[]';end if;
    end if;
    if direct_completion and new.subitem_snapshot is not null then
      select jsonb_agg(case when (value->>'selected')::boolean then value||jsonb_build_object('completedAt',to_jsonb(new.completed_at)) else value end order by ordinality)
        into new.subitem_snapshot from jsonb_array_elements(new.subitem_snapshot) with ordinality;
    end if;
  end if;
  if new.subitem_snapshot is not null then
    new.subitem_snapshot:=routine_private.normalize_plan_subitems(new.subitem_snapshot);
    select coalesce(sum((value->>'plannedMinutes')::bigint),0),count(*) filter(where (value->>'selected')::boolean),coalesce(bool_and(value->'completedAt'<>'null'::jsonb) filter(where (value->>'selected')::boolean),true)
      into total,selected_count,all_subs from jsonb_array_elements(new.subitem_snapshot) where value->>'parentId' is null;
    if total>2147483647 then raise exception 'Duration overflow' using errcode='23514';end if;
    new.planned_duration_minutes:=total;
  else selected_count:=0;end if;
  if new.checklist_snapshot is not null and jsonb_array_length(new.checklist_snapshot)>0 then
    select bool_and(value->>'completedAt' is not null) into all_checks from jsonb_array_elements(new.checklist_snapshot);
  end if;
  if selected_count>0 or coalesce(jsonb_array_length(new.checklist_snapshot),0)>0 then
    new.completed_at:=case when all_subs and all_checks then coalesce(new.completed_at,clock_timestamp()) else null end;
  end if;
  return new;
end $function$;
