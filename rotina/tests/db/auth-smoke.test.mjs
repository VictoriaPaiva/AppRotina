import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {owner}=require('../helpers/data-fixtures.cjs');
const {runRepositorySmoke}=load('lib/banco-mestre/data/smoke.ts');
const db=new PGlite();
const second='00000000-0000-4000-8000-000000000002';
async function user(id=owner) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
}
// Adapter SOMENTE de teste, consulta PostgreSQL em memória; nenhuma URL/chave.
const rpcErrors=[];
const client={
  from(table) {
    assert(['activities','areas'].includes(table));
    let columns='*'; const order=[];
    const query={insert(row){
      assert.equal(table,'areas');
      return {select(value){assert.equal(value,'id');return {async single(){
        try {const data=(await db.query('insert into public.areas(id,user_id,name,active,sort_position) values ($1,$2,$3,$4,$5) returning id',[row.id,row.user_id,row.name,row.active,row.sort_position])).rows[0];return {data,error:null};}
        catch(error){return {data:null,error};}
      }};}};
    },select(value){assert(/^[a-z_,]+$/.test(value));columns=value;return query;},order(col,{ascending}){assert(/^[a-z_]+$/.test(col));order.push(col+(ascending?' asc':' desc'));return query;},async range(start,end){
      try {return {data:JSON.parse(JSON.stringify((await db.query(`select ${columns} from public.${table} order by ${order.join(',')} limit $1 offset $2`,[end-start+1,start])).rows)),error:null};}
      catch(error){return {data:null,error};}
    }};return query;
  },
  async rpc(name,args) {
    try {
      let result;
      if(name==='get_activity_aggregate') result=await db.query('select public.get_activity_aggregate($1::uuid) result',[args.p_activity_id]);
      else {assert.equal(name,'save_activity_aggregate');result=await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) result',[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations),args.p_expected_revision]);}
      return {data:result.rows[0].result,error:null};
    } catch(error) {rpcErrors.push(error.code);return {data:null,error};}
  },
};
before(async()=>{
  await db.exec(`create role authenticated nologin; create role anon nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${owner}'),('${second}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await user();
});
beforeEach(async()=>{await db.exec('rollback');await user();});
after(async()=>{await db.close();});


test('smoke real SQL normal: leitura não cria áreas nem itens',async()=>{
  const report=await runRepositorySmoke(client,owner,{write:false});
  assert.deepEqual(report,{areaCount:0,activityCount:0,aggregate:'not-found'});
  assert.equal((await db.query('select count(*)::integer n from areas')).rows[0].n,0);
});
test('smoke real SQL: cria área própria, salva, edita, lê, rejeita revisão antiga e inativa',async()=>{
  const first=await runRepositorySmoke(client,owner,{write:true});
  assert.equal(first.fixture.createdArea,true);
  assert.equal(first.fixture.conflict,true);
  assert.deepEqual(rpcErrors.splice(0),['PT409']);
  const row=(await db.query('select user_id,status,revision from activities where id=$1',[first.fixture.activityId])).rows[0];
  assert.equal(row.user_id,owner);assert.equal(row.status,'inactive');assert(row.revision>=3);
  const secondRun=await runRepositorySmoke(client,owner,{write:true});
  assert.equal(secondRun.fixture.createdArea,false);
  assert.equal((await db.query('select count(*)::integer n from areas')).rows[0].n,1);
  assert.equal((await runRepositorySmoke(client,owner,{write:false,activityId:first.fixture.activityId})).aggregate,'found');
  await user(second);
  const foreign=await runRepositorySmoke(client,second,{write:false,activityId:first.fixture.activityId});
  assert.deepEqual(foreign,{areaCount:0,activityCount:0,aggregate:'not-found'});
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>runRepositorySmoke(client,owner,{write:true}));
});
test('smoke não reativa área desativada e não modifica atividade existente',async()=>{
  await db.exec('update areas set active=false');
  const previous=(await db.query('select id,status,revision from activities order by id')).rows;
  const report=await runRepositorySmoke(client,owner,{write:true});assert.equal(report.fixture.createdArea,true);
  assert.equal((await db.query('select count(*)::integer n from areas where not active')).rows[0].n,1);
  const after=(await db.query('select id,status,revision from activities where id<>$1 order by id',[report.fixture.activityId])).rows;
  assert.deepEqual(after,previous);
});


test('POST handler + repository + SQL: PT409 esperado termina com 200 e fixture inativa',async()=>{
  const source=ts.transpileModule(await readFile('app/api/dev/data-smoke/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const stubs={
    'next/server':{NextResponse:{json(body,init){return {body,status:init.status??200,headers:init.headers};}}},
    '@/lib/supabase/server':{createClient:async()=>({...client,auth:{getClaims:async()=>({data:{claims:{sub:owner}},error:null})}})},
    '@/lib/supabase/configuration':{getSupabasePublicConfig:()=>({})},
    '@/lib/banco-mestre/data/smoke':{runRepositorySmoke},
    '@/lib/auth/smoke-access':load('lib/auth/smoke-access.ts'),
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
  };
  const mod={exports:{}};
  new Function('exports','require','module','process',source)(mod.exports,name=>{assert(name in stubs);return stubs[name];},mod,{env:{NODE_ENV:'development'}});
  const url=new URL('http://localhost:3000/api/dev/data-smoke');
  rpcErrors.length=0;
  const response=await mod.exports.POST({method:'POST',url:url.href,nextUrl:url,headers:new Headers({origin:url.origin})});
  assert.equal(response.status,200);assert.equal(response.body.ok,true);
  assert.equal(response.headers['Cache-Control'],'private, no-store');
  assert.deepEqual(rpcErrors,['PT409']);
  assert.equal(response.body.fixture.conflict,true);
  assert.equal(response.body.fixture.inactive,true);
  const row=(await db.query('select status from activities where id=$1',[response.body.fixture.activityId])).rows[0];
  assert.equal(row.status,'inactive');
});
