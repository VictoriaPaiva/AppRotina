-- B.2A: uma leitura SQL consistente, com RLS, sem expor routine_private.
create function public.get_activity_aggregate(p_activity_id uuid) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- NULL para ausente ou pertencente a outro usuário, sem revelar existência.
  return routine_private.read_aggregate(p_activity_id);
end $$;
revoke all on function public.get_activity_aggregate(uuid) from public, anon;
grant execute on function public.get_activity_aggregate(uuid) to authenticated;
