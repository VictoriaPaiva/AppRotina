-- Explicit origins: preserve every Activity FK/snapshot rule; avulsos own their data.
alter table public.daily_plan_items
  add column origin text not null default 'activity' check(origin in ('activity','standalone')),
  add column standalone_title text,
  add column standalone_description text,
  add column standalone_importance text,
  alter column activity_id drop not null;
alter table public.daily_plan_items add constraint daily_plan_items_origin_shape check (
  (origin='activity' and activity_id is not null and standalone_title is null
    and standalone_description is null and standalone_importance is null)
  or
  (origin='standalone' and activity_id is null
    and standalone_title is not null and char_length(btrim(standalone_title)) between 1 and 200
    and standalone_importance is not null and standalone_importance in ('required','important','optional')
    and (standalone_description is null or char_length(standalone_description)<=2000)
    and (planned_duration_minutes is null or planned_duration_minutes>0)
    and subitem_snapshot is null and checklist_snapshot is null and quantity_snapshot is null
    and activity_name_snapshot is null and activity_type_snapshot is null and goal_tracking_mode_snapshot is null)
);

-- Full final guard through V0.5: Activity execution/sync stays unchanged.
-- Only admission branches by origin; ordering, timestamps and completion remain shared.
create or replace function routine_private.guard_daily_plan_item() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare total bigint; selected_count integer; all_subs boolean:=true; all_checks boolean:=true;
  all_quantity boolean:=true; sync_valid boolean:=false; desired jsonb;
  direct_completion boolean:=false; a public.activities;
begin
  if tg_op='UPDATE' and new.origin is distinct from old.origin then raise exception 'Plan origin is immutable' using errcode='23514';end if;
  if new.origin='activity' and tg_op='UPDATE' and routine_private.plan_definition(to_jsonb(new)) is distinct from routine_private.plan_definition(to_jsonb(old)) then
    if old.completed_at is null and old.planned_date >= (transaction_timestamp() at time zone 'America/Sao_Paulo')::date then
      desired:=routine_private.merge_open_activity_plan(old);
      sync_valid:=(new.checklist_snapshot,new.quantity_snapshot,new.goal_tracking_mode_snapshot,new.activity_type_snapshot,new.activity_name_snapshot) is not distinct from
        (nullif(desired->'checks','null'),nullif(desired->'quantity','null'),desired->>'mode',desired->>'type',desired->>'name');
    end if;
    if not sync_valid then raise exception 'Plan definition is immutable' using errcode='23514';end if;
  end if;
  if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Invalid owner' using errcode='42501';end if;
  if tg_op='INSERT' or new.planned_date is distinct from old.planned_date then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||new.planned_date::text,0));
    select coalesce(max(sort_order)+1,0),coalesce(bool_or(manual_order),false) into new.sort_order,new.manual_order
      from public.daily_plan_items where user_id=new.user_id and planned_date=new.planned_date and id<>new.id;
  end if;
  if tg_op='INSERT' then
    if new.origin='activity' then
      select * into a from public.activities where id=new.activity_id and user_id=new.user_id and status='active' for share;
      if not found then raise exception 'Activity unavailable for planning' using errcode='23503';end if;
      if new.subitem_snapshot is null and exists(select 1 from public.activity_subitems where user_id=new.user_id and root_activity_id=new.activity_id) then raise exception 'Configure subitems before planning' using errcode='23514';end if;
      new.activity_type_snapshot:=a.type;
      if a.type='checklistGoal' and a.goal_tracking_mode='quantity' then
        select coalesce(jsonb_agg(jsonb_build_object('goalId',g.id,'metric',g.metric,'unit',g.unit,'target',g.minimum_target,'period',g.period,'completed',0,'checked','[]'::jsonb) order by g.sort_position,g.id),'[]') into new.quantity_snapshot
          from public.goals g where g.activity_id=a.id and g.user_id=a.user_id and g.enabled and g.starts_on<=new.planned_date and (g.ends_on is null or g.ends_on>=new.planned_date);
      else new.quantity_snapshot:=null;end if;
      new.goal_tracking_mode_snapshot:=case when a.type='checklistGoal' then a.goal_tracking_mode else null end;
      if a.type='checklistGoal' then new.activity_name_snapshot:=a.name;end if;
      if a.type='checklistGoal' and a.goal_tracking_mode='checklist' then
        select coalesce(jsonb_agg(value||jsonb_build_object('completedAt',null) order by ordinality),'[]'::jsonb) into new.checklist_snapshot
          from jsonb_array_elements(a.checklist_items) with ordinality;
      else new.checklist_snapshot:=null;end if;
    end if;
    new.completed_at:=null;new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
  else
    if (new.goal_tracking_mode_snapshot is distinct from old.goal_tracking_mode_snapshot and not sync_valid) or new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.activity_id is distinct from old.activity_id or new.created_at is distinct from old.created_at
      or (new.activity_type_snapshot is distinct from old.activity_type_snapshot and not sync_valid) or (new.activity_name_snapshot is distinct from old.activity_name_snapshot and not sync_valid) then raise exception 'Plan identity is immutable' using errcode='23514';end if;
    if new.planned_date is distinct from old.planned_date and (old.completed_at is not null or new.completed_at is not null) then raise exception 'Completed plans cannot be rescheduled' using errcode='23514';end if;
    direct_completion:=new.quantity_snapshot is not distinct from old.quantity_snapshot and new.completed_at is distinct from old.completed_at and new.subitem_snapshot is not distinct from old.subitem_snapshot and new.checklist_snapshot is not distinct from old.checklist_snapshot;
    if new.completed_at is not null then new.completed_at:=coalesce(old.completed_at,clock_timestamp());end if;
    new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
    if direct_completion then new.quantity_snapshot:=routine_private.normalize_quantity(new.quantity_snapshot,old.quantity_snapshot,new.completed_at is not null);end if;
    if direct_completion and new.checklist_snapshot is not null then
      select jsonb_agg(value||jsonb_build_object('completedAt',to_jsonb(new.completed_at)) order by ordinality) into new.checklist_snapshot from jsonb_array_elements(new.checklist_snapshot) with ordinality;
      if old.checklist_snapshot='[]'::jsonb then new.checklist_snapshot:='[]';end if;
    end if;
    if direct_completion and new.subitem_snapshot is not null then
      select jsonb_agg(case when (value->>'selected')::boolean then value||jsonb_build_object('completedAt',to_jsonb(new.completed_at)) else value end order by ordinality)
        into new.subitem_snapshot from jsonb_array_elements(new.subitem_snapshot) with ordinality;
    end if;
  end if;
  new.quantity_snapshot:=routine_private.normalize_quantity(new.quantity_snapshot,case when tg_op='UPDATE' and not sync_valid then old.quantity_snapshot else null end);
  select coalesce(bool_and(case when value->>'archived'='true' then (value->>'completed')::numeric>0 when value->>'period'='day' then (value->>'completed')::numeric>=(value->>'target')::numeric else (value->>'completed')::numeric>0 end),true) into all_quantity from jsonb_array_elements(new.quantity_snapshot);
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
  if selected_count>0 or coalesce(jsonb_array_length(new.checklist_snapshot),0)>0 or coalesce(jsonb_array_length(new.quantity_snapshot),0)>0 then
    new.completed_at:=case when all_subs and all_checks and all_quantity then coalesce(new.completed_at,clock_timestamp()) else null end;
  end if;
  return new;
