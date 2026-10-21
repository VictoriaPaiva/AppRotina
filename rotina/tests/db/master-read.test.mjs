import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {fixture,owner:A}=require('../helpers/data-fixtures.cjs');
const {createBancoMestreRepository}=load('lib/banco-mestre/data/repository.ts');
const {readBancoMestreList,readBancoMestreActivity}=load('lib/banco-mestre/data/read-model.ts');
const B='00000000-0000-4000-8000-000000000002';
const tables=['areas','activities','reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','time_windows'];
const db=new PGlite();
const client=pgliteClient(db,tables);
const readClient={from(table){return new Proxy(client.from(table),{get(target,key){assert(!['insert','update','delete','upsert'].includes(key),'Read path attempted DML');return Reflect.get(target,key);}});},rpc(name,args){assert.equal(name,'get_activity_aggregate');return client.rpc(name,args);}};
const factory=async()=>createBancoMestreRepository(readClient);
let fixtureA,fixtureB;
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function snapshot(){const result={};for(const table of tables)result[table]=(await db.query('select * from '+table+' order by '+(['reminder_configs','commitment_configs','planning_contexts'].includes(table)?'activity_id':'id'))).rows;return result;}
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${A}'),('${B}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await user();
  for(const name of ['aniversario-mae','dentista','trabalho','academia','escovar']) {
    const bundle=fixture(name);
    await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[bundle.activity.areaId,A,'Area A']);
    const saved=await createBancoMestreRepository(client).saveActivity(bundle);
    if(name==='academia') {
      fixtureA=await createBancoMestreRepository(client).saveActivity({...saved.bundle,activity:{...saved.bundle.activity,status:'inactive'}},saved.revision);
      await db.query('update areas set active=false where id=$1',[bundle.activity.areaId]);
    }
  }
  await user(B);const bundle=fixture('dentista');bundle.activity.name='Only B';
  await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[bundle.activity.areaId,B,'Area B']);
  fixtureB=await createBancoMestreRepository(client).saveActivity(bundle);
});
after(async()=>{await db.close();});
test('real SQL reads: five types, inactive data, complete direct detail, no mutations',async()=>{
  await user();const before=await snapshot();
  const result=await readBancoMestreList(factory);assert.equal(result.status,'ready');assert.equal(result.activities.length,5);
  assert.equal(new Set(result.activities.map(a=>a.type)).size,5);assert(result.activities.every(a=>!('config' in a)));
  assert(result.areas.some(a=>!a.active));assert(result.activities.some(a=>a.status==='inactive'));
  const detail=await readBancoMestreActivity(factory,fixtureA.bundle.activity.id);assert.equal(detail.status,'ready');assert.deepEqual(detail.item,fixtureA);
  for(const activity of result.activities)assert.equal((await readBancoMestreActivity(factory,activity.id)).status,'ready');
  assert.deepEqual(await snapshot(),before);
});
test('real SQL reads: cross-account/missing IDs unavailable; B sees only own rows; anon rejected',async()=>{
  await user();assert.equal((await readBancoMestreActivity(factory,fixtureB.bundle.activity.id)).kind,'NotFound');
  assert.equal((await readBancoMestreActivity(factory,crypto.randomUUID())).kind,'NotFound');
  await user(B);const before=await snapshot();
  const result=await readBancoMestreList(factory);assert.equal(result.status,'ready');assert.equal(result.activities.length,1);assert.equal(result.activities[0].name,'Only B');assert.deepEqual(result.areas.map(a=>a.name),['Area B']);
  assert.equal((await readBancoMestreActivity(factory,fixtureA.bundle.activity.id)).kind,'NotFound');
  assert.deepEqual(await snapshot(),before);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
  assert.equal((await readBancoMestreList(factory)).kind,'Unauthorized');
  assert.equal((await readBancoMestreActivity(factory,fixtureA.bundle.activity.id)).kind,'Unauthorized');
});
