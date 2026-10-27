-- Read-only catalog audit. Does not select personal rows or perform cleanup.
begin read only;
select jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,
    'owner_column',exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped)))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','m','f') and n.nspname in ('public','routine_private')),
  'foreign_keys', (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)))
    from pg_constraint c where c.contype='f' and (c.connamespace in ('public'::regnamespace,'routine_private'::regnamespace)
      or c.confrelid in (select oid from pg_class where relnamespace='public'::regnamespace))),
  'triggers', (select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace),
  'schemas', (select jsonb_agg(nspname order by nspname) from pg_namespace where nspname not like 'pg_%' and nspname<>'information_schema')
) as audit;
commit;
