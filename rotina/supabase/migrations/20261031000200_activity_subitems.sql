-- V0.4: opt-in definitions; occurrences retain their own immutable structure/history.
alter table public.activities add column child_selection_mode text not null default 'all'
  check (child_selection_mode in ('all','none','custom'));
create table public.activity_subitems (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  root_activity_id uuid not null,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  duration_minutes integer not null check (duration_minutes > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  default_selected boolean not null default true,
  unique(user_id,root_activity_id,id),
  foreign key(user_id,root_activity_id) references public.activities(user_id,id) on delete cascade,
  foreign key(user_id,root_activity_id,parent_id) references public.activity_subitems(user_id,root_activity_id,id) on delete cascade,
  check(parent_id is distinct from id)
);
create index activity_subitems_root_idx on public.activity_subitems(user_id,root_activity_id,parent_id,sort_order,id);
alter table public.activity_subitems enable row level security;
create policy activity_subitems_select on public.activity_subitems for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.activity_subitems from public,anon,authenticated;
grant select on public.activity_subitems to authenticated;

-- One SQL snapshot per page binds every definition to its root revision and mode.
create function public.list_activity_subitems(p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
  if p_offset is null or p_offset<0 then raise exception 'Invalid page' using errcode='23514';end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id),'[]') into result from (
    select s.*,a.revision as root_revision,a.child_selection_mode from public.activity_subitems s
    join public.activities a on a.id=s.root_activity_id and a.user_id=s.user_id
    where s.user_id=auth.uid() order by s.id limit 500 offset p_offset
  ) page;
  return result;
end $$;
revoke all on function public.list_activity_subitems(integer) from public,anon,authenticated;
grant execute on function public.list_activity_subitems(integer) to authenticated;

create function routine_private.guard_activity_subitem() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.root_activity_id is distinct from old.root_activity_id or new.parent_id is distinct from old.parent_id) then
    raise exception 'Subitem identity and hierarchy are immutable' using errcode='23514';
  end if;
  if tg_op='INSERT' and new.parent_id is not null and not exists(select 1 from public.activity_subitems where user_id=new.user_id and root_activity_id=new.root_activity_id and id=new.parent_id) then
    raise exception 'Parent must already exist in this tree' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function routine_private.guard_activity_subitem() from public,anon,authenticated;
create trigger guard_activity_subitem before insert or update on public.activity_subitems for each row execute function routine_private.guard_activity_subitem();

-- Also protect the derived duration when a legacy aggregate caller omits tree data.
create function routine_private.derive_activity_subitem_duration() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare total bigint;
begin
  if exists(select 1 from public.activity_subitems where user_id=new.user_id and root_activity_id=new.id) then
    with recursive t as (
      select s.* from public.activity_subitems s where s.user_id=new.user_id and s.root_activity_id=new.id and s.parent_id is null and s.active
      union all select s.* from public.activity_subitems s join t on s.parent_id=t.id where s.user_id=new.user_id and s.root_activity_id=new.id and s.active
    ) select coalesce(sum(t.duration_minutes),0) into total from t where not exists(select 1 from public.activity_subitems c where c.user_id=new.user_id and c.root_activity_id=new.id and c.parent_id=t.id);
    if total>2147483647 then raise exception 'Duration overflow' using errcode='23514';end if;
    new.duration_mode:=case when total>0 then 'fixed' else 'unknown' end;
    new.duration_minutes:=case when total>0 then total::integer else null end;
    new.min_duration_minutes:=null;new.ideal_duration_minutes:=null;
  end if;
  return new;
end $$;
revoke all on function routine_private.derive_activity_subitem_duration() from public,anon,authenticated;
create trigger c_subitem_duration before update of duration_mode,duration_minutes,min_duration_minutes,ideal_duration_minutes on public.activities
  for each row execute function routine_private.derive_activity_subitem_duration();

