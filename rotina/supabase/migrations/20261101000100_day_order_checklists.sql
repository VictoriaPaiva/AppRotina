-- V0.5: estimated civil time, explicit daily order, separate execution checklist.
alter table public.activities add column checklist_items jsonb not null default '[]'::jsonb;
alter table public.activities add constraint activities_checklist_type check(type='checklistGoal' or checklist_items='[]'::jsonb);
alter table public.daily_plan_items add column planned_time time(0),
  add column sort_order integer not null default 0 check(sort_order>=0),
  add column manual_order boolean not null default false,
  add column activity_type_snapshot text,
  add column checklist_snapshot jsonb;
alter table public.daily_plan_items add constraint plan_time_minutes check(planned_time is null or extract(second from planned_time)=0);
-- Preserve historical timestamps and execution state during deterministic backfill.
alter table public.daily_plan_items disable trigger guard_daily_plan_item;
with ranked as(select id,row_number() over(partition by user_id,planned_date order by created_at,id)-1 pos from public.daily_plan_items)
update public.daily_plan_items p set sort_order=r.pos from ranked r where p.id=r.id;
alter table public.daily_plan_items enable trigger guard_daily_plan_item;
create index daily_plan_items_order_idx on public.daily_plan_items(user_id,planned_date,sort_order,id);

create function routine_private.validate_checklist(p_items jsonb) returns void
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare n jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid checklist' using errcode='23514';end if;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Duplicate checklist ID' using errcode='23514';end if;
  for n in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(n) is distinct from 'object' or (select count(*) from jsonb_object_keys(n))<>2
      or exists(select 1 from jsonb_object_keys(n) k where k not in ('id','label'))
      or jsonb_typeof(n->'id') is distinct from 'string' or (n->>'id')::uuid is null
      or jsonb_typeof(n->'label') is distinct from 'string' or char_length(btrim(n->>'label')) not between 1 and 200
      then raise exception 'Invalid checklist item' using errcode='23514';end if;
  end loop;
end $$;
revoke all on function routine_private.validate_checklist(jsonb) from public,anon,authenticated;

create function routine_private.guard_activity_checklist() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if new.type<>'checklistGoal' then new.checklist_items:='[]';end if;
  return new;
end $$;
revoke all on function routine_private.guard_activity_checklist() from public,anon,authenticated;
create trigger clear_non_checklist before update of type on public.activities for each row execute function routine_private.guard_activity_checklist();

