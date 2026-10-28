/* eslint-disable @typescript-eslint/no-require-imports -- Server Action tests without remote credentials. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {load}=require('./helpers/load-typescript.cjs');
const {owner}=require('./helpers/data-fixtures.cjs');
const validation=load('lib/banco-mestre/data/area-validation.ts');
const errors=load('lib/banco-mestre/data/errors.ts');
const reads=load('lib/banco-mestre/data/read-model.ts');
const area={id:'10000000-0000-4000-8000-000000000001',name:'Área',active:true,sortPosition:0,updatedAt:'2026-10-20T10:00:00.123456Z'};
const expected=(({name,active,sortPosition,updatedAt})=>({name,active,sortPosition,updatedAt}))(area);
const cases=[['createMasterArea','createArea',{id:area.id,name:' Área '}],['renameMasterArea','renameArea',{id:area.id,name:' Área ',expected}],['setMasterAreaActive','setAreaActive',{id:area.id,active:false,expected}]];
function harness({claims={sub:owner},authError=null,saveError=null,clientError=null,saveGate=null}={}) {
  const calls=[],paths=[],owners=[];
  const client={auth:{getClaims:async()=>{calls.push('claims');return {data:{claims},error:authError};}}};
  const repository=Object.fromEntries(cases.map(([,method])=>[method,async input=>{
    calls.push([method,input]);if(saveGate)await saveGate;if(saveError)throw saveError;
    return {...area,...('active' in input?{active:input.active}:{}),user_id:owner,claims:'private',cause:'private'};
  }]));
  const actions=withStubs('app/banco-mestre/area-actions.ts',{
    'next/cache':{revalidatePath:(...args)=>paths.push(args)},
    '@/lib/supabase/server':{createClient:async()=>{calls.push('client');if(clientError)throw clientError;return client;}},
    '@/lib/banco-mestre/data/area-repository':{createAreaRepository:(actual,sub)=>{assert.equal(actual,client);assert.equal(sub,claims.sub);owners.push(sub);calls.push('repository');return repository;}},
    '@/lib/banco-mestre/data/area-validation':validation,
    '@/lib/banco-mestre/data/errors':errors,
    '@/lib/banco-mestre/data/read-model':reads,
  });
  return {actions,calls,paths,owners};
}
test('area actions validate and verify claims before using the trusted owner; success invalidates all dependent routes',async()=>{
  for(const [action,method,input] of cases) {
    const {actions,calls,paths}=harness();const result=await actions[action](input);
    assert.equal(result.ok,true);assert.deepEqual(calls.slice(0,3),['client','claims','repository']);
    assert.equal(calls[3][0],method);assert.equal(calls[3][1].id,area.id);
    if('name' in input)assert.equal(calls[3][1].name,'Área');
    if(input.expected)assert.deepEqual(calls[3][1].expected,expected);
    if('active' in input){assert.equal(calls[3][1].active,false);assert.equal(result.area.active,false);}
    assert.deepEqual(paths,[['/banco-mestre'],['/banco-mestre/areas'],['/banco-mestre/nova'],['/banco-mestre/[id]','page'],['/banco-mestre/[id]/editar','page']]);
    assert.deepEqual(Object.keys(result.area).sort(),Object.keys(area).sort());
    assert(!JSON.stringify(result).includes(owner));assert(!JSON.stringify(result).includes('private'));
  }
});
test('invalid inputs, injected owner/order/audit fields never create a client or repository',async()=>{
  for(const [action,,input] of cases) {
    for(const invalid of [null,{}, {...input,id:'bad'},...Object.entries({user_id:owner,userId:owner,sort_position:5,sortPosition:5,updated_at:area.updatedAt,created_at:area.updatedAt}).map(([key,value])=>({...input,[key]:value}))]) {
      const {actions,calls,paths}=harness();const result=await actions[action](invalid);
      assert.equal(result.kind,'Validation');assert.deepEqual(calls,[]);assert.deepEqual(paths,[]);
    }
  }
});
test('missing or expired session returns Unauthorized before repository construction or invalidation',async()=>{
  for(const [action,,input] of cases)for(const settings of [{claims:null},{claims:{}},{claims:{sub:''}},{authError:{message:'private cookie details'}}]) {
    const {actions,calls,paths}=harness(settings);const result=await actions[action](input);
    assert.equal(result.kind,'Unauthorized');assert.deepEqual(calls,['client','claims']);assert.deepEqual(paths,[]);
    assert(!JSON.stringify(result).includes('private'));
  }
});
test('all persistence error kinds stay safe; errors never invalidate or retry',async()=>{
  for(const [action,,input] of cases)for(const kind of ['Validation','Unauthorized','NotFound','Conflict','Unknown']) {
    const {actions,calls,paths}=harness({saveError:new errors.PersistenceError(kind,{message:'private SQL',headers:'cookies'})});
    const result=await actions[action](input);assert.deepEqual(result,{ok:false,kind,message:new errors.PersistenceError(kind).message});
    assert.equal(calls.length,4);assert.deepEqual(paths,[]);assert(!JSON.stringify(result).includes('private'));
  }
  for(const clientError of [Error('private network details'),{code:'XX000',message:'private SQL'}]) {
    const {actions,calls,paths}=harness({clientError});assert.equal((await actions.createMasterArea(cases[0][2])).kind,'Unknown');
    assert.deepEqual(calls,['client']);assert.deepEqual(paths,[]);
  }
});
test('setActive preserves explicit true/false and action exports contain no delete/reorder/read operation',async()=>{
  for(const active of [true,false]) {
    const {actions,calls}=harness();await actions.setMasterAreaActive({id:area.id,active,expected});assert.equal(calls[3][1].active,active);
    assert.deepEqual(Object.keys(actions).sort(),cases.map(([action])=>action).sort());
  }
});

test('create uses each verified claims.sub and rejects ownership from browser before authentication',async()=>{
  for(const sub of [owner,'00000000-0000-4000-8000-000000000002']) {
    const {actions,owners}=harness({claims:{sub}});
    assert.equal((await actions.createMasterArea(cases[0][2])).ok,true);assert.deepEqual(owners,[sub]);
    assert.equal((await actions.createMasterArea({...cases[0][2],user_id:owner})).kind,'Validation');assert.deepEqual(owners,[sub]);
  }
});

test('pending repository never invalidates; network/database rejection produces safe failure without false success',async()=>{
  for(const saveError of [null,Error('private network'),{code:'XX000',message:'private database'},{code:'23514',message:'private constraint'}]) {
    let release;const saveGate=new Promise(resolve=>{release=resolve;});
    const {actions,calls,paths}=harness({saveGate,saveError});
    const pending=actions.createMasterArea(cases[0][2]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,4);assert.deepEqual(paths,[]);
    release();const result=await pending;
    assert.equal(result.ok,saveError===null);
    assert.equal(paths.length,saveError===null?5:0);
    if(saveError){assert(!JSON.stringify(result).includes('private'));assert(!('area' in result));}
  }
});

test('areas Server Action POST passes proxy after logout but still requires getClaims before any repository',async()=>{
  const response=()=>({headers:new Headers(),cookies:{getAll:()=>[],set(){}}});let proxyUsers=0;
  const {updateSession}=withStubs('lib/supabase/proxy.ts',{
    'next/server':{NextResponse:{next:response,redirect:()=>({...response(),redirected:true})}},
    './configuration':{getSupabasePublicConfig:()=>({url:'https://example.com',key:'test-only'})},
    '@/lib/auth/policy':load('lib/auth/policy.ts'),
    '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>{proxyUsers++;return {data:{user:null},error:null};}}})},
  });
  const request=method=>{const url=new URL('http://localhost:3000/banco-mestre/areas');url.clone=()=>new URL(url);return {method,nextUrl:url,headers:new Headers({'Next-Action':'forged-header-is-not-auth'}),cookies:{getAll:()=>[],set(){}}};};
  assert((await updateSession(request('GET'))).redirected);
  assert(!(await updateSession(request('POST'))).redirected);assert.equal(proxyUsers,2);
  const {actions,calls,paths}=harness({claims:null});
  const result=await actions.createMasterArea(cases[0][2]);assert.equal(result.kind,'Unauthorized');
  assert.deepEqual(calls,['client','claims']);assert.deepEqual(paths,[]);
});
