-- Repair a partially applied 02000200 patch without depending on stored source formatting.
-- Preserve the existing invoker, signature, ACLs, ownership and save/sync contract.
create or replace function public.save_activity_v05(
  p_activity jsonb,
  p_relations jsonb,
  p_expected_revision integer,
  p_tree jsonb,
  p_deleted_ids uuid[],
  p_checklist jsonb
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  saved jsonb;
  old_def jsonb;
  new_def jsonb;
  tokens jsonb := '{}'::jsonb;
  key_id uuid := (p_activity->>'id')::uuid;
  u uuid := auth.uid();
begin
  -- Lock and capture the previous definition and occurrence CAS tokens BEFORE
  -- any aggregate, subitem, checklist or revision changes.
  perform 1 from public.activities where id=key_id and user_id=u for update;

  select jsonb_build_object(
    'name',a.name,'type',a.type,'mode',a.goal_tracking_mode,'items',a.checklist_items,
    'goals',(
      select coalesce(jsonb_agg(
        to_jsonb(g)-array['user_id','activity_id','created_at','updated_at']
        order by g.sort_position,g.id
      ),'[]'::jsonb)
      from public.goals g where g.activity_id=a.id and g.user_id=a.user_id
    )
  ) into old_def
  from public.activities a where a.id=key_id and a.user_id=u;

  select coalesce(jsonb_object_agg(id::text,updated_at::text),'{}'::jsonb)
    into tokens
  from public.daily_plan_items
  where activity_id=key_id and user_id=u and completed_at is null
    and planned_date >= (transaction_timestamp() at time zone 'America/Sao_Paulo')::date;

  if cardinality(p_deleted_ids)>0 then
    saved:=public.save_activity_with_subitem_deletions(
      p_activity,p_relations,p_expected_revision,p_tree,p_deleted_ids
    );
  elsif p_tree is not null then
    saved:=public.save_activity_with_subitems(p_activity,p_relations,p_expected_revision,p_tree);
  else
    saved:=public.save_activity_aggregate(p_activity,p_relations,p_expected_revision);
  end if;

  perform public.save_activity_checklist(
    (saved->'activity'->>'id')::uuid,
    (saved->'activity'->>'revision')::integer,
    p_checklist
  );

  key_id:=(saved->'activity'->>'id')::uuid;
  select jsonb_build_object(
    'name',a.name,'type',a.type,'mode',a.goal_tracking_mode,'items',a.checklist_items,
    'goals',(
      select coalesce(jsonb_agg(
        to_jsonb(g)-array['user_id','activity_id','created_at','updated_at']
        order by g.sort_position,g.id
      ),'[]'::jsonb)
      from public.goals g where g.activity_id=a.id and g.user_id=a.user_id
    )
  ) into new_def
  from public.activities a where a.id=key_id and a.user_id=u;

  -- Preserve creation semantics: NULL old_def differs from the new object;
  -- the empty token object makes synchronization a safe no-op without plans.
  if old_def is distinct from new_def then
    perform public.sync_open_activity_plans(
      key_id,(select revision from public.activities where id=key_id and user_id=u),tokens
    );
  end if;
  return public.get_activity_aggregate((saved->'activity'->>'id')::uuid);
end $$;
