import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {fixture,owner:A}=require('../helpers/data-fixtures.cjs');
const {saveBancoMestreActivity}=load('lib/banco-mestre/data/write-model.ts');
const {createBancoMestreRepository}=load('lib/banco-mestre/data/repository.ts');
const B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();const client=pgliteClient(db,['areas','activities','goals']);
const repo=createBancoMestreRepository(client),factory=async()=>repo;
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function create(name='academia') {
  const bundle=fixture(name);
  await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[bundle.activity.areaId,A,'Technical area']);
  const saved=await saveBancoMestreActivity(factory,{mode:'create',bundle});assert.equal(saved.ok,true);
  return repo.getActivity(saved.activityId);
}
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${A}'),('${B}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
});
beforeEach(async()=>{await db.exec('rollback');await user();});
after(async()=>{await db.close();});
test('write UI boundary -> repository -> SQL: create/edit/read five types with IDs and revision intact',async()=>{
  for(const name of ['aniversario-mae','dentista','trabalho','academia','escovar']) {
    const original=await create(name);
    const draft={...original.bundle,activity:{...original.bundle.activity,name:'Saved edit '+name,description:'Persisted description'}};
    if(draft.goals.length) draft.goals=draft.goals.map(g=>({...g,minimumTarget:1,idealTarget:undefined}));
    const edited=await saveBancoMestreActivity(factory,{mode:'edit',bundle:draft,expectedRevision:original.revision});
    assert.equal(edited.ok,true);assert.equal(edited.activityId,original.bundle.activity.id);assert(edited.revision>original.revision);
    const read=await repo.getActivity(edited.activityId);
    assert.equal(read.bundle.activity.name,draft.activity.name);assert.equal(read.bundle.activity.createdAt,original.bundle.activity.createdAt);
    assert.equal(read.revision,edited.revision);
    for(const relation of ['goals','rules','windows'])assert.deepEqual(read.bundle[relation].map(x=>x.id),original.bundle[relation].map(x=>x.id));
    const stale=await saveBancoMestreActivity(factory,{mode:'edit',bundle:{...draft,activity:{...draft.activity,name:'Stale overwrite'}},expectedRevision:original.revision});
    assert.equal(stale.ok,false);assert.equal(stale.kind,'Conflict');assert.deepEqual(await repo.getActivity(edited.activityId),read);
  }
});
test('SQL rejection rolls back master/children/revision; failed create leaves no partial aggregate',async()=>{
  const first=await create(),second=await create();
  const invalid={...first.bundle,activity:{...first.bundle.activity,name:'Must roll back'},goals:[{...first.bundle.goals[0],id:second.bundle.goals[0].id}]};
  const rejected=await saveBancoMestreActivity(factory,{mode:'edit',bundle:invalid,expectedRevision:first.revision});
  assert.equal(rejected.kind,'Validation');assert.deepEqual(await repo.getActivity(first.bundle.activity.id),first);assert.deepEqual(await repo.getActivity(second.bundle.activity.id),second);
  const missingArea=fixture('academia');
  const result=await saveBancoMestreActivity(factory,{mode:'create',bundle:missingArea});assert.equal(result.kind,'Validation');
  assert.equal((await db.query('select count(*)::int n from activities where id=$1',[missingArea.activity.id])).rows[0].n,0);
});
test('cross-account and anon writes are rejected by SQL/RLS, without changing A',async()=>{
  const original=await create();
  await user(B);
  const cross=await saveBancoMestreActivity(factory,{mode:'edit',bundle:{...original.bundle,activity:{...original.bundle.activity,name:'Foreign edit'}},expectedRevision:original.revision});
  assert.equal(cross.ok,false);assert.equal(cross.kind,'Conflict');
  const foreignArea={...original.bundle,activity:{...original.bundle.activity,id:crypto.randomUUID()},goals:[],rules:[],windows:[]};
  assert.equal((await saveBancoMestreActivity(factory,{mode:'create',bundle:foreignArea})).kind,'Validation');
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
  assert.equal((await saveBancoMestreActivity(factory,{mode:'edit',bundle:original.bundle,expectedRevision:original.revision})).kind,'Unauthorized');
  await user();assert.deepEqual(await repo.getActivity(original.bundle.activity.id),original);
});
test('repeating a create UUID after an uncertain response conflicts instead of duplicating',async()=>{
  const original=await create();
  const repeated=await saveBancoMestreActivity(factory,{mode:'create',bundle:original.bundle});assert.equal(repeated.kind,'Conflict');
  assert.equal((await db.query('select count(*)::int n from activities where id=$1',[original.bundle.activity.id])).rows[0].n,1);
});