create function public.save_activity_subitems(p_activity_id uuid,p_expected_revision integer,p_tree jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); a public.activities; n jsonb; pending jsonb; next_pending jsonb; progressed boolean; total bigint; has_items boolean;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into a from public.activities where id=p_activity_id and user_id=u for update;
  if not found then raise exception 'Unavailable activity' using errcode='23503'; end if;
  if a.revision is distinct from p_expected_revision then raise exception 'Stale tree' using errcode='40001'; end if;
  if jsonb_typeof(p_tree) is distinct from 'object' or (p_tree->>'mode') not in ('all','none','custom') or jsonb_typeof(p_tree->'items') is distinct from 'array'
    or exists(select 1 from jsonb_object_keys(p_tree) k where k not in ('mode','items')) then raise exception 'Invalid tree' using errcode='23514'; end if;
  pending:=p_tree->'items';
  if (select count(*) from jsonb_array_elements(pending))<>(select count(distinct value->>'id') from jsonb_array_elements(pending)) then raise exception 'Duplicate IDs' using errcode='23514';end if;
  -- Missing existing nodes is never a request to delete history or definitions.
  if exists(select 1 from public.activity_subitems s where s.user_id=u and s.root_activity_id=a.id and not exists(select 1 from jsonb_array_elements(pending) pending_node where (pending_node.value->>'id')::uuid=s.id)) then raise exception 'Deactivate instead of deleting' using errcode='23514';end if;
  while jsonb_array_length(pending)>0 loop
    next_pending:='[]';progressed:=false;
    for n in select value from jsonb_array_elements(pending) loop
      if jsonb_typeof(n) is distinct from 'object' or exists(select 1 from jsonb_object_keys(n) k where k not in ('id','parentId','name','durationMinutes','sortOrder','active','defaultSelected'))
        or (select count(*) from jsonb_object_keys(n))<>7
        or jsonb_typeof(n->'name') is distinct from 'string' or jsonb_typeof(n->'active') is distinct from 'boolean' or jsonb_typeof(n->'defaultSelected') is distinct from 'boolean'
        or jsonb_typeof(n->'durationMinutes') is distinct from 'number' or jsonb_typeof(n->'sortOrder') is distinct from 'number' then raise exception 'Invalid subitem' using errcode='23514';end if;
      if n->>'parentId' is null or exists(select 1 from public.activity_subitems where user_id=u and root_activity_id=a.id and id=(n->>'parentId')::uuid) then
        if exists(select 1 from public.activity_subitems where id=(n->>'id')::uuid and (user_id<>u or root_activity_id<>a.id)) then raise exception 'Unavailable ID' using errcode='23514';end if;
        insert into public.activity_subitems(id,user_id,root_activity_id,parent_id,name,duration_minutes,sort_order,active,default_selected)
          values((n->>'id')::uuid,u,a.id,(n->>'parentId')::uuid,btrim(n->>'name'),routine_private.json_integer(n->'durationMinutes'),routine_private.json_integer(n->'sortOrder'),(n->>'active')::boolean,(n->>'defaultSelected')::boolean)
          on conflict(id) do update set name=excluded.name,duration_minutes=excluded.duration_minutes,sort_order=excluded.sort_order,active=excluded.active,default_selected=excluded.default_selected,
            parent_id=excluded.parent_id;
        progressed:=true;
      else next_pending:=next_pending||jsonb_build_array(n); end if;
    end loop;
    if not progressed then raise exception 'Cycle or unavailable parent' using errcode='23514';end if;
    pending:=next_pending;
  end loop;
  select exists(select 1 from public.activity_subitems where root_activity_id=a.id and user_id=u) into has_items;
  with recursive t as (
    select s.* from public.activity_subitems s where s.root_activity_id=a.id and s.user_id=u and s.parent_id is null and s.active
    union all select s.* from public.activity_subitems s join t on s.parent_id=t.id where s.user_id=u and s.root_activity_id=a.id and s.active
  ) select coalesce(sum(t.duration_minutes),0) into total from t where not exists(select 1 from public.activity_subitems c where c.user_id=u and c.root_activity_id=a.id and c.parent_id=t.id);
  if total>2147483647 then raise exception 'Duration overflow' using errcode='23514';end if;
  update public.activities set child_selection_mode=p_tree->>'mode',
    duration_mode=case when not has_items then a.duration_mode when total>0 then 'fixed' else 'unknown' end,
    duration_minutes=case when not has_items then a.duration_minutes when total>0 then total::integer else null end,
    min_duration_minutes=case when not has_items then a.min_duration_minutes else null end,
    ideal_duration_minutes=case when not has_items then a.ideal_duration_minutes else null end
    where id=a.id and user_id=u;