end $$;

-- Narrow authenticated creation; do not grant direct INSERT on the new metadata.
create function public.create_standalone_plan(p_item jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); result public.daily_plan_items; minutes integer;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  if jsonb_typeof(p_item) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_item) k where k not in ('id','title','plannedDate','plannedTime','durationMinutes','importance','description'))
    or jsonb_typeof(p_item->'id') is distinct from 'string'
    or jsonb_typeof(p_item->'title') is distinct from 'string'
    or char_length(btrim(p_item->>'title')) not between 1 and 200
    or jsonb_typeof(p_item->'plannedDate') is distinct from 'string'
    or (p_item->>'plannedDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'Invalid standalone item' using errcode='23514';end if;
  if not routine_private.valid_date((p_item->>'plannedDate')::date) then raise exception 'Invalid date' using errcode='23514';end if;
  if p_item->>'plannedTime' is not null and (p_item->>'plannedTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid time' using errcode='23514';end if;
  if p_item->>'durationMinutes' is not null then
    minutes:=routine_private.json_integer(p_item->'durationMinutes');
    if minutes<=0 then raise exception 'Invalid duration' using errcode='23514';end if;
  end if;
  if p_item->>'description' is not null and (jsonb_typeof(p_item->'description')<>'string' or char_length(p_item->>'description')>2000) then raise exception 'Invalid description' using errcode='23514';end if;
  insert into public.daily_plan_items(id,user_id,origin,activity_id,standalone_title,standalone_description,standalone_importance,planned_date,planned_time,planned_duration_minutes)
    values((p_item->>'id')::uuid,u,'standalone',null,btrim(p_item->>'title'),nullif(btrim(p_item->>'description'),''),coalesce(p_item->>'importance','important'),(p_item->>'plannedDate')::date,(p_item->>'plannedTime')::time,minutes)
    returning * into result;
  -- The ordering AFTER trigger can update this row, including its CAS timestamp.
  return (select to_jsonb(p) from public.daily_plan_items p where p.id=result.id and p.user_id=u);
end $$;
revoke all on function public.create_standalone_plan(jsonb) from public,anon,authenticated;
grant execute on function public.create_standalone_plan(jsonb) to authenticated;