create function public.save_activity_checklist(p_activity_id uuid,p_expected_revision integer,p_items jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();a public.activities;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into a from public.activities where id=p_activity_id and user_id=u for update;
  if not found then raise exception 'Unavailable activity' using errcode='23503';end if;
  if a.revision is distinct from p_expected_revision then raise exception 'Stale definition' using errcode='40001';end if;
  perform routine_private.validate_checklist(p_items);
  select coalesce(jsonb_agg(jsonb_build_object('id',(value->>'id')::uuid::text,'label',btrim(value->>'label')) order by ordinality),'[]'::jsonb)
    into p_items from jsonb_array_elements(p_items) with ordinality;
  if a.type<>'checklistGoal' and p_items<>'[]'::jsonb then raise exception 'Checklist type required' using errcode='23514';end if;
  if p_items is distinct from a.checklist_items then update public.activities set checklist_items=p_items where id=a.id and user_id=u;end if;
end $$;
revoke all on function public.save_activity_checklist(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_activity_checklist(uuid,integer,jsonb) to authenticated;

create function public.save_activity_v05(p_activity jsonb,p_relations jsonb,p_expected_revision integer,p_tree jsonb,p_deleted_ids uuid[],p_checklist jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare saved jsonb;
begin
  if cardinality(p_deleted_ids)>0 then saved:=public.save_activity_with_subitem_deletions(p_activity,p_relations,p_expected_revision,p_tree,p_deleted_ids);
  elsif p_tree is not null then saved:=public.save_activity_with_subitems(p_activity,p_relations,p_expected_revision,p_tree);
  else saved:=public.save_activity_aggregate(p_activity,p_relations,p_expected_revision);end if;
  perform public.save_activity_checklist((saved->'activity'->>'id')::uuid,(saved->'activity'->>'revision')::integer,p_checklist);
  return public.get_activity_aggregate((saved->'activity'->>'id')::uuid);
end $$;
revoke all on function public.save_activity_v05(jsonb,jsonb,integer,jsonb,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.save_activity_v05(jsonb,jsonb,integer,jsonb,uuid[],jsonb) to authenticated;

create or replace function routine_private.guard_daily_plan_item() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
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
    new.activity_type_snapshot:=a.type;
    if a.type='checklistGoal' then new.activity_name_snapshot:=a.name;end if;
    if a.type='checklistGoal' then
      select coalesce(jsonb_agg(value||jsonb_build_object('completedAt',null) order by ordinality),'[]'::jsonb) into new.checklist_snapshot
        from jsonb_array_elements(a.checklist_items) with ordinality;
    else new.checklist_snapshot:=null;end if;
    new.completed_at:=null;new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.activity_id is distinct from old.activity_id or new.created_at is distinct from old.created_at
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
end $$;

create function routine_private.organize_plan_day() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||new.planned_date::text,0));
  if not exists(select 1 from public.daily_plan_items where user_id=new.user_id and planned_date=new.planned_date and manual_order) then
    with ranked as(select id,row_number() over(order by planned_time nulls last,sort_order,created_at,id)-1 pos
      from public.daily_plan_items where user_id=new.user_id and planned_date=new.planned_date)
    update public.daily_plan_items p set sort_order=r.pos from ranked r where p.id=r.id and p.user_id=new.user_id and p.sort_order<>r.pos;
  end if;
  return null;
end $$;
revoke all on function routine_private.organize_plan_day() from public,anon,authenticated;
create trigger organize_plan_day after insert or update of planned_time,planned_date on public.daily_plan_items for each row execute function routine_private.organize_plan_day();

create function public.create_daily_plan_v05(p_id uuid,p_activity_id uuid,p_planned_date date,p_planned_time text,p_revision integer,p_configuration jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();result public.daily_plan_items;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_planned_time is not null and p_planned_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid civil time' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_planned_date::text,0));
  if p_revision is not null then perform public.create_plan_with_subitems(p_id,p_activity_id,p_planned_date,p_revision,p_configuration);
  else
    if p_configuration is not null then raise exception 'Missing revision' using errcode='23514';end if;
    insert into public.daily_plan_items(id,user_id,activity_id,planned_date) values(p_id,u,p_activity_id,p_planned_date);
  end if;
  if p_planned_time is not null then update public.daily_plan_items set planned_time=p_planned_time::time where id=p_id and user_id=u;end if;
  select * into result from public.daily_plan_items where id=p_id and user_id=u;
  return to_jsonb(result);
end $$;
revoke all on function public.create_daily_plan_v05(uuid,uuid,date,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.create_daily_plan_v05(uuid,uuid,date,text,integer,jsonb) to authenticated;

create function public.change_daily_plan_v05(p_id uuid,p_expected jsonb,p_operation text,p_value jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();p public.daily_plan_items;nodes jsonb;result public.daily_plan_items;d date;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  select planned_date into d from public.daily_plan_items where id=p_id and user_id=u;
  if not found then raise exception 'Unavailable plan' using errcode='23503';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||d::text,0));
  select * into p from public.daily_plan_items where id=p_id and user_id=u for update;
  if jsonb_typeof(p_expected) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_expected))<>3
    or exists(select 1 from jsonb_object_keys(p_expected) k where k not in ('updatedAt','completedAt','plannedDate')) then raise exception 'Invalid expected snapshot' using errcode='23514';end if;
  if p.updated_at is distinct from (p_expected->>'updatedAt')::timestamptz or p.completed_at is distinct from (p_expected->>'completedAt')::timestamptz or p.planned_date is distinct from (p_expected->>'plannedDate')::date then raise exception 'Stale plan' using errcode='40001';end if;
  if p_operation='time' then
    -- Keep JSON null inside an object: an RPC argument null becomes SQL NULL.
    if jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>1 or not(p_value?'plannedTime')
      then raise exception 'Explicit time required' using errcode='23514';end if;
    if p_value->'plannedTime'<>'null'::jsonb and (jsonb_typeof(p_value->'plannedTime') is distinct from 'string' or (p_value->>'plannedTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid civil time' using errcode='23514';end if;
    update public.daily_plan_items set planned_time=(p_value->>'plannedTime')::time where id=p.id and user_id=u;
  elsif p_operation='check' then
    if jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>2
      or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('id','completed')) or jsonb_typeof(p_value->'completed') is distinct from 'boolean'
      or not exists(select 1 from jsonb_array_elements(p.checklist_snapshot) where value->>'id'=p_value->>'id') then raise exception 'Unavailable checklist item' using errcode='23514';end if;
    select jsonb_agg(case when value->>'id'=p_value->>'id' then value||jsonb_build_object('completedAt',case when (p_value->>'completed')::boolean then to_jsonb(clock_timestamp()) else 'null'::jsonb end) else value end order by ordinality)
      into nodes from jsonb_array_elements(p.checklist_snapshot) with ordinality;
    update public.daily_plan_items set checklist_snapshot=nodes where id=p.id and user_id=u;
  else raise exception 'Invalid operation' using errcode='23514';end if;
  select * into result from public.daily_plan_items where id=p.id and user_id=u;return to_jsonb(result);
end $$;
revoke all on function public.change_daily_plan_v05(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.change_daily_plan_v05(uuid,jsonb,text,jsonb) to authenticated;

create function public.reorder_plan_day(p_date date,p_items jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();n jsonb;p public.daily_plan_items;position integer:=0;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_date::text,0));
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or
    (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Invalid order' using errcode='23514';end if;
  perform 1 from public.daily_plan_items where user_id=u and planned_date=p_date order by id for update;
  if (select count(*) from public.daily_plan_items where user_id=u and planned_date=p_date)<>jsonb_array_length(p_items) then raise exception 'Day changed' using errcode='40001';end if;
  -- Validate the entire day before writing any position; IDs cannot cross days/accounts.
  for n in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(n) is distinct from 'object' or (select count(*) from jsonb_object_keys(n))<>2 or exists(select 1 from jsonb_object_keys(n) k where k not in ('id','expected')) then raise exception 'Invalid ordered item' using errcode='23514';end if;
    select * into p from public.daily_plan_items where id=(n->>'id')::uuid and user_id=u and planned_date=p_date;
    if not found then raise exception 'Unavailable ordered item' using errcode='23503';end if;
    if jsonb_typeof(n->'expected') is distinct from 'object' or (select count(*) from jsonb_object_keys(n->'expected'))<>3
      or exists(select 1 from jsonb_object_keys(n->'expected') k where k not in ('updatedAt','completedAt','plannedDate')) then raise exception 'Invalid expected snapshot' using errcode='23514';end if;
    if p.updated_at is distinct from (n->'expected'->>'updatedAt')::timestamptz or p.completed_at is distinct from (n->'expected'->>'completedAt')::timestamptz or p.planned_date is distinct from (n->'expected'->>'plannedDate')::date then raise exception 'Day changed' using errcode='40001';end if;
  end loop;
  for n in select value from jsonb_array_elements(p_items) loop
    update public.daily_plan_items set sort_order=position,manual_order=true where id=(n->>'id')::uuid and user_id=u and (sort_order<>position or not manual_order);
    position:=position+1;
  end loop;
end $$;
revoke all on function public.reorder_plan_day(date,jsonb) from public,anon,authenticated;
grant execute on function public.reorder_plan_day(date,jsonb) to authenticated;
