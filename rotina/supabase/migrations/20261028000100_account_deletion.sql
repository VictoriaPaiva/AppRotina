-- Hard Auth deletion and functional cleanup share ONE PostgreSQL transaction.
-- Auth's managed role cannot run the existing invoker aggregate triggers alone.
-- No public RPC, client-selected UUID, grants to Auth role, or change to normal RLS.
create function routine_private.before_account_delete() returns trigger
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
    'public.activities','public.areas','public.commitment_configs','public.daily_plan_items',
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
revoke all on function routine_private.before_account_delete() from public,anon,authenticated;
create trigger routine_before_account_delete before delete on auth.users
  for each row execute function routine_private.before_account_delete();
