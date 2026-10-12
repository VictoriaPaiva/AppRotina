import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

const db=new PGlite();
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const area='00000000-0000-4000-8000-000000000011';
const hardening='20261012000200_private_permissions_hardening.sql';
async function user(id=A) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
}
async function denied(sql,args=[]) {
  await assert.rejects(()=>db.query(sql,args),e=>e.code==='42501');
}
const goal={metric:'count',unit:'execution',minimum_target:1,period:'week',starts_on:'2026-10-12'};
const cases=[['reminder',{reminder_config:{reference_date:'2026-10-12'}}],
  ['commitment',{commitment_config:{date:'2026-10-12',start_time:'10:00',end_time:'11:00'},planning_context:{preparation_minutes:0}}],
  ['fixedActivity',{fixed_schedules:[{weekdays:[1,3],start_time:'08:00',end_time:'09:00'}]}],
  ['variableActivity',{goals:[goal]}],['checklistGoal',{goals:[goal]}]];
async function save(type,relations,prior) {
  const payload={name:'Permissões',type,area_id:area,...(prior?{id:prior.id}:{})};
  return (await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) as aggregate',[JSON.stringify(payload),JSON.stringify(relations),prior?.revision??null])).rows[0].aggregate;
}
const sensitive=[
  ["put_child('goals',$1,$2,'{}'::jsonb)",[area,A]],
  ["replace_children('goals',$1,$2,'[]'::jsonb)",[area,A]],
  ["replace_config('planning_contexts',$1,$2,'{}'::jsonb)",[area,A]],
  ['assert_activity($1,$2)',[area,A]],['read_aggregate($1)',[area]],
  ["json_integer('1'::jsonb)",[]],['stamp_row()',[]],['lock_parent()',[]],['touch_parent()',[]],['validate_aggregate()',[]],
];
before(async()=>{
  await db.exec(`create role authenticated nologin; create role anon nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${A}'),('${B}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    if(file===hardening) {
      // Aquecimento do plano antes de revogar: USAGE sozinho não é barreira suficiente.
      await user();
      await db.exec('prepare private_cached(uuid) as select routine_private.read_aggregate($1); execute private_cached(null);');
      await db.exec(`reset role;
        alter default privileges grant execute on functions to authenticated;
        alter default privileges in schema routine_private grant execute on functions to anon,authenticated;
        create schema other_defaults;
        alter default privileges in schema other_defaults grant execute on functions to authenticated;
        create role internal_owner nologin;
        grant usage,create on schema routine_private to internal_owner;
        set role internal_owner;
        create function routine_private.owner_permissions_probe() returns integer language sql as $$select 1$$;
        alter default privileges grant execute on functions to authenticated;
        alter default privileges in schema routine_private grant execute on functions to anon;
        reset role;`);
    }
    await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  }
  await user();
  await db.query('insert into public.areas(id,user_id,name) values ($1,$2,$3)',[area,A,'Área de teste']);
});
beforeEach(async()=>{await db.exec('rollback');await user();});
after(async()=>{await db.close();});

test('authenticated sem USAGE/CREATE; apenas três EXECUTE técnicos para CHECKs',async()=>{
  const acl=(await db.query("select has_schema_privilege('authenticated','routine_private','USAGE') as usage,has_schema_privilege('authenticated','routine_private','CREATE') as create")).rows[0];
  assert.deepEqual(acl,{usage:false,create:false});
  const rows=(await db.query("select proname,has_function_privilege('authenticated',oid,'EXECUTE') as exec,has_function_privilege('anon',oid,'EXECUTE') as anon,prosecdef from pg_proc where pronamespace='routine_private'::regnamespace")).rows;
  assert.deepEqual(rows.filter(r=>r.exec).map(r=>r.proname).sort(),['valid_date','valid_days','valid_time']);
  assert(rows.every(r=>!r.anon&&!r.prosecdef));
  for(const sql of ["select routine_private.valid_date(date '2026-10-12')","select routine_private.valid_time(time '09:00')","select routine_private.valid_days(array[1,2]::smallint[])"]) await denied(sql);
});
test('dez helpers internos diretamente bloqueados, inclusive plano preparado antes do hardening',async()=>{
  for(const [fn,args] of sensitive) await denied('select routine_private.'+fn,args);
  await assert.rejects(()=>db.exec('execute private_cached(null)'),e=>e.code==='42501');
});
test('EXECUTE sensível negado mesmo se USAGE for concedido temporariamente pelo administrador',async()=>{
  await db.exec('reset role; grant usage on schema routine_private to authenticated;');
  try {
    await user();
    for(const [fn,args] of sensitive) await denied('select routine_private.'+fn,args);
    await assert.rejects(()=>db.exec('execute private_cached(null)'),e=>e.code==='42501');
  } finally {await db.exec('reset role; revoke usage on schema routine_private from authenticated;');await user();}
});
test('somente RPCs públicas permitidas; PUBLIC/anon sem EXECUTE; invoker preservado',async()=>{
  const rows=(await db.query("select proname,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,has_function_privilege('anon',p.oid,'EXECUTE') as anon,prosecdef,(select count(*) from aclexplode(coalesce(proacl,acldefault('f',proowner))) where grantee=0 and privilege_type='EXECUTE')::int as public from pg_proc p where p.oid in ('public.save_activity_aggregate(jsonb,jsonb,integer)'::regprocedure,'public.get_activity_aggregate(uuid)'::regprocedure)")).rows;
  assert.equal(rows.length,2);assert(rows.every(r=>r.authenticated&&!r.anon&&!r.prosecdef&&r.public===0));
  await db.exec('reset role; set role anon');
  await denied('select public.get_activity_aggregate($1)',[area]);
  await denied("select public.save_activity_aggregate('{}'::jsonb,'{}'::jsonb,null)");
});
test('cria/edita/lê cinco tipos com filhas e revision, sem permissões para helpers sensíveis',async()=>{
  for(const [type,relations] of cases) {
    const created=await save(type,relations);
    const snapshot=structuredClone(relations);
    for(const table of ['fixed_schedules','goals']) if(created[table]?.length) snapshot[table]=created[table].map(({id,...row})=>{
      for(const key of ['activity_id','user_id','created_at','updated_at']) delete row[key];return {...row,id};
    });
    const edited=await save(type,snapshot,created.activity);
    assert.equal(edited.activity.type,type);assert.equal(edited.activity.id,created.activity.id);
    assert.equal(edited.activity.created_at,created.activity.created_at);assert(edited.activity.revision>created.activity.revision);
    assert.deepEqual((await db.query('select public.get_activity_aggregate($1) value',[created.activity.id])).rows[0].value,edited);
    assert.equal((await db.query("select has_schema_privilege('authenticated','routine_private','USAGE') as ok")).rows[0].ok,false);
  }
});
test('RLS/ownership permanecem sob invoker nas duas RPCs e em DML direto',async()=>{
  const created=await save('variableActivity',{});
  await user(B);
  assert.equal((await db.query('select public.get_activity_aggregate($1) as value',[created.activity.id])).rows[0].value,null);
  assert.equal((await db.query('select count(*)::int n from activities where id=$1',[created.activity.id])).rows[0].n,0);
  assert.equal((await db.query('update activities set name=$1 where id=$2 returning id',['Intruso',created.activity.id])).rows.length,0);
  await assert.rejects(()=>save('variableActivity',{},created.activity),e=>e.code==='40001');
  await assert.rejects(()=>save('variableActivity',{}),e=>e.code==='23503');
});
test('triggers/constraints diretos e revision funcionam sem EXECUTE concedido às trigger functions',async()=>{
  const created=await save('checklistGoal',{goals:[goal]});
  await db.query('update goals set minimum_target=2 where id=$1',[created.goals[0].id]);
  const revision=(await db.query('select revision from activities where id=$1',[created.activity.id])).rows[0].revision;
  assert(revision>created.activity.revision);
  await db.exec('begin');await db.query('delete from goals where activity_id=$1',[created.activity.id]);
  await assert.rejects(()=>db.exec('commit'),e=>e.code==='23514');await db.exec('rollback');
  assert.equal((await db.query('select revision from activities where id=$1',[created.activity.id])).rows[0].revision,revision);
  await assert.rejects(()=>db.query("update goals set starts_on='2026-10-12',ends_on='2026-10-11' where id=$1",[created.goals[0].id]),e=>e.code==='23514');
  await assert.rejects(()=>save('checklistGoal',{}, {...created.activity,revision}),e=>e.code==='23514');
  await assert.rejects(()=>save('checklistGoal',{goals:[goal]},{...created.activity,revision:created.activity.revision}),e=>e.code==='40001');
});
test('CHECKs por OID precisam de EXECUTE técnico; revogação isolada falha e não altera o agregado',async()=>{
  const created=await save('reminder',cases[0][1]);
  await db.exec('reset role; revoke execute on function routine_private.valid_date(date) from authenticated;');
  try {await user();await denied('update reminder_configs set reference_date=$1 where activity_id=$2',['2026-10-13',created.activity.id]);}
  finally {await db.exec('reset role; grant execute on function routine_private.valid_date(date) to authenticated;');await user();}
  assert.equal((await db.query('select public.get_activity_aggregate($1) value',[created.activity.id])).rows[0].value.activity.revision,created.activity.revision);
});
test('default privileges eliminam PUBLIC global e grants globais/locais antigos do owner',async()=>{
  await db.exec(`reset role;
    create function routine_private.future_permissions_probe() returns integer language sql as $$select 1$$;
    create function public.future_permissions_probe() returns integer language sql as $$select 1$$;`);
  const rows=(await db.query("select has_function_privilege('authenticated',oid,'EXECUTE') as auth,has_function_privilege('anon',oid,'EXECUTE') as anon,(select count(*) from aclexplode(coalesce(proacl,acldefault('f',proowner))) where grantee=0 and privilege_type='EXECUTE')::int as public from pg_proc where proname='future_permissions_probe'")).rows;
  assert.equal(rows.length,2);assert(rows.every(r=>!r.auth&&!r.anon&&r.public===0));
  await db.exec(`create function other_defaults.future_other_probe() returns integer language sql as $$select 1$$;
    set role internal_owner; create function routine_private.future_owner_probe() returns integer language sql as $$select 1$$; reset role;`);
  const scopes=(await db.query("select proname,pg_get_userbyid(proowner) as owner,has_function_privilege('authenticated',oid,'EXECUTE') as auth,has_function_privilege('anon',oid,'EXECUTE') as anon from pg_proc where proname in ('future_other_probe','future_owner_probe') order by proname")).rows;
  assert.deepEqual(scopes.map(r=>[r.proname,r.auth,r.anon]),[['future_other_probe',true,false],['future_owner_probe',false,false]]);
  assert.equal(scopes[1].owner,'internal_owner');
  await user();await denied('select routine_private.future_permissions_probe()');await denied('select public.future_permissions_probe()');
});
