-- Quantity execution is separate from textual checklists. Existing occurrences stay null.
alter table public.daily_plan_items add column quantity_snapshot jsonb;

create function routine_private.normalize_quantity(p_new jsonb,p_old jsonb default null,p_complete boolean default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n jsonb;o jsonb;result jsonb:='[]';checked jsonb;amount numeric;target numeric;i integer:=0;small boolean;
begin
 if p_new is null then if p_old is not null then raise exception 'Quantity snapshot is immutable' using errcode='23514';end if;return null;end if;
 if jsonb_typeof(p_new)<>'array' or (p_old is not null and jsonb_array_length(p_new)<>jsonb_array_length(p_old)) then raise exception 'Invalid quantity snapshot' using errcode='23514';end if;
 for n in select value from jsonb_array_elements(p_new) loop
  o:=p_old->i;i:=i+1;
  if p_old is not null and n-array['completed','checked'] is distinct from o-array['completed','checked'] then raise exception 'Quantity definition is immutable' using errcode='23514';end if;
  target:=(n->>'target')::numeric;amount:=(n->>'completed')::numeric;checked:=n->'checked';
  if target is null or target<=0 or target>9007199254740991 or amount is null or amount<0 or amount>9007199254740991 or n->>'period' not in('day','week','month') or jsonb_typeof(checked)<>'array' then raise exception 'Invalid quantity value' using errcode='23514';end if;
  small:=n->>'period'='day' and target=trunc(target) and target<=20;
  if p_complete is not null then
   amount:=case when not p_complete then 0 when n->>'period'='day' then target else greatest(amount,1) end;
   if small and p_complete then select coalesce(jsonb_agg(x),'[]') into checked from generate_series(0,target::integer-1) x;else checked:='[]';end if;
  end if;
  if (n->>'period'='day' and amount>target) or (n->>'metric'='count' and amount<>trunc(amount)) then raise exception 'Invalid quantity amount' using errcode='23514';end if;
  if small then
   if exists(select 1 from jsonb_array_elements(checked) v where jsonb_typeof(v)<>'number' or v::text::numeric<>trunc(v::text::numeric) or v::text::numeric<0 or v::text::numeric>=target)
    or (select count(distinct value) from jsonb_array_elements(checked))<>jsonb_array_length(checked) or amount<>jsonb_array_length(checked) then raise exception 'Invalid quantity checks' using errcode='23514';end if;
  elsif checked<>'[]'::jsonb then raise exception 'Counter has no unit checks' using errcode='23514';end if;
  result:=result||jsonb_build_array(n||jsonb_build_object('completed',amount,'checked',checked));
 end loop;return result;
end $$;
revoke all on function routine_private.normalize_quantity(jsonb,jsonb,boolean) from public,anon,authenticated;

do $$
declare definition text;anchor text;
begin
 select pg_get_functiondef('routine_private.guard_daily_plan_item()'::regprocedure) into definition;
 definition:=replace(definition,'all_checks boolean:=true;','all_checks boolean:=true; all_quantity boolean:=true;');
 anchor:='new.activity_type_snapshot:=a.type;';
 if position(anchor in definition)=0 then raise exception 'Unexpected plan guard';end if;
 definition:=replace(definition,anchor,anchor||$patch$
    if a.type='checklistGoal' and a.goal_tracking_mode='quantity' then
      select coalesce(jsonb_agg(jsonb_build_object('goalId',g.id,'metric',g.metric,'unit',g.unit,'target',g.minimum_target,'period',g.period,'completed',0,'checked','[]'::jsonb) order by g.sort_position,g.id),'[]') into new.quantity_snapshot
        from public.goals g where g.activity_id=a.id and g.user_id=a.user_id and g.enabled and g.starts_on<=new.planned_date and (g.ends_on is null or g.ends_on>=new.planned_date);
    else new.quantity_snapshot:=null;end if;
 $patch$);
 definition:=replace(definition,'direct_completion:=new.completed_at','direct_completion:=new.quantity_snapshot is not distinct from old.quantity_snapshot and new.completed_at');
 definition:=replace(definition,'if direct_completion and new.checklist_snapshot', 'if direct_completion then new.quantity_snapshot:=routine_private.normalize_quantity(new.quantity_snapshot,old.quantity_snapshot,new.completed_at is not null);end if;'||chr(10)||'    if direct_completion and new.checklist_snapshot');
 anchor:='  if new.subitem_snapshot is not null then';
 definition:=replace(definition,anchor,$patch$
  new.quantity_snapshot:=routine_private.normalize_quantity(new.quantity_snapshot,case when tg_op='UPDATE' then old.quantity_snapshot else null end);
  select coalesce(bool_and(case when value->>'period'='day' then (value->>'completed')::numeric>=(value->>'target')::numeric else (value->>'completed')::numeric>0 end),true) into all_quantity from jsonb_array_elements(new.quantity_snapshot);
 $patch$||anchor);
 definition:=replace(definition,'if selected_count>0 or coalesce(jsonb_array_length(new.checklist_snapshot),0)>0 then','if selected_count>0 or coalesce(jsonb_array_length(new.checklist_snapshot),0)>0 or coalesce(jsonb_array_length(new.quantity_snapshot),0)>0 then');
 definition:=replace(definition,'when all_subs and all_checks then','when all_subs and all_checks and all_quantity then');
 execute definition;
 select pg_get_functiondef('public.change_daily_plan_v05(uuid,jsonb,text,jsonb)'::regprocedure) into definition;
 anchor:='  else raise exception ''Invalid operation''';
 if position(anchor in definition)=0 then raise exception 'Unexpected plan RPC';end if;
 definition:=replace(definition,anchor,$patch$
  elsif p_operation='quantity' then
    if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_value) k where k not in('goalId','amount','unitIndex','completed')) then raise exception 'Invalid quantity payload' using errcode='23514';end if;
    declare n jsonb;checked jsonb;amount numeric;small boolean;idx integer;found_goal boolean:=false;
    begin
     nodes:='[]';
     for n in select value from jsonb_array_elements(p.quantity_snapshot) loop
      if n->>'goalId'=p_value->>'goalId' then
       found_goal:=true;small:=n->>'period'='day' and (n->>'target')::numeric=trunc((n->>'target')::numeric) and (n->>'target')::numeric<=20;
       if small then
        if (select count(*) from jsonb_object_keys(p_value))<>3 or jsonb_typeof(p_value->'unitIndex') is distinct from 'number' or jsonb_typeof(p_value->'completed') is distinct from 'boolean' or (p_value->>'unitIndex')::numeric<>trunc((p_value->>'unitIndex')::numeric) then raise exception 'Invalid unit index' using errcode='23514';end if;
        idx:=(p_value->>'unitIndex')::integer;if idx<0 or idx>=(n->>'target')::numeric then raise exception 'Invalid unit index' using errcode='23514';end if;
        select coalesce(jsonb_agg(value order by value::text::integer),'[]') into checked from jsonb_array_elements(n->'checked') where value::text::integer<>idx;
        if (p_value->>'completed')::boolean then checked:=checked||to_jsonb(idx);end if;amount:=jsonb_array_length(checked);
       else
        if (select count(*) from jsonb_object_keys(p_value))<>2 or jsonb_typeof(p_value->'amount') is distinct from 'number' then raise exception 'Invalid amount' using errcode='23514';end if;
        checked:='[]';amount:=(p_value->>'amount')::numeric;
       end if;
       n:=n||jsonb_build_object('completed',amount,'checked',checked);
      end if;nodes:=nodes||jsonb_build_array(n);
     end loop;
     if not found_goal then raise exception 'Unavailable quantity goal' using errcode='23514';end if;
     update public.daily_plan_items set quantity_snapshot=nodes where id=p.id and user_id=u;
    end;
 $patch$||anchor);
 execute definition;
end $$;
