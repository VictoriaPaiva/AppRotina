-- JSON é transporte da RPC, nunca uma coluna config persistida.
create function routine_private.json_integer(v jsonb) returns integer
language plpgsql immutable set search_path = pg_catalog as $$
declare n numeric;
begin
  if v is null or v = 'null'::jsonb then return null; end if;
  if jsonb_typeof(v) <> 'number' then raise exception 'Expected an integer JSON number' using errcode = '22023'; end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) or n < -2147483648 or n > 2147483647 then
    raise exception 'Fractional or out-of-range integer' using errcode = '22023';
  end if;
  return n::integer;
end $$;

create function routine_private.put_child(t text, a uuid, u uuid, payload jsonb) returns uuid
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare j jsonb; key text; col record; v uuid; cols text; updates text; matched integer;
begin
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
    if j ? col.attname then perform routine_private.json_integer(j->col.attname); end if;
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
  return v;
end $$;
create function routine_private.replace_children(t text, a uuid, u uuid, payload jsonb) returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare row_data jsonb; ids uuid[] := array[]::uuid[]; v uuid;
begin
  if t not in ('fixed_schedules','goals','recurrence_rules','time_windows') or jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'Invalid relation array' using errcode = '22023';
  end if;
  for row_data in select value from jsonb_array_elements(payload) loop
    v := routine_private.put_child(t,a,u,row_data);
    if v = any(ids) then raise exception 'Duplicate child ID' using errcode = '22023'; end if;
    ids := array_append(ids,v);
  end loop;
  execute format('delete from public.%I where user_id = $1 and activity_id = $2 and not (id = any($3))',t) using u,a,ids;
end $$;
create function routine_private.replace_config(t text, a uuid, u uuid, payload jsonb) returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if t not in ('reminder_configs','commitment_configs','planning_contexts') then raise exception 'Invalid config table' using errcode = '22023'; end if;
  if payload is null or payload = 'null'::jsonb or (t = 'planning_contexts' and jsonb_strip_nulls(payload) = '{}'::jsonb) then
    execute format('delete from public.%I where user_id = $1 and activity_id = $2',t) using u,a;
  else perform routine_private.put_child(t,a,u,payload); end if;
end $$;
create function routine_private.read_aggregate(a uuid) returns jsonb
language sql security invoker set search_path = pg_catalog, public as $$
  select jsonb_build_object('activity',to_jsonb(x),
    'reminder_config',(select to_jsonb(r) from public.reminder_configs r where r.activity_id = x.id and r.user_id = x.user_id),
    'commitment_config',(select to_jsonb(c) from public.commitment_configs c where c.activity_id = x.id and c.user_id = x.user_id),
    'planning_context',(select to_jsonb(p) from public.planning_contexts p where p.activity_id = x.id and p.user_id = x.user_id),
    'fixed_schedules',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_position,s.id) from public.fixed_schedules s where s.activity_id = x.id and s.user_id = x.user_id),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_position,g.id) from public.goals g where g.activity_id = x.id and g.user_id = x.user_id),'[]'::jsonb),
    'recurrence_rules',coalesce((select jsonb_agg(to_jsonb(q) order by q.sort_position,q.id) from public.recurrence_rules q where q.activity_id = x.id and q.user_id = x.user_id),'[]'::jsonb),
    'time_windows',coalesce((select jsonb_agg(to_jsonb(w) order by w.sort_position,w.id) from public.time_windows w where w.activity_id = x.id and w.user_id = x.user_id),'[]'::jsonb))
  from public.activities x where x.id = a and x.user_id = (select auth.uid())
$$;

create function public.save_activity_aggregate(p_activity jsonb, p_relations jsonb default '{}'::jsonb, p_expected_revision integer default null) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare u uuid := auth.uid(); a uuid; prior public.activities; incoming public.activities; j jsonb; k text; exists_prior boolean;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_activity) is distinct from 'object' or jsonb_typeof(p_relations) is distinct from 'object' then raise exception 'Invalid aggregate payload' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_activity) loop
    if k not in ('id','name','description','area_id','status','type','default_importance','duration_mode','duration_minutes','min_duration_minutes','ideal_duration_minutes') then
      raise exception 'Unknown or protected activity field: %', k using errcode = '22023';
    end if;
  end loop;
  for k in select jsonb_object_keys(p_relations) loop
    if k not in ('reminder_config','commitment_config','planning_context','fixed_schedules','goals','recurrence_rules','time_windows') then raise exception 'Unknown relation field' using errcode = '22023'; end if;
  end loop;
  for k in select unnest(array['duration_minutes','min_duration_minutes','ideal_duration_minutes']) loop
    perform routine_private.json_integer(p_activity->k);
  end loop;
  a := coalesce((p_activity->>'id')::uuid, gen_random_uuid());
  select * into prior from public.activities where id = a and user_id = u for update;
  exists_prior := found;
  if (exists_prior and (p_expected_revision is null or p_expected_revision <> prior.revision)) or (not exists_prior and p_expected_revision is not null) then
    raise exception 'Stale or unavailable activity revision' using errcode = '40001';
  end if;
  j := jsonb_build_object('status','active','duration_mode','unknown','default_importance','important') || p_activity
    || jsonb_build_object('id',a,'user_id',u,'name',btrim(p_activity->>'name'),'description',nullif(btrim(p_activity->>'description'),''));
  select * into incoming from jsonb_populate_record(null::public.activities,j);
  if not exists_prior then
    if incoming.status <> 'active' then raise exception 'New activities must be active' using errcode = '23514'; end if;
    insert into public.activities(id,user_id,name,description,area_id,status,type,default_importance,duration_mode,duration_minutes,min_duration_minutes,ideal_duration_minutes)
      values(a,u,incoming.name,incoming.description,incoming.area_id,incoming.status,incoming.type,incoming.default_importance,incoming.duration_mode,incoming.duration_minutes,incoming.min_duration_minutes,incoming.ideal_duration_minutes);
  else
    update public.activities set name=incoming.name, description=incoming.description, area_id=incoming.area_id,status=incoming.status,type=incoming.type,
      default_importance=incoming.default_importance,duration_mode=incoming.duration_mode,duration_minutes=incoming.duration_minutes,min_duration_minutes=incoming.min_duration_minutes,ideal_duration_minutes=incoming.ideal_duration_minutes
      where id=a and user_id=u;
  end if;
  perform routine_private.replace_children('time_windows',a,u,coalesce(p_relations->'time_windows','[]'::jsonb));
  perform routine_private.replace_children('recurrence_rules',a,u,coalesce(p_relations->'recurrence_rules','[]'::jsonb));
  perform routine_private.replace_children('goals',a,u,coalesce(p_relations->'goals','[]'::jsonb));
  perform routine_private.replace_children('fixed_schedules',a,u,coalesce(p_relations->'fixed_schedules','[]'::jsonb));
  perform routine_private.replace_config('reminder_configs',a,u,p_relations->'reminder_config');
  perform routine_private.replace_config('commitment_configs',a,u,p_relations->'commitment_config');
  perform routine_private.replace_config('planning_contexts',a,u,p_relations->'planning_context');
  perform routine_private.assert_activity(a,u);
  return routine_private.read_aggregate(a);
end $$;
revoke all on all functions in schema routine_private from public, anon;
grant execute on all functions in schema routine_private to authenticated;
revoke all on function public.save_activity_aggregate(jsonb,jsonb,integer) from public, anon;
grant execute on function public.save_activity_aggregate(jsonb,jsonb,integer) to authenticated;
