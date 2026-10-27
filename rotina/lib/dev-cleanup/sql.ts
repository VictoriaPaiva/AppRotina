// Temporary, local development tool. No migration, installed function or permission change.
export const CLEANUP_TABLES = [
  'daily_plan_items','ideas','project_tasks','projects','financial_transactions','fixed_expense_months','fixed_expenses',
  'time_windows','reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','activities','areas',
] as const;
export const CLEANUP_PROJECT_REF = 'zkaufspoigruofdillts'; // Audited Rotina - Desenvolvimento only.
export const CLEANUP_PHRASE = 'APAGAR MEUS DADOS DE TESTE';
export interface CleanupSnapshot {
  counts: Record<string, number>;
  ownerState: Record<string, {count: number; digest: string}>;
  structure: string;
}
export interface CleanupReport extends CleanupSnapshot {
  otherCounts: Record<string, number>;
  otherAccounts: number;
  accountPreserved: boolean;
  othersUnchanged: boolean;
  structureUnchanged: boolean;
  allZero: boolean;
  executed: boolean;
}
const tables = `array[${CLEANUP_TABLES.map(table=>`'${table}'`).join(',')}]::text[]`;
const structureQuery = `select md5(jsonb_build_object(
  'tables',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','routine_private') and c.relkind in ('r','p','v','m','S')),
  'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
    from pg_class c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where c.relnamespace in ('public'::regnamespace,'routine_private'::regnamespace) and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_array(conname,conrelid,pg_get_constraintdef(oid)) order by conrelid,conname)
    from pg_constraint where connamespace in ('public'::regnamespace,'routine_private'::regnamespace)),
  'indexes',(select jsonb_agg(indexdef order by schemaname,indexname) from pg_indexes where schemaname in ('public','routine_private')),
  'functions',(select jsonb_agg(jsonb_build_array(oid,pg_get_functiondef(oid),proacl::text) order by oid)
    from pg_proc where pronamespace in ('public'::regnamespace,'routine_private'::regnamespace) and prokind='f'),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p where p.polrelid in (select oid from pg_class where relnamespace='public'::regnamespace)),
  'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgrelid,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace),
  'migrations',migration_state)::text) into structure;`;