end $$;
revoke all on function public.save_activity_subitems(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_activity_subitems(uuid,integer,jsonb) to authenticated;

-- Invoker wrapper preserves all original aggregate admission/ownership rules and transactionality.
create function public.save_activity_with_subitems(p_activity jsonb,p_relations jsonb,p_expected_revision integer,p_tree jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare saved jsonb;
begin
  saved:=public.save_activity_aggregate(p_activity,p_relations,p_expected_revision);
  perform public.save_activity_subitems((saved->'activity'->>'id')::uuid,(saved->'activity'->>'revision')::integer,p_tree);
  return public.get_activity_aggregate((saved->'activity'->>'id')::uuid);
end $$;
revoke all on function public.save_activity_with_subitems(jsonb,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_activity_with_subitems(jsonb,jsonb,integer,jsonb) to authenticated;

alter table public.daily_plan_items add column subitem_snapshot jsonb,
  add column planned_duration_minutes integer check(planned_duration_minutes>=0),
  add column activity_name_snapshot text;

-- Server-only normalizer: frozen structure; selection/completion roll up bottom-up.
create function routine_private.normalize_plan_subitems(p_nodes jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare result jsonb:=p_nodes; n record; kids jsonb; selected boolean; done boolean; minutes bigint; stamp jsonb;
begin
  if jsonb_typeof(result) is distinct from 'array' then raise exception 'Invalid snapshot' using errcode='23514';end if;
  if (select count(*) from jsonb_array_elements(result))<>(select count(distinct value->>'id') from jsonb_array_elements(result)) then raise exception 'Duplicate snapshot IDs' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(result) x where x->>'parentId' is not null and not exists(select 1 from jsonb_array_elements(result) p where p->>'id'=x->>'parentId')) then raise exception 'Incomplete snapshot' using errcode='23514';end if;
  if (with recursive t as(select value from jsonb_array_elements(result) where value->>'parentId' is null union all select c.value from t join jsonb_array_elements(result) c on c.value->>'parentId'=t.value->>'id') select count(*) from t)<>jsonb_array_length(result) then raise exception 'Snapshot cycle' using errcode='23514';end if;
  for n in with recursive t as (
    select value,ordinality-1 idx,0 depth from jsonb_array_elements(result) with ordinality where value->>'parentId' is null
    union all select c.value,c.ordinality-1,t.depth+1 from t join jsonb_array_elements(result) with ordinality c on c.value->>'parentId'=t.value->>'id'
  ) select * from t order by depth desc loop
    select coalesce(jsonb_agg(value),'[]') into kids from jsonb_array_elements(result) where value->>'parentId'=n.value->>'id';
    if jsonb_array_length(kids)>0 then
      select coalesce(bool_or((value->>'selected')::boolean),false),coalesce(bool_and(value->'completedAt'<>'null'::jsonb) filter(where (value->>'selected')::boolean),false),coalesce(sum((value->>'plannedMinutes')::bigint),0) into selected,done,minutes from jsonb_array_elements(kids);
    else selected:=(n.value->>'selected')::boolean;done:=n.value->'completedAt'<>'null'::jsonb;minutes:=(n.value->>'durationMinutes')::integer;end if;
    if not selected then minutes:=0;done:=false;
    elsif n.value->>'overrideMinutes' is not null then minutes:=routine_private.json_integer(n.value->'overrideMinutes');end if;
    if minutes<0 or minutes>2147483647 then raise exception 'Duration overflow' using errcode='23514';end if;
    stamp:=case when done then coalesce(nullif(n.value->'completedAt','null'::jsonb),to_jsonb(clock_timestamp())) else 'null'::jsonb end;
    result:=jsonb_set(result,array[n.idx::text],n.value||jsonb_build_object('selected',selected,'plannedMinutes',minutes,'completedAt',stamp));
  end loop;
  return result;
end $$;
revoke all on function routine_private.normalize_plan_subitems(jsonb) from public,anon,authenticated;

create function public.create_plan_with_subitems(p_id uuid,p_activity_id uuid,p_planned_date date,p_revision integer,p_configuration jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();a public.activities; nodes jsonb;cfg jsonb; result public.daily_plan_items;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into a from public.activities where user_id=u and id=p_activity_id and status='active' for update;
  if not found then raise exception 'Unavailable activity' using errcode='23503';end if;
  if a.revision is distinct from p_revision then raise exception 'Stale definition' using errcode='40001';end if;
  with recursive t as (
    select s.* from public.activity_subitems s where s.user_id=u and s.root_activity_id=a.id and s.parent_id is null and s.active
    union all select s.* from public.activity_subitems s join t on s.parent_id=t.id where s.user_id=u and s.root_activity_id=a.id and s.active
  ), relevant as (
    select t.* from t where not exists(select 1 from public.activity_subitems c where c.user_id=u and c.root_activity_id=a.id and c.parent_id=t.id)
    union select parent.* from t parent join relevant child on child.parent_id=parent.id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'parentId',parent_id,'name',name,'durationMinutes',duration_minutes,'sortOrder',sort_order,'active',true,'defaultSelected',default_selected,'selected',a.child_selection_mode='all' or (a.child_selection_mode='custom' and default_selected),'overrideMinutes',null,'completedAt',null,'plannedMinutes',0) order by sort_order,id),'[]') into nodes from relevant;
  if jsonb_array_length(nodes)=0 and exists(select 1 from public.activity_subitems where user_id=u and root_activity_id=a.id) then raise exception 'No active selectable subitems' using errcode='23514';end if;
  if p_configuration is not null then
    if jsonb_typeof(p_configuration) is distinct from 'array' or jsonb_array_length(p_configuration)<>jsonb_array_length(nodes)
      or (select count(distinct value->>'id') from jsonb_array_elements(p_configuration))<>jsonb_array_length(nodes) then raise exception 'Invalid selection' using errcode='23514';end if;
    for cfg in select value from jsonb_array_elements(p_configuration) loop
      if exists(select 1 from jsonb_object_keys(cfg) k where k not in ('id','selected','overrideMinutes')) or (select count(*) from jsonb_object_keys(cfg))<>3
        or jsonb_typeof(cfg->'selected') is distinct from 'boolean' or not exists(select 1 from jsonb_array_elements(nodes) where value->>'id'=cfg->>'id') then raise exception 'Cross-tree selection' using errcode='23514';end if;
      if cfg->>'overrideMinutes' is not null and routine_private.json_integer(cfg->'overrideMinutes')<1 then raise exception 'Invalid override' using errcode='23514';end if;
    end loop;
    select coalesce(jsonb_agg(n.value||jsonb_build_object('selected',(c.value->>'selected')::boolean,'overrideMinutes',c.value->'overrideMinutes') order by n.ordinality),'[]') into nodes from jsonb_array_elements(nodes) with ordinality n join jsonb_array_elements(p_configuration) c on c.value->>'id'=n.value->>'id';
  end if;
  insert into public.daily_plan_items(id,user_id,activity_id,planned_date,subitem_snapshot,activity_name_snapshot)
    values(p_id,u,a.id,p_planned_date,case when jsonb_array_length(nodes)>0 then nodes else null end,case when jsonb_array_length(nodes)>0 then a.name else null end) returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.create_plan_with_subitems(uuid,uuid,date,integer,jsonb) from public,anon,authenticated;
grant execute on function public.create_plan_with_subitems(uuid,uuid,date,integer,jsonb) to authenticated;

create function public.change_plan_subitems(p_id uuid,p_expected jsonb,p_configuration jsonb default null,p_subitem_id uuid default null,p_completed boolean default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();p public.daily_plan_items; nodes jsonb; cfg jsonb; ids text[];result public.daily_plan_items;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into p from public.daily_plan_items where id=p_id and user_id=u for update;
  if not found then raise exception 'Unavailable plan' using errcode='23503';end if;
  if jsonb_typeof(p_expected) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_expected))<>3
    or exists(select 1 from jsonb_object_keys(p_expected) k where k not in ('updatedAt','completedAt','plannedDate')) then raise exception 'Invalid snapshot token' using errcode='23514';end if;
  if p.updated_at is distinct from (p_expected->>'updatedAt')::timestamptz or p.completed_at is distinct from (p_expected->>'completedAt')::timestamptz or p.planned_date is distinct from (p_expected->>'plannedDate')::date then raise exception 'Stale plan' using errcode='40001';end if;
  nodes:=p.subitem_snapshot;
  if nodes is null then raise exception 'Plan has no subitems' using errcode='23514';end if;
  if p_configuration is not null then
    if p_subitem_id is not null or p_completed is not null or jsonb_typeof(p_configuration) is distinct from 'array' or jsonb_array_length(p_configuration)<>jsonb_array_length(nodes)
      or (select count(distinct value->>'id') from jsonb_array_elements(p_configuration))<>jsonb_array_length(nodes) then raise exception 'Invalid configuration' using errcode='23514';end if;
    for cfg in select value from jsonb_array_elements(p_configuration) loop
      if exists(select 1 from jsonb_object_keys(cfg) k where k not in ('id','selected','overrideMinutes')) or (select count(*) from jsonb_object_keys(cfg))<>3
        or jsonb_typeof(cfg->'selected') is distinct from 'boolean' or not exists(select 1 from jsonb_array_elements(nodes) where value->>'id'=cfg->>'id') then raise exception 'Invalid frozen selection' using errcode='23514';end if;
      if cfg->>'overrideMinutes' is not null and routine_private.json_integer(cfg->'overrideMinutes')<1 then raise exception 'Invalid override' using errcode='23514';end if;
    end loop;
    select jsonb_agg(n.value||jsonb_build_object('selected',(c.value->>'selected')::boolean,'overrideMinutes',c.value->'overrideMinutes') order by n.ordinality) into nodes from jsonb_array_elements(nodes) with ordinality n join jsonb_array_elements(p_configuration) c on c.value->>'id'=n.value->>'id';
  else
    if p_subitem_id is null or p_completed is null or not exists(select 1 from jsonb_array_elements(nodes) where value->>'id'=p_subitem_id::text and (value->>'selected')::boolean) then raise exception 'Unavailable selected subitem' using errcode='23514';end if;
    with recursive t as(select p_subitem_id::text id union all select n.value->>'id' from t join jsonb_array_elements(nodes) n on n.value->>'parentId'=t.id) select array_agg(id) into ids from t;
    select jsonb_agg(case when value->>'id'=any(ids) and (value->>'selected')::boolean then value||jsonb_build_object('completedAt',case when p_completed then to_jsonb(clock_timestamp()) else 'null'::jsonb end) else value end order by ordinality) into nodes from jsonb_array_elements(nodes) with ordinality;
  end if;
  update public.daily_plan_items set subitem_snapshot=nodes where id=p.id and user_id=u returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.change_plan_subitems(uuid,jsonb,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.change_plan_subitems(uuid,jsonb,jsonb,uuid,boolean) to authenticated;

create or replace function routine_private.guard_daily_plan_item() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare total bigint; selected_count integer; all_done boolean;
begin
  if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Invalid owner' using errcode='42501';end if;
  if tg_op = 'INSERT' then
    -- Serialize admission against deactivation; existing plans do not depend on status.
    perform 1 from public.activities
      where id = new.activity_id and user_id = new.user_id and status = 'active' for share;
    if not found then
      raise exception 'Activity unavailable for planning' using errcode = '23503';
    end if;
    if new.subitem_snapshot is null and exists(select 1 from public.activity_subitems where user_id=new.user_id and root_activity_id=new.activity_id) then
      raise exception 'Configure subitems before planning' using errcode='23514';
    end if;
    new.completed_at := null;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.activity_id is distinct from old.activity_id or new.created_at is distinct from old.created_at then
      raise exception 'Plan identity is immutable' using errcode = '23514';
    end if;
    if new.planned_date is distinct from old.planned_date
      and (old.completed_at is not null or new.completed_at is not null) then
      raise exception 'Completed plans cannot be rescheduled' using errcode = '23514';
    end if;
    if new.completed_at is not null then
      new.completed_at := coalesce(old.completed_at, clock_timestamp());
    end if;
    -- Preserve full microsecond precision and make every accepted write a new snapshot.
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  if new.subitem_snapshot is not null then
    if tg_op='UPDATE' and new.subitem_snapshot is not distinct from old.subitem_snapshot and new.completed_at is distinct from old.completed_at then
      select jsonb_agg(case when (value->>'selected')::boolean then value||jsonb_build_object('completedAt',to_jsonb(new.completed_at)) else value end order by ordinality)
        into new.subitem_snapshot from jsonb_array_elements(new.subitem_snapshot) with ordinality;
    end if;
    new.subitem_snapshot:=routine_private.normalize_plan_subitems(new.subitem_snapshot);
    select coalesce(sum((value->>'plannedMinutes')::bigint),0),count(*) filter(where (value->>'selected')::boolean),
      coalesce(bool_and(value->'completedAt'<>'null'::jsonb) filter(where (value->>'selected')::boolean),false)
      into total,selected_count,all_done from jsonb_array_elements(new.subitem_snapshot) where value->>'parentId' is null;
    if total>2147483647 then raise exception 'Duration overflow' using errcode='23514';end if;
    new.planned_duration_minutes:=total;
    if selected_count>0 then new.completed_at:=case when all_done then coalesce(new.completed_at,clock_timestamp()) else null end;end if;
  end if;
  return new;
end $$;



create or replace function public.get_activity_aggregate(p_activity_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare a uuid := p_activity_id; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
select case when x.child_selection_mode='all' and not exists(select 1 from public.activity_subitems where user_id=x.user_id and root_activity_id=x.id) then '{}'::jsonb else jsonb_build_object('subitem_tree',jsonb_build_object('mode',x.child_selection_mode,'items',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'parentId',s.parent_id,'name',s.name,'durationMinutes',s.duration_minutes,'sortOrder',s.sort_order,'active',s.active,'defaultSelected',s.default_selected) order by s.sort_order,s.id) from public.activity_subitems s where s.user_id=x.user_id and s.root_activity_id=x.id),'[]'::jsonb))) end || jsonb_build_object('activity',to_jsonb(x),
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
end $$;


-- Schema review: new owner table cascades through activities; existing Auth safeguards retained.
create or replace function routine_private.before_account_delete() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare actual text[];
begin
  if tg_relid<>'auth.users'::regclass or tg_op<>'DELETE' then
    raise exception 'Invalid deletion context' using errcode='42501';
  end if;
  -- Future owned tables must be reviewed before account deletion can omit their data.
  select array_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname) into actual
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','routine_private')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped);
  if actual is distinct from array[
    'public.activities','public.activity_subitems','public.areas','public.commitment_configs','public.daily_plan_items',
    'public.financial_transactions','public.fixed_expense_months','public.fixed_expenses',
    'public.fixed_schedules','public.goals','public.ideas','public.planning_contexts',
    'public.project_tasks','public.projects','public.recurrence_rules','public.reminder_configs','public.time_windows'
  ]::text[] then
    raise exception 'Account deletion requires schema review' using errcode='23503';
  end if;
  delete from public.daily_plan_items where user_id=old.id;
  -- Break only this user's circular payment link before removing both sides.
  update public.fixed_expense_months set paid_at=null,financial_transaction_id=null
    where user_id=old.id and financial_transaction_id is not null;
  delete from public.financial_transactions where user_id=old.id;
  delete from public.fixed_expense_months where user_id=old.id;
  delete from public.fixed_expenses where user_id=old.id;
  delete from public.ideas where user_id=old.id;
  delete from public.projects where user_id=old.id; -- tasks cascade
  delete from public.activities where user_id=old.id; -- seven child tables cascade
  delete from public.areas where user_id=old.id;
  -- Drain deferred invoker aggregate checks while still inside this trusted context.
  set constraints all immediate;
  return old;
end $$;
