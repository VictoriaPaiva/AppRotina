-- V0.5 correction: time always wins. manual_order remains for compatibility,
-- but no longer controls presentation or automatic organization.
create or replace function routine_private.organize_plan_day() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||new.planned_date::text,0));
  with ranked as(select id,row_number() over(order by planned_time nulls last,sort_order,created_at,id)-1 pos
    from public.daily_plan_items where user_id=new.user_id and planned_date=new.planned_date)
  update public.daily_plan_items p set sort_order=r.pos,manual_order=false from ranked r
    where p.id=r.id and p.user_id=new.user_id and (p.sort_order<>r.pos or p.manual_order);
  return null;
end $$;

-- Removing a time appends deterministically to the untimed group. The existing
-- guard still stamps updated_at and enforces immutable identity / completion.
create function routine_private.prepare_untimed_position() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if old.planned_time is not null and new.planned_time is null then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||new.planned_date::text,0));
    select coalesce(max(sort_order)+1,0) into new.sort_order from public.daily_plan_items
      where user_id=new.user_id and planned_date=new.planned_date and id<>new.id;
  end if;
  return new;
end $$;
revoke all on function routine_private.prepare_untimed_position() from public,anon,authenticated;
create trigger a_prepare_untimed_position before update of planned_time on public.daily_plan_items
  for each row execute function routine_private.prepare_untimed_position();

create or replace function public.reorder_plan_day(p_date date,p_items jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();n jsonb;p public.daily_plan_items;position integer:=0;timed uuid[];prefix uuid[];
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_date::text,0));
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or
    (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Invalid order' using errcode='23514';end if;
  perform 1 from public.daily_plan_items where user_id=u and planned_date=p_date order by id for update;
  if (select count(*) from public.daily_plan_items where user_id=u and planned_date=p_date)<>jsonb_array_length(p_items) then raise exception 'Day changed' using errcode='40001';end if;
  for n in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(n) is distinct from 'object' or (select count(*) from jsonb_object_keys(n))<>2 or exists(select 1 from jsonb_object_keys(n) k where k not in ('id','expected')) then raise exception 'Invalid ordered item' using errcode='23514';end if;
    select * into p from public.daily_plan_items where id=(n->>'id')::uuid and user_id=u and planned_date=p_date;
    if not found then raise exception 'Unavailable ordered item' using errcode='23503';end if;
    if jsonb_typeof(n->'expected') is distinct from 'object' or (select count(*) from jsonb_object_keys(n->'expected'))<>3
      or exists(select 1 from jsonb_object_keys(n->'expected') k where k not in ('updatedAt','completedAt','plannedDate')) then raise exception 'Invalid expected snapshot' using errcode='23514';end if;
    if p.updated_at is distinct from (n->'expected'->>'updatedAt')::timestamptz or p.completed_at is distinct from (n->'expected'->>'completedAt')::timestamptz or p.planned_date is distinct from (n->'expected'->>'plannedDate')::date then raise exception 'Day changed' using errcode='40001';end if;
  end loop;
  select coalesce(array_agg(id order by planned_time,sort_order,created_at,id),'{}'::uuid[]) into timed
    from public.daily_plan_items where user_id=u and planned_date=p_date and planned_time is not null;
  select coalesce(array_agg((value->>'id')::uuid order by ordinality),'{}'::uuid[]) into prefix
    from jsonb_array_elements(p_items) with ordinality where ordinality<=cardinality(timed);
  if prefix is distinct from timed then raise exception 'Timed items must remain chronological' using errcode='23514';end if;
  for n in select value from jsonb_array_elements(p_items) loop
    update public.daily_plan_items set sort_order=position,manual_order=false where id=(n->>'id')::uuid and user_id=u and (sort_order<>position or manual_order);
    position:=position+1;
  end loop;
end $$;

-- Normalize existing manual days to the new rule. Execution snapshots and
-- completed_at are untouched; normal timestamp stamping invalidates stale CAS.
with ranked as(select id,row_number() over(partition by user_id,planned_date order by planned_time nulls last,sort_order,created_at,id)-1 pos
  from public.daily_plan_items)
update public.daily_plan_items p set sort_order=r.pos,manual_order=false from ranked r
  where p.id=r.id and (p.sort_order<>r.pos or p.manual_order);
