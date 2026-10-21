/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {load}=require('./helpers/load-typescript.cjs');
const helpers=load('lib/banco-mestre/data/rls-smoke.ts');
const {owner}=require('./helpers/data-fixtures.cjs');
const id='00000000-0000-4000-8000-000000000020';
function routeHarness({environment='development',configured=true,sub=owner,report={ok:true,checks:{},codes:{}},throws=false}={}) {
  const calls=[];
  const session={auth:{async getClaims(){calls.push('claims');return {data:{claims:{sub}},error:null};}}};
  const anon={};
  const stubs={
    'next/server':{NextResponse:{json(body,init){return {body,...init};}}},
    '@/lib/supabase/server':{createClient:async()=>{calls.push('sessionClient');return session;}},
    '@supabase/supabase-js':{createClient(url,key,options){calls.push({url,key,options});return anon;}},
    '@/lib/supabase/configuration':{getSupabasePublicConfig:()=>configured?{url:'https://example.test',key:'sb_publishable_TEST_ONLY'}:null},
    '@/lib/auth/smoke-access':load('lib/auth/smoke-access.ts'),
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/data/rls-smoke':{...helpers,async runRlsSmoke(client,actor,input){calls.push({client:client===anon?'anon':'session',actor,input});if(throws)throw {code:'XX000',message:'private token cookie email',details:'private'};return report;}},
  };
  const source=ts.transpileModule(fs.readFileSync('app/api/dev/rls-smoke/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const mod={exports:{}};
  new Function('exports','require','module','process',source)(mod.exports,name=>{assert(name in stubs,name);return stubs[name];},mod,{env:{NODE_ENV:environment}});
  return {calls,...mod.exports,request(body={mode:'prepare'},origin='http://localhost:3000') {return {method:'POST',url:'http://localhost:3000/api/dev/rls-smoke',headers:new Headers(origin===null?{}:{origin}),json:async()=>body};}};
}
test('rls endpoint returns 404 outside development before accessing config/session',async()=>{
  for(const environment of ['production','test',undefined]) {
    const h=routeHarness({environment:environment??'other'});
    assert.equal((await h.POST(h.request())).status,404);assert.equal((await h.GET()).status,404);assert.deepEqual(h.calls,[]);
  }
});
test('rls POST requires same origin, including anon; GET never runs checks',async()=>{
  for(const origin of [null,'https://outside.test','invalid']) {
    const h=routeHarness();assert.equal((await h.POST(h.request({mode:'anon',activityId:id,expectedRevision:1},origin))).status,403);assert.deepEqual(h.calls,[]);
  }
  assert.equal((await routeHarness().GET()).status,405);
});
test('prepare/attack/verify require the current verified session',async()=>{
  for(const mode of ['prepare','attack','verify']) {
    const h=routeHarness({sub:null});
    const body=mode==='prepare'?{mode}:{mode,activityId:id,expectedRevision:1};
    const response=await h.POST(h.request(body));assert.equal(response.status,401);assert.deepEqual(h.calls,['sessionClient','claims']);
  }
});
test('anon uses fresh public client with no storage, refresh, cookies or session',async()=>{
  const h=routeHarness({sub:null});
  const response=await h.POST(h.request({mode:'anon',activityId:id,expectedRevision:1}));
  assert.equal(response.status,200);
  assert.deepEqual(h.calls,[{url:'https://example.test',key:'sb_publishable_TEST_ONLY',options:{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}},{client:'anon',actor:null,input:{mode:'anon',activityId:id,expectedRevision:1}}]);
  assert.equal(response.headers['Cache-Control'],'private, no-store');
});
test('rls validates inputs; missing config and internal errors expose no internals',async()=>{
  for(const body of [{mode:'unknown'},{mode:'attack',activityId:'bad',expectedRevision:1},{mode:'verify',activityId:id,expectedRevision:0},{mode:'prepare',user_id:owner}]) {
    const h=routeHarness();assert.equal((await h.POST(h.request(body))).status,400);assert.deepEqual(h.calls,[]);
  }
  const unavailable=routeHarness({configured:false});assert.equal((await unavailable.POST(unavailable.request())).status,503);
  const h=routeHarness({throws:true});const r=await h.POST(h.request());assert.equal(r.status,500);assert.deepEqual(r.body,{ok:false,kind:'Unknown'});
  const failed=routeHarness({report:{ok:false,checks:{directUpdateDenied:false},codes:{},failedCheck:'directUpdateDenied'}});
  assert.equal((await failed.POST(failed.request())).status,409);
  assert.equal(helpers.safeRlsCode({code:'token-secret',message:'secret'}),'UNEXPECTED');
  assert.equal(helpers.safeRlsCode({code:'23503',details:'secret'}),'23503');
});
