import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {withStubs}=require('../helpers/load-with-stubs.cjs');
const {owner:A,fixture}=require('../helpers/data-fixtures.cjs');
const {createAreaRepository}=load('lib/banco-mestre/data/area-repository.ts');
const {createBancoMestreRepository}=load('lib/banco-mestre/data/repository.ts');
const B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
// PostgREST returns timestamp strings. PGlite normally decodes them as JS Dates
// (milliseconds), so recover the exact SQL text in this test-only transport.
const transport={async query(sql,params){
  const result=await db.query(sql,params);
  for(const row of result.rows)if(Object.hasOwn(row,'updated_at')) {
    const raw=(await db.query('select created_at::text c, updated_at::text u from areas where id=$1',[row.id])).rows[0];
    const iso=value=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
    row.updated_at=iso(raw.u);row.created_at=iso(raw.c);
  }
  return result;
}};
const client=pgliteClient(transport,['areas']);
const repo=createAreaRepository(client,A);
const snapshot=({name,active,sortPosition,updatedAt})=>({name,active,sortPosition,updatedAt});
const kind=name=>e=>e.kind===name;
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const create=name=>repo.createArea({id:crypto.randomUUID(),name});
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${A}'),('${B}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await user();
});
after(async()=>db.close());
test('areas repository creates with defaults, allows duplicate names, preserves exact timestamps and detects stale writes',async()=>{
  const original=await create(' Nome ');assert.equal(original.name,'Nome');assert.equal(original.active,true);assert.equal(original.sortPosition,0);
  await create('Nome');
  await assert.rejects(()=>repo.createArea({id:original.id,name:'Another'}),kind('Conflict'));
  const renamed=await repo.renameArea({id:original.id,name:' Renamed ',expected:snapshot(original)});
  assert.equal(renamed.id,original.id);assert.equal(renamed.name,'Renamed');assert.equal(renamed.sortPosition,0);
  await assert.rejects(()=>repo.setAreaActive({id:original.id,active:false,expected:snapshot(original)}),kind('Conflict'));
  const inactive=await repo.setAreaActive({id:original.id,active:false,expected:snapshot(renamed)});assert.equal(inactive.active,false);
  const active=await repo.setAreaActive({id:original.id,active:true,expected:snapshot(inactive)});assert.equal(active.active,true);
  assert.equal((await repo.listManagedAreas()).find(a=>a.id===active.id).updatedAt,active.updatedAt);
});
test('every snapshot field participates in SQL precondition, with no partial changes',async()=>{
  const area=await create('Snapshot');
  for(const patch of [{name:'Wrong'},{active:false},{sortPosition:1},{updatedAt:'2000-01-01T00:00:00.123456Z'}]) {
    await assert.rejects(()=>repo.renameArea({id:area.id,name:'Must not persist',expected:{...snapshot(area),...patch}}),kind('Conflict'));
    assert.deepEqual((await repo.listManagedAreas()).find(a=>a.id===area.id),area);
  }
  await assert.rejects(()=>repo.renameArea({id:crypto.randomUUID(),name:'Missing',expected:snapshot(area)}),kind('NotFound'));
});
test('RLS still denies cross-owner and anon writes, and DELETE is not granted',async()=>{
  const area=await create('Account A');
  await user(B);const other=createAreaRepository(client,B);
  assert.deepEqual(await other.listManagedAreas(),[]);
  await assert.rejects(()=>other.renameArea({id:area.id,name:'Foreign',expected:snapshot(area)}),kind('NotFound'));
  await assert.rejects(()=>other.setAreaActive({id:area.id,active:false,expected:snapshot(area)}),kind('NotFound'));
  // Supplying a forged trusted context cannot bypass database ownership.
  await assert.rejects(()=>repo.createArea({id:crypto.randomUUID(),name:'Forged owner'}),kind('Unauthorized'));
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
  await assert.rejects(()=>repo.listManagedAreas(),kind('Unauthorized'));
  await assert.rejects(()=>repo.createArea({id:crypto.randomUUID(),name:'Anon'}),kind('Unauthorized'));
  await user();await assert.rejects(()=>db.query('delete from areas where id=$1',[area.id]),e=>e.code==='42501');
  assert.deepEqual((await repo.listManagedAreas()).find(a=>a.id===area.id),area);
});
test('inactivation preserves existing activity and association, blocks new association, reactivation restores it',async()=>{
  const area=await create('Linked');
  const activities=createBancoMestreRepository(pgliteClient(db,['activities','areas']));
  const bundle=fixture('academia');bundle.activity.areaId=area.id;
  const saved=await activities.saveActivity(bundle);
  const inactive=await repo.setAreaActive({id:area.id,active:false,expected:snapshot(area)});
  const after=await activities.getActivity(saved.bundle.activity.id);assert.deepEqual(after,saved);
  await activities.saveActivity({...after.bundle,activity:{...after.bundle.activity,name:'Still linked'}},after.revision);
  const another={...bundle,activity:{...bundle.activity,id:crypto.randomUUID()},goals:[],rules:[],windows:[]};
  await assert.rejects(()=>activities.saveActivity(another),kind('Validation'));
  await repo.setAreaActive({id:area.id,active:true,expected:snapshot(inactive)});
  await activities.saveActivity(another);
});

