-- Synchronize only open today/future goal occurrences during the aggregate save.
create function routine_private.plan_definition(p jsonb) returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select jsonb_build_object('name',p->'activity_name_snapshot','type',p->'activity_type_snapshot','mode',p->'goal_tracking_mode_snapshot',
 'checks',(select jsonb_agg(value-'completedAt' order by ordinality) from jsonb_array_elements(nullif(p->'checklist_snapshot','null')) with ordinality),
 'quantity',(select jsonb_agg(value-array['completed','checked'] order by ordinality) from jsonb_array_elements(nullif(p->'quantity_snapshot','null')) with ordinality));
$$;
revoke all on function routine_private.plan_definition(jsonb) from public,anon,authenticated;

create function routine_private.merge_open_activity_plan(p public.daily_plan_items) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.activities;checks jsonb;quantity jsonb;fresh jsonb;n jsonb;o jsonb;executed boolean;mode text;
begin
 select * into a from public.activities where id=p.activity_id and user_id=p.user_id;
 checks:=p.checklist_snapshot;quantity:=p.quantity_snapshot;mode:=p.goal_tracking_mode_snapshot;
 if a.type<>'checklistGoal' then return jsonb_build_object('checks',checks,'quantity',quantity,'mode',mode,'type',p.activity_type_snapshot,'name',p.activity_name_snapshot);end if;
 executed:=exists(select 1 from jsonb_array_elements(checks) where value->>'completedAt' is not null) or exists(select 1 from jsonb_array_elements(quantity) where (value->>'completed')::numeric>0);
 if mode is distinct from a.goal_tracking_mode and executed then
  select jsonb_agg(value||'{"retained":true}' order by ordinality) into checks from jsonb_array_elements(checks) with ordinality;
  select jsonb_agg(value||'{"retained":true}' order by ordinality) into quantity from jsonb_array_elements(quantity) with ordinality;
 else
  mode:=a.goal_tracking_mode;
  if mode='checklist' then
   fresh:=a.checklist_items;checks:='[]';
   for n in select value from jsonb_array_elements(fresh) loop
    select value into o from jsonb_array_elements(p.checklist_snapshot) where value->>'id'=n->>'id';
    checks:=checks||jsonb_build_array(n||jsonb_build_object('completedAt',coalesce(o->'completedAt','null'::jsonb)));
   end loop;
   for o in select value from jsonb_array_elements(p.checklist_snapshot) loop
    if o->>'completedAt' is not null and not exists(select 1 from jsonb_array_elements(fresh) where value->>'id'=o->>'id') then checks:=checks||jsonb_build_array(o||'{"retained":true}');end if;
   end loop;quantity:=null;
  else
   select coalesce(jsonb_agg(jsonb_build_object('goalId',g.id,'metric',g.metric,'unit',g.unit,'target',g.minimum_target,'period',g.period,'completed',0,'checked','[]'::jsonb) order by g.sort_position,g.id),'[]') into fresh
    from public.goals g where g.activity_id=a.id and g.user_id=a.user_id and g.enabled and g.starts_on<=p.planned_date and (g.ends_on is null or g.ends_on>=p.planned_date);
   quantity:='[]';
   for n in select value from jsonb_array_elements(fresh) loop
    select value into o from jsonb_array_elements(p.quantity_snapshot) where value->>'goalId'=n->>'goalId';
    if o is not null then
     if (o->'metric',o->'unit',o->'period') is distinct from (n->'metric',n->'unit',n->'period') and (o->>'completed')::numeric>0 then n:=o||'{"retained":true}';
     elsif (o->'metric',o->'unit',o->'period') is not distinct from (n->'metric',n->'unit',n->'period') then n:=n||jsonb_build_object('completed',o->'completed','checked',o->'checked');end if;
    end if;quantity:=quantity||jsonb_build_array(n);
   end loop;
   for o in select value from jsonb_array_elements(p.quantity_snapshot) loop
    if (o->>'completed')::numeric>0 and not exists(select 1 from jsonb_array_elements(fresh) where value->>'goalId'=o->>'goalId') then quantity:=quantity||jsonb_build_array(o||'{"retained":true,"archived":true}');end if;
   end loop;checks:=null;
  end if;
 end if;
 return jsonb_build_object('checks',checks,'quantity',quantity,'mode',mode,'type',a.type,'name',a.name);
end $$;
revoke all on function routine_private.merge_open_activity_plan(public.daily_plan_items) from public,anon,authenticated;

