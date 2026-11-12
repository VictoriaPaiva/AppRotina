-- Meta / Checklist has one functional source: activities.checklist_items.
-- Numeric goals on old checklistGoal rows are retained as legacy metadata;
-- creating/editing checklist items must not require a second numeric goal.
-- Change only the duplicated minimum-goal admission clause. All other type,
-- ownership, conflict checks, invoker/definer modes and ACLs stay in place.
do $$
declare signature text; definition text;
  obsolete text:='or (k = ''checklistGoal'' and g = 0) ';
begin
  foreach signature in array array[
    'routine_private.assert_activity(uuid,uuid)',
    'routine_private.validate_aggregate()',
    'public.save_activity_aggregate(jsonb,jsonb,integer)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if (length(definition)-length(replace(definition,obsolete,'')))/length(obsolete)<>1 then
      raise exception 'Unexpected checklist admission contract: %',signature;
    end if;
    execute replace(definition,obsolete,'');
  end loop;
end $$;
