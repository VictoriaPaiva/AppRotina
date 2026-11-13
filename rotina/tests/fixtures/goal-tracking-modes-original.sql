-- One Meta / Checklist block, two explicit modes; existing data is retained.
alter table public.activities add column goal_tracking_mode text not null default 'checklist'
  check(goal_tracking_mode in ('quantity','checklist'));
-- Existing textual definitions take precedence; old numeric definitions reopen as quantity.
update public.activities set goal_tracking_mode='quantity'
where type='checklistGoal' and checklist_items='[]'::jsonb
  and exists(select 1 from public.goals g where g.activity_id=activities.id and g.user_id=activities.user_id);
grant insert(goal_tracking_mode),update(goal_tracking_mode) on public.activities to authenticated;

alter table public.daily_plan_items add column goal_tracking_mode_snapshot text check(goal_tracking_mode_snapshot in ('quantity','checklist'));

do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_activity_aggregate(jsonb,jsonb,integer)'::regprocedure) into definition;
  if position('Unknown or protected activity field' in definition)=0 then raise exception 'Unexpected aggregate contract';end if;
  definition:=replace(definition,'''ideal_duration_minutes'') then','''ideal_duration_minutes'',''goal_tracking_mode'') then');
  definition:=replace(definition,'min_duration_minutes,ideal_duration_minutes)','min_duration_minutes,ideal_duration_minutes,goal_tracking_mode)');
  definition:=replace(definition,'incoming.min_duration_minutes,incoming.ideal_duration_minutes);',
    'incoming.min_duration_minutes,incoming.ideal_duration_minutes,coalesce(p_activity->>''goal_tracking_mode'',prior.goal_tracking_mode,''checklist''));');
  definition:=replace(definition,'ideal_duration_minutes=incoming.ideal_duration_minutes',
    'ideal_duration_minutes=incoming.ideal_duration_minutes,goal_tracking_mode=coalesce(p_activity->>''goal_tracking_mode'',prior.goal_tracking_mode,''checklist'')');
  execute definition;
  select pg_get_functiondef('routine_private.guard_daily_plan_item()'::regprocedure) into definition;
  if position('if a.type=''checklistGoal'' then'||chr(10)||'      select' in definition)=0 then raise exception 'Unexpected snapshot contract';end if;
  definition:=replace(definition,'if a.type=''checklistGoal'' then'||chr(10)||'      select',
    'if a.type=''checklistGoal'' and a.goal_tracking_mode=''checklist'' then'||chr(10)||'      select');
  definition:=replace(definition,'new.activity_type_snapshot:=a.type;','new.activity_type_snapshot:=a.type;new.goal_tracking_mode_snapshot:=case when a.type=''checklistGoal'' then a.goal_tracking_mode else null end;');
  definition:=replace(definition,'new.id is distinct from old.id or','new.goal_tracking_mode_snapshot is distinct from old.goal_tracking_mode_snapshot or new.id is distinct from old.id or');
  execute definition;
end $$;
