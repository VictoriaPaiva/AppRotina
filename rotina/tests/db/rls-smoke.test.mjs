import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {createRlsSmokeHarness,RLS_TABLES,rlsGoalPayload}=load('lib/banco-mestre/data/rls-smoke.ts');
const {owner:A}=require('../helpers/data-fixtures.cjs');
const B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
const client=pgliteClient(db,RLS_TABLES);
async function user(id=A) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
}
const args=(mode,fixture)=>({mode,activityId:fixture.activityId,expectedRevision:fixture.revision});
async function prepare(run) {await user();const r=await run(client,A,{mode:'prepare'});assert.equal(r.ok,true);return r.fixture;}
function assertSafe(report) {
  const serialized=JSON.stringify(report);
  for(const forbidden of [A,B,'user_id','claims','cookie','token','@','details','hint','secret']) assert(!serialized.includes(forbidden),forbidden);
}
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${A}'),('${B}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
});
after(async()=>{await db.close();});
test('harness A/B: cross RPC, direct UPDATE, both goal INSERTs denied; A verifies full baseline',async()=>{
  const run=createRlsSmokeHarness();
  const fixture=await prepare(run);
  assert.deepEqual(Object.keys(fixture).sort(),['activityId','expectedName','revision']);
  await user(B);
  // Populate B as well, so listing isolation is meaningful in both directions.
  const own=await run(client,B,{mode:'prepare'});assert.equal(own.ok,true);
  const attacked=await run(client,B,args('attack',fixture));assert.equal(attacked.ok,true);assertSafe(attacked);
  for(const key of ['crossReadDenied','rpcWriteDenied','directUpdateDenied','childInsertAsBRejected','childInsertAsARejected']) assert.equal(attacked.checks[key],true);
  assert.equal(attacked.codes.rpcWriteDenied,'PT409');
  assert(['23503','42501'].includes(attacked.codes.childInsertAsBRejected));
  assert(['23503','42501'].includes(attacked.codes.childInsertAsARejected));
  await user();
  const verified=await run(client,A,args('verify',fixture));assert.equal(verified.ok,true);assertSafe(verified);
  assert.equal(verified.checks.noUnexpectedChildren,true);
  // Reverse A -> B, then B verifies.
  assert.equal((await run(client,A,args('attack',own.fixture))).ok,true);
  await user(B);assert.equal((await run(client,B,args('verify',own.fixture))).ok,true);
});
test('anon cannot select any domain table or execute either RPC',async()=>{
  const run=createRlsSmokeHarness(),fixture=await prepare(run);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
  const result=await run(client,null,args('anon',fixture));assert.equal(result.ok,true);assertSafe(result);
  for(const table of RLS_TABLES) assert.equal(result.checks['anonSelect_'+table],true);
  assert.equal(result.codes.anonGetRpcDenied,'42501');assert.equal(result.codes.anonSaveRpcDenied,'42501');
});
test('goal payload succeeds on owner variableActivity: cross rejection is not a format error',async()=>{
  const run=createRlsSmokeHarness(),fixture=await prepare(run);
  const payload=rlsGoalPayload(fixture.activityId,A);
  const inserted=await client.from('goals').insert(payload).select('id');
  assert.equal(inserted.error,null);assert.equal(inserted.data[0].id,payload.id);
  const verify=await run(client,A,args('verify',fixture));assert.equal(verify.ok,false);assert.equal(verify.failedCheck,'revisionUnchanged');
});
test('verify detects changed name, deleted fixture and extra child even if revision is reset',async()=>{
  for(const mutation of ['name','delete','child']) {
    const run=createRlsSmokeHarness(),fixture=await prepare(run);
    if(mutation==='name') await client.from('activities').update({name:'changed'}).eq('id',fixture.activityId).select('id');
    if(mutation==='delete') {await db.exec('reset role');await db.query('delete from activities where id=$1',[fixture.activityId]);await user();}
    if(mutation==='child') {
      await client.from('goals').insert(rlsGoalPayload(fixture.activityId,A)).select('id');
      // Simulate tampering with revision as administrator; keep aggregate comparison meaningful.
      await db.exec('reset role;alter table activities disable trigger a_stamp');
      await db.query('update activities set revision=$1 where id=$2',[fixture.revision,fixture.activityId]);
      await db.exec('alter table activities enable trigger a_stamp');await user();
    }
    const result=await run(client,A,args('verify',fixture));assert.equal(result.ok,false);
    assert.equal(result.failedCheck,{name:'nameUnchanged',delete:'fixtureExists',child:'aggregateUnchanged'}[mutation]);assertSafe(result);
  }
});
test('fixture scope, revision, owner, completed attack and expiry are enforced',async()=>{
  const run=createRlsSmokeHarness(),fixture=await prepare(run);
  await assert.rejects(()=>run(client,A,args('attack',fixture)),e=>e.kind==='Validation');
  await user(B);await assert.rejects(()=>run(client,B,args('verify',fixture)),e=>e.kind==='Validation');
  await assert.rejects(()=>run(client,B,{...args('attack',fixture),expectedRevision:fixture.revision+1}),e=>e.kind==='Validation');
  await assert.rejects(()=>createRlsSmokeHarness()(client,B,args('attack',fixture)),e=>e.kind==='Validation');
  await user();const incomplete=await run(client,A,args('verify',fixture));assert.equal(incomplete.failedCheck,'attackCompleted');
  const originalNow=Date.now;Date.now=()=>originalNow()+61*60*1000;
  try {await assert.rejects(()=>run(client,A,args('verify',fixture)),e=>e.kind==='Validation');}finally{Date.now=originalNow;}
});
test('unexpected RPC denial/format failure does not pass; successful direct write stops before child inserts',async()=>{
  for(const scenario of ['rpcSuccess','formatError','updateSuccess','childSuccess']) {
    const run=createRlsSmokeHarness(),fixture=await prepare(run);await user(B);
    const calls=[];
    const fake={...client,async rpc(name,a) {
      calls.push(name);
      if(name==='save_activity_aggregate' && scenario==='rpcSuccess') return {data:{},error:null};
      return client.rpc(name,a);
    },from(table) {
      const q=client.from(table);
      if(table==='activities') return {...q,update(){calls.push('update');return {eq(){return {select:async()=>scenario==='updateSuccess'?{data:[{id:fixture.activityId}],error:null}:{data:[],error:null}};}};}};
      if(table==='goals') return {...q,insert(){calls.push('insert');return {select:async()=>scenario==='childSuccess'?{data:[{}],error:null}:{data:null,error:{code:'23514',details:'secret'}}};}};
      return q;
    }};
    const result=await run(fake,B,args('attack',fixture));assert.equal(result.ok,false);assertSafe(result);
    assert.equal(result.failedCheck,{rpcSuccess:'rpcWriteDenied',formatError:'childInsertAsBRejected',updateSuccess:'directUpdateDenied',childSuccess:'childInsertAsBRejected'}[scenario]);
    if(['rpcSuccess','updateSuccess'].includes(scenario)) assert(!calls.includes('insert'));
    assert(calls.filter(c=>c==='insert').length<=1);
    await assert.rejects(()=>run(fake,B,args('attack',fixture)),e=>e.kind==='Conflict');
  }
});
test('foreign listing, anon data exposure and unrelated anon errors are failures',async()=>{
  const run=createRlsSmokeHarness(),fixture=await prepare(run);
  await user(B);
  const leaked={...client,from(){return {select(){return {order(){return {range:async()=>({data:[{user_id:A}],error:null})};}};}};}};
  assert.equal((await run(leaked,B,args('attack',fixture))).failedCheck,'ownRows_areas');
  for(const response of [{data:[{user_id:A}],error:null},{data:null,error:{code:'22P02',message:'secret'}}]) {
    const fake={...client,from(){return {select(){return {limit:async()=>response};}};}};
    const r=await run(fake,null,args('anon',fixture));assert.equal(r.ok,false);assert.equal(r.failedCheck,'anonSelect_areas');assertSafe(r);
  }
});