test('received creation UUID is persisted and rename preserves inactive state, identity, order and creation timestamp',async()=>{
  const id=crypto.randomUUID();
  const created=await repo.createArea({id,name:'  Área recebida  '});
  assert.equal(created.id,id);assert.equal(created.name,'Área recebida');
  assert.equal((await db.query('select id,name,user_id from areas where id=$1',[id])).rows[0].user_id,A);
  // Synthetic existing data with non-default order; no production order command.
  await db.query('update areas set active=false,sort_position=37 where id=$1',[id]);
  const original=(await repo.listManagedAreas()).find(area=>area.id===id);
  assert.equal(original.active,false);
  const before=(await db.query('select created_at::text created from areas where id=$1',[id])).rows[0].created;
  const renamed=await repo.renameArea({id,name:'  Renomeada  ',expected:snapshot(original)});
  assert.deepEqual({id:renamed.id,active:renamed.active,sortPosition:renamed.sortPosition},{id,active:false,sortPosition:37});
  assert.equal(renamed.name,'Renomeada');
  assert.equal((await db.query('select created_at::text created from areas where id=$1',[id])).rows[0].created,before);
  assert.deepEqual((await repo.listManagedAreas()).find(area=>area.id===id),renamed);
});

test('setActive applies the explicit requested value even when it already matches current state',async()=>{
  let area=await create('Explicit state');
  for(const active of [false,false,true,true]) {
    area=await repo.setAreaActive({id:area.id,active,expected:snapshot(area)});
    assert.equal(area.active,active);assert.equal(area.sortPosition,0);
    assert.equal((await db.query('select active from areas where id=$1',[area.id])).rows[0].active,active);
  }
});

test('authenticated area actions use real repository/SQL and invalidate only confirmed writes',async()=>{
  let session=A;const invalidated=[];
  const actions=withStubs('app/banco-mestre/area-actions.ts',{
    'next/cache':{revalidatePath:(...args)=>invalidated.push(args)},
    '@/lib/supabase/server':{createClient:async()=>({...client,auth:{getClaims:async()=>({data:{claims:{sub:session}},error:null})}})},
    '@/lib/banco-mestre/data/area-repository':{createAreaRepository},
    '@/lib/banco-mestre/data/area-validation':load('lib/banco-mestre/data/area-validation.ts'),
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
  });
  await user(A);
  const id=crypto.randomUUID();const created=await actions.createMasterArea({id,name:' Action area '});
  assert.equal(created.ok,true);assert.equal(created.area.id,id);assert.equal(created.area.name,'Action area');assert.equal(invalidated.length,5);
  invalidated.length=0;
  const edited=await actions.renameMasterArea({id,name:'Renamed by action',expected:snapshot(created.area)});
  assert.equal(edited.ok,true);assert.equal(invalidated.length,5);invalidated.length=0;
  assert.equal((await actions.setMasterAreaActive({id,active:false,expected:snapshot(created.area)})).kind,'Conflict');
  assert.equal(invalidated.length,0);
  await user(B);session=B;
  assert.equal((await actions.renameMasterArea({id,name:'Foreign action',expected:snapshot(edited.area)})).kind,'NotFound');
  assert.equal(invalidated.length,0);
  session=null;
  assert.equal((await actions.createMasterArea({id:crypto.randomUUID(),name:'Expired'})).kind,'Unauthorized');
  assert.equal(invalidated.length,0);
  await user(A);session=A;
  const inactive=await actions.setMasterAreaActive({id,active:false,expected:snapshot(edited.area)});
  assert.equal(inactive.ok,true);assert.equal(inactive.area.active,false);assert.equal(invalidated.length,5);
});