create function public.sync_open_activity_plans(p_activity_id uuid,p_expected_revision integer,p_expected_plans jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();a public.activities;p public.daily_plan_items;k text;merged jsonb;today date:=(transaction_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.activities where id=p_activity_id and user_id=u for update nowait;
 if not found then raise exception 'Unavailable activity' using errcode='23503';end if;
 if a.revision is distinct from p_expected_revision then raise exception 'Stale activity' using errcode='40001';end if;
 if jsonb_typeof(p_expected_plans) is distinct from 'object' then raise exception 'Invalid plan snapshots' using errcode='23514';end if;
 if exists(select 1 from public.daily_plan_items d where d.activity_id=a.id and d.user_id=u and d.completed_at is null and d.planned_date>=today and not(p_expected_plans?d.id::text)) then raise exception 'Plan set changed' using errcode='40001';end if;
 for k in select jsonb_object_keys(p_expected_plans) order by 1 loop
  select * into p from public.daily_plan_items where id=k::uuid and activity_id=a.id and user_id=u for update nowait;
  if not found then raise exception 'Plan changed' using errcode='40001';end if;
  if p.updated_at is distinct from (p_expected_plans->>k)::timestamptz or p.completed_at is not null or p.planned_date<today then raise exception 'Plan changed' using errcode='40001';end if;
  merged:=routine_private.merge_open_activity_plan(p);
  if (p.checklist_snapshot,p.quantity_snapshot,p.goal_tracking_mode_snapshot,p.activity_name_snapshot,p.activity_type_snapshot) is distinct from
    (nullif(merged->'checks','null'),nullif(merged->'quantity','null'),merged->>'mode',merged->>'name',merged->>'type') then
   update public.daily_plan_items set checklist_snapshot=nullif(merged->'checks','null'),quantity_snapshot=nullif(merged->'quantity','null'),goal_tracking_mode_snapshot=merged->>'mode',activity_name_snapshot=merged->>'name',activity_type_snapshot=merged->>'type' where id=p.id and user_id=u;
  end if;
 end loop;
exception when lock_not_available then raise exception 'Concurrent plan change' using errcode='40001';
end $$;
revoke all on function public.sync_open_activity_plans(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.sync_open_activity_plans(uuid,integer,jsonb) to authenticated;

-- Numeric state may outlive a smaller target. Preserve recorded ordinals/counter.
create or replace function routine_private.normalize_quantity(p_new jsonb,p_old jsonb default null,p_complete boolean default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n jsonb;o jsonb;result jsonb:='[]';checked jsonb;amount numeric;target numeric;i integer:=0;small boolean;idx integer;
begin
 if p_new is null then if p_old is not null then raise exception 'Quantity snapshot is immutable' using errcode='23514';end if;return null;end if;
 if jsonb_typeof(p_new)<>'array' or (p_old is not null and jsonb_array_length(p_new)<>jsonb_array_length(p_old)) then raise exception 'Invalid quantity snapshot' using errcode='23514';end if;
 for n in select value from jsonb_array_elements(p_new) loop
  o:=p_old->i;i:=i+1;
  if p_old is not null and n-array['completed','checked'] is distinct from o-array['completed','checked'] then raise exception 'Quantity definition is immutable' using errcode='23514';end if;
  target:=(n->>'target')::numeric;amount:=(n->>'completed')::numeric;checked:=n->'checked';
  if target is null or target<=0 or target>9007199254740991 or amount is null or amount<0 or amount>9007199254740991 or n->>'period' not in('day','week','month') or jsonb_typeof(checked)<>'array' then raise exception 'Invalid quantity value' using errcode='23514';end if;
  small:=n->>'period'='day' and target=trunc(target) and target<=20 and amount=jsonb_array_length(checked);
  if p_complete is not null then
   if not p_complete then amount:=0;checked:='[]';
   elsif n->>'archived'='true' then null;
   elsif small then
    for idx in 0..target::integer-1 loop
     exit when jsonb_array_length(checked)>=target;
     if not(checked@>to_jsonb(array[idx])) then checked:=checked||to_jsonb(idx);end if;
    end loop;amount:=jsonb_array_length(checked);
   else amount:=greatest(amount,case when n->>'period'='day' then target else 1 end);end if;
  end if;
  if n->>'metric'='count' and amount<>trunc(amount) then raise exception 'Invalid quantity amount' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(checked) v where jsonb_typeof(v)<>'number' or v::text::numeric<>trunc(v::text::numeric) or v::text::numeric<0 or v::text::numeric>=20)
   or (select count(distinct value) from jsonb_array_elements(checked))<>jsonb_array_length(checked) or amount<jsonb_array_length(checked) then raise exception 'Invalid quantity checks' using errcode='23514';end if;
  result:=result||jsonb_build_array(n||jsonb_build_object('completed',amount,'checked',checked));
 end loop;return result;
end $$;

do $$
declare definition text;fingerprint text;
begin
 select pg_get_functiondef('routine_private.guard_daily_plan_item()'::regprocedure) into definition;
 definition:=replace(definition,'all_quantity boolean:=true;','all_quantity boolean:=true; sync_valid boolean:=false; desired jsonb;');
 definition:=replace(definition,'begin'||chr(10),$patch$begin
 if tg_op='UPDATE' and routine_private.plan_definition(to_jsonb(new)) is distinct from routine_private.plan_definition(to_jsonb(old)) then
  if old.completed_at is null and old.planned_date >= (transaction_timestamp() at time zone 'America/Sao_Paulo')::date then
   desired:=routine_private.merge_open_activity_plan(old);
   sync_valid:=(new.checklist_snapshot,new.quantity_snapshot,new.goal_tracking_mode_snapshot,new.activity_type_snapshot,new.activity_name_snapshot) is not distinct from
    (nullif(desired->'checks','null'),nullif(desired->'quantity','null'),desired->>'mode',desired->>'type',desired->>'name');
  end if;
  if not sync_valid then raise exception 'Plan definition is immutable' using errcode='23514';end if;
 end if;
$patch$);
 definition:=replace(definition,'new.goal_tracking_mode_snapshot is distinct from old.goal_tracking_mode_snapshot or','(new.goal_tracking_mode_snapshot is distinct from old.goal_tracking_mode_snapshot and not sync_valid) or');
 definition:=replace(definition,'new.activity_type_snapshot is distinct from old.activity_type_snapshot','(new.activity_type_snapshot is distinct from old.activity_type_snapshot and not sync_valid)');
 definition:=replace(definition,'new.activity_name_snapshot is distinct from old.activity_name_snapshot','(new.activity_name_snapshot is distinct from old.activity_name_snapshot and not sync_valid)');
 definition:=replace(definition,$s$case when tg_op='UPDATE' then old.quantity_snapshot else null end$s$,$s$case when tg_op='UPDATE' and not sync_valid then old.quantity_snapshot else null end$s$);
 definition:=replace(definition,'case when value->>''period''=''day'' then','case when value->>''archived''=''true'' then (value->>''completed'')::numeric>0 when value->>''period''=''day'' then');
 execute definition;
 select pg_get_functiondef('public.change_daily_plan_v05(uuid,jsonb,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$s$and (n->>'target')::numeric<=20;$s$,$s$and (n->>'target')::numeric<=20 and (n->>'completed')::numeric=jsonb_array_length(n->'checked');$s$);
 definition:=replace(definition,$s$if idx<0 or idx>=(n->>'target')::numeric then$s$,$s$if idx<0 or idx>=20 or (idx>=(n->>'target')::numeric and not(n->'checked'@>to_jsonb(array[idx]))) then$s$);
 execute definition;
 -- The existing invoker aggregate remains the application entry point.
 select pg_get_functiondef('public.save_activity_v05(jsonb,jsonb,integer,jsonb,uuid[],jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'declare saved jsonb;',$patch$declare saved jsonb; old_def jsonb;new_def jsonb;tokens jsonb; key_id uuid:=(p_activity->>'id')::uuid;u uuid:=auth.uid();$patch$);
 fingerprint:=$fp$select jsonb_build_object('name',a.name,'type',a.type,'mode',a.goal_tracking_mode,'items',a.checklist_items,'goals',(select coalesce(jsonb_agg(to_jsonb(g)-array['user_id','activity_id','created_at','updated_at'] order by g.sort_position,g.id),'[]') from public.goals g where g.activity_id=a.id and g.user_id=a.user_id))$fp$;
 definition:=replace(definition,'begin'||chr(10),'begin'||chr(10)||' perform 1 from public.activities where id=key_id and user_id=u for update;'||chr(10)||fingerprint||' into old_def from public.activities a where a.id=key_id and a.user_id=u;'||chr(10)||$patch$
 select coalesce(jsonb_object_agg(id::text,updated_at::text),'{}') into tokens from public.daily_plan_items where activity_id=key_id and user_id=u and completed_at is null and planned_date >= (transaction_timestamp() at time zone 'America/Sao_Paulo')::date;
$patch$);
 definition:=replace(definition,'  return public.get_activity_aggregate', ' key_id:=(saved->''activity''->>''id'')::uuid;'||chr(10)||fingerprint||' into new_def from public.activities a where a.id=key_id and a.user_id=u;'||chr(10)||' if old_def is distinct from new_def then perform public.sync_open_activity_plans(key_id,(select revision from public.activities where id=key_id and user_id=u),tokens);end if;'||chr(10)||'  return public.get_activity_aggregate');
 execute definition;
end $$;