const capture = `
  owner_state:='{}'::jsonb; other_state:='{}'::jsonb; counts:='{}'::jsonb; other_counts:='{}'::jsonb;
  foreach target in array ${tables} loop
    execute format('select jsonb_build_object(''count'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),''''))) from public.%I t where t.user_id=auth.uid()',target) into state;
    owner_state:=owner_state||jsonb_build_object(target,state); counts:=counts||jsonb_build_object(target,state->'count');
    execute format('select jsonb_build_object(''count'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),''''))) from public.%I t where t.user_id<>auth.uid()',target) into state;
    other_state:=other_state||jsonb_build_object(target,state); other_counts:=other_counts||jsonb_build_object(target,state->'count');
  end loop;
  select md5(coalesce(string_agg(md5(to_jsonb(u)::text),'' order by u.id),'')),count(*) filter(where id=auth.uid()),count(*) filter(where id<>auth.uid())
    into auth_state,own_accounts,other_accounts from auth.users u;
  migration_state:='absent';
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select md5(coalesce(string_agg(md5(to_jsonb(m)::text),'''' order by md5(to_jsonb(m)::text)),'''')) from supabase_migrations.schema_migrations m' into migration_state;
  end if;
  ${structureQuery}
`;
function actorUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw Error('Invalid verified actor');
  return value.toLowerCase();
}
function quote(value: string) {return "'"+value.replaceAll("'","''")+"'";}
export function cleanupSql(verifiedActor: string, expected?: CleanupSnapshot): string {
  const actor=actorUuid(verifiedActor);
  const deletion = expected ? `
    if owner_state<>${quote(JSON.stringify(expected.ownerState))}::jsonb or structure<>${quote(expected.structure)} then
      raise exception 'CLEANUP_STALE_PREVIEW';
    end if;
    before_others:=other_state; before_auth:=auth_state; before_structure:=structure;
    -- Break only this owner's monthly payment link before deleting both sides of the cycle.
    update public.fixed_expense_months set paid_at=null,financial_transaction_id=null
      where user_id=auth.uid() and (paid_at is not null or financial_transaction_id is not null);
    foreach target in array ${tables} loop
      execute format('delete from public.%I where user_id=auth.uid()',target);
    end loop;
    -- Aggregate constraints run after the parent and all its children have been removed.
    set constraints all immediate;
    ${capture}
    if exists(select 1 from jsonb_each_text(counts) value where value.value::bigint<>0) then raise exception 'CLEANUP_NONZERO'; end if;
    if other_state<>before_others or auth_state<>before_auth or own_accounts<>1 or structure<>before_structure then
      raise exception 'CLEANUP_INVARIANT_FAILED';
    end if;
  ` : '';
  return `begin${expected ? '' : ' isolation level repeatable read read only'};
set local lock_timeout='3s';
set local statement_timeout='15s';
set local timezone='UTC';
set local search_path=pg_catalog,public;
do $cleanup$
declare target text; actual text[]; state jsonb; counts jsonb; other_counts jsonb; owner_state jsonb; other_state jsonb;
  auth_state text; structure text; migration_state text; own_accounts bigint; other_accounts bigint;
  before_others jsonb; before_auth text; before_structure text;
begin
  perform set_config('request.jwt.claim.sub','${actor}',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub','${actor}','role','authenticated')::text,true);
  if auth.uid() is distinct from '${actor}'::uuid then raise exception 'CLEANUP_NO_ACTOR'; end if;
  -- Any unreviewed app table (including paused progress) blocks this tool.
  select array_agg(c.relname::text order by c.relname) into actual
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','m','f') and n.nspname in ('public','routine_private');
  if actual is distinct from (select array_agg(t order by t) from unnest(${tables}) t) then raise exception 'CLEANUP_UNKNOWN_TABLES'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','m','f') and n.nspname not in ('public','routine_private','auth','storage','realtime','vault','supabase_migrations','extensions','graphql','graphql_public','information_schema')
    and n.nspname not like 'pg_%') then raise exception 'CLEANUP_UNKNOWN_SCHEMA'; end if;
  if exists(select 1 from pg_constraint k join pg_class parent on parent.oid=k.confrelid
    where k.contype='f' and parent.relnamespace='public'::regnamespace and parent.relname=any(${tables})
    and not (k.conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname=any(${tables})))) then raise exception 'CLEANUP_EXTERNAL_DEPENDENCY'; end if;
  foreach target in array ${tables} loop
    if not exists(select 1 from pg_class c join pg_attribute a on a.attrelid=c.oid
      where c.relnamespace='public'::regnamespace and c.relname=target and c.relrowsecurity and a.attname='user_id' and a.atttypid='uuid'::regtype and a.attnotnull and not a.attisdropped) then
      raise exception 'CLEANUP_BAD_OWNER_TABLE';
    end if;
    ${expected ? "execute format('lock table public.%I in share row exclusive mode',target);" : ''}
  end loop;
  ${capture}
  if own_accounts<>1 then raise exception 'CLEANUP_ACCOUNT_MISSING'; end if;
  ${deletion}
  perform set_config('routine.cleanup_report',jsonb_build_object('counts',counts,'otherCounts',other_counts,'otherAccounts',other_accounts,
    'ownerState',owner_state,'structure',structure,'accountPreserved',own_accounts=1,'othersUnchanged',${!!expected},
    'structureUnchanged',${!!expected},'allZero',not exists(select 1 from jsonb_each_text(counts) value where value.value::bigint<>0),'executed',${!!expected})::text,true);
end $cleanup$;
select current_setting('routine.cleanup_report')::jsonb as report;
commit;`;
}
