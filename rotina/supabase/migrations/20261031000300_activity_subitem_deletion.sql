-- Explicit, atomic branch deletion during aggregate save. Historical JSON
-- snapshots have no FK to definitions and are deliberately never updated here.
create function public.delete_activity_subitem_branches(
  p_activity_id uuid,p_expected_revision integer,p_deleted_ids uuid[]
) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); a public.activities; total bigint; next_revision integer;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501';end if;
  select * into a from public.activities where id=p_activity_id and user_id=u for update;
  if not found then raise exception 'Unavailable activity' using errcode='23503';end if;
  if a.revision is distinct from p_expected_revision then raise exception 'Stale tree' using errcode='40001';end if;
  if p_deleted_ids is null or cardinality(p_deleted_ids)=0
    or cardinality(p_deleted_ids)<>(select count(distinct id) from unnest(p_deleted_ids) id)
    then raise exception 'Invalid deletion' using errcode='23514';end if;
  -- Every requested ID must currently belong to this account AND this tree.
  if cardinality(p_deleted_ids)<>(select count(*) from public.activity_subitems
    where user_id=u and root_activity_id=a.id and id=any(p_deleted_ids))
    then raise exception 'Unavailable subitem' using errcode='23503';end if;
  -- Require explicit consent for all descendants; never silently cascade a
  -- retained node. Immediate closure implies closure at every depth.
  if exists(select 1 from public.activity_subitems where user_id=u and root_activity_id=a.id
    and parent_id=any(p_deleted_ids) and not(id=any(p_deleted_ids)))
    then raise exception 'Delete the complete branch explicitly' using errcode='23514';end if;
  delete from public.activity_subitems where user_id=u and root_activity_id=a.id and id=any(p_deleted_ids);
  with recursive t as (
    select s.* from public.activity_subitems s where s.user_id=u and s.root_activity_id=a.id and s.parent_id is null and s.active
    union all select s.* from public.activity_subitems s join t on s.parent_id=t.id where s.user_id=u and s.root_activity_id=a.id and s.active
  ) select coalesce(sum(t.duration_minutes),0) into total from t
    where not exists(select 1 from public.activity_subitems c where c.user_id=u and c.root_activity_id=a.id and c.parent_id=t.id);
  if total>2147483647 then raise exception 'Duration overflow' using errcode='23514';end if;
  update public.activities set duration_mode=case when total>0 then 'fixed' else 'unknown' end,
    duration_minutes=case when total>0 then total::integer else null end,min_duration_minutes=null,ideal_duration_minutes=null
    where id=a.id and user_id=u returning revision into next_revision;
  return next_revision;
end $$;
revoke all on function public.delete_activity_subitem_branches(uuid,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.delete_activity_subitem_branches(uuid,integer,uuid[]) to authenticated;

-- Only the narrow deletion helper is elevated. The aggregate continues to run
-- as the caller, preserving its existing RLS and admission behavior.
create function public.save_activity_with_subitem_deletions(
  p_activity jsonb,p_relations jsonb,p_expected_revision integer,p_tree jsonb,p_deleted_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare next_revision integer;
begin
  if jsonb_typeof(p_tree) is distinct from 'object' or jsonb_typeof(p_tree->'items') is distinct from 'array'
    then raise exception 'Invalid tree' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(p_tree->'items') n
    where (n->>'id')::uuid=any(p_deleted_ids) or (n->>'parentId')::uuid=any(p_deleted_ids))
    then raise exception 'Deleted branch is still present' using errcode='23514';end if;
  next_revision:=public.delete_activity_subitem_branches((p_activity->>'id')::uuid,p_expected_revision,p_deleted_ids);
  -- Any validation/save failure rolls deletion and revision back as well.
  return public.save_activity_with_subitems(p_activity,p_relations,next_revision,p_tree);
end $$;
revoke all on function public.save_activity_with_subitem_deletions(jsonb,jsonb,integer,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.save_activity_with_subitem_deletions(jsonb,jsonb,integer,jsonb,uuid[]) to authenticated;
