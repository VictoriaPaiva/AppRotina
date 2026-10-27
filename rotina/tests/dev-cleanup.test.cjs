/* eslint-disable @typescript-eslint/no-require-imports -- Temporary local cleanup safety harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const {cleanupAccess}=load('lib/dev-cleanup/access.ts');
const {createCleanupConfirmations}=load('lib/dev-cleanup/confirmation.ts');
const sql=load('lib/dev-cleanup/sql.ts');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const url='http://localhost:3000/api/dev/clear-data',projectUrl='https://'+sql.CLEANUP_PROJECT_REF+'.supabase.co';
const counts=Object.fromEntries(sql.CLEANUP_TABLES.map(table=>[table,1])),ownerState=Object.fromEntries(sql.CLEANUP_TABLES.map(table=>[table,{count:1,digest:'test-hash'}]));
const report={counts,ownerState,structure:'test-structure',otherCounts:counts,otherAccounts:1,accountPreserved:true,othersUnchanged:false,structureUnchanged:false,allZero:false,executed:false};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function environment(values,fn) {
  const keys=['NODE_ENV','DEV_DATA_CLEANUP_ENABLED','DEV_DATA_CLEANUP_ALLOW_EXECUTE','NEXT_PUBLIC_SUPABASE_URL'],before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{NODE_ENV:'development',DEV_DATA_CLEANUP_ENABLED:'true',DEV_DATA_CLEANUP_ALLOW_EXECUTE:'false',NEXT_PUBLIC_SUPABASE_URL:projectUrl},values);
  try{return await fn();}finally{for(const key of keys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
}
test('production/disabled/remote origins/wrong projects are rejected before session or transport',()=>{
  for(const env of ['production','test',undefined])assert.equal(cleanupAccess(env,'true','http://localhost:3000',url,projectUrl),404);
  assert.equal(cleanupAccess('development','false','http://localhost:3000',url,projectUrl),404);
  for(const [origin,request,project] of [[null,url,projectUrl],['https://evil.test',url,projectUrl],['http://evil.test','http://evil.test/api/dev/clear-data',projectUrl],['http://localhost:3000',url,'https://production.supabase.co']])assert.equal(cleanupAccess('development','true',origin,request,project),403);
  assert.equal(cleanupAccess('development','true','http://localhost:3000',url,projectUrl),null);
});
test('confirmation is per actor, one use, expires after ten minutes and renewed previews invalidate old confirmations',()=>{
  const store=createCleanupConfirmations(),first=store.issue(A,report,0);
  assert.throws(()=>store.consume(B,first.token,1));assert.equal(store.consume(A,first.token,1).structure,report.structure);assert.throws(()=>store.consume(A,first.token,2));
  const expired=store.issue(A,report,0);assert.throws(()=>store.consume(A,expired.token,600000));
  const old=store.issue(A,report,0),fresh=store.issue(A,report,1);assert.throws(()=>store.consume(A,old.token,2));assert(store.consume(A,fresh.token,2));
});
test('SQL only scopes functional DML to auth.uid, contains no DDL/TRUNCATE/Auth write and rejects actor injection',()=>{
  const preview=sql.cleanupSql(A),execute=sql.cleanupSql(A,report);
  assert(preview.includes('read only'));assert(!preview.includes('delete from public.%I'));assert(execute.includes('delete from public.%I where user_id=auth.uid()'));assert(execute.includes('CLEANUP_STALE_PREVIEW'));assert(execute.includes('set constraints all immediate'));
  assert(!/\b(?:create|alter|drop|truncate)\s+(?:table|function|policy|schema)?/i.test(execute));assert(!/\b(?:delete|update|insert)\s+(?:from\s+|into\s+)?auth\./i.test(execute));assert(!execute.includes('service_role'));
  assert.throws(()=>sql.cleanupSql("x';delete from auth.users;--"));assert.equal(sql.CLEANUP_TABLES.length,16);
});
function handler({actor=A,authError=false,failure=false}={}) {
  const calls=[],store=createCleanupConfirmations();let authCalls=0;
  const route=withStubs('app/api/dev/clear-data/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>{authCalls++;return {data:{user:actor?{id:actor,email:'current@example.test'}:null},error:authError?Error('expired'):null};}}})},
    '@/lib/dev-cleanup/access':{cleanupAccess},'@/lib/dev-cleanup/confirmation':{cleanupConfirmations:store},'@/lib/dev-cleanup/sql':sql,
    '@/lib/dev-cleanup/transport':{runDevCleanup:async(actor,expected)=>{calls.push({actor,expected});if(failure)throw Error('private SQL / secret token');return expected?{...report,counts:Object.fromEntries(sql.CLEANUP_TABLES.map(table=>[table,0])),executed:true,allZero:true,othersUnchanged:true,structureUnchanged:true}:report;}},
  });
  const post=(body,origin='http://localhost:3000')=>route.POST({url,headers:new Headers(origin?{origin}:{}),json:async()=>body});
  return {post,calls,authCalls:()=>authCalls,store};
}
test('endpoint fails closed outside development, rejects owner/body injection and checks getUser before any SQL',async()=>{
  for(const env of ['production','test'])await environment({NODE_ENV:env,DEV_DATA_CLEANUP_ALLOW_EXECUTE:'true'},async()=>{const h=handler(),result=await h.post({action:'preview'});assert.equal(result.status,404);assert.equal(h.authCalls(),0);assert.equal(h.calls.length,0);});
  await environment({},async()=>{
    const h=handler();assert.equal((await h.post({action:'preview',user_id:B})).status,400);assert.equal(h.calls.length,0);
    for(const config of [{actor:null},{authError:true}]){const denied=handler(config);assert.equal((await denied.post({action:'preview'})).status,401);assert.equal(denied.calls.length,0);}
    assert.equal((await h.post({action:'preview'},'https://evil.test')).status,403);assert.equal(h.calls.length,0);
  });
});
test('preview reports all table counts, does not expose hashes, and execution remains locked by default',async()=>environment({},async()=>{
  const h=handler(),preview=await h.post({action:'preview'});assert.equal(preview.status,200);assert.equal(preview.body.canExecute,false);assert.equal(preview.body.email,'current@example.test');assert.deepEqual(preview.body.counts,counts);assert(!JSON.stringify(preview.body).includes('test-hash'));assert(!JSON.stringify(preview.body).includes('test-structure'));
  assert.deepEqual(h.calls,[{actor:A,expected:undefined}]);const denied=await h.post({action:'execute',token:preview.body.token,confirmation:sql.CLEANUP_PHRASE});assert.equal(denied.status,403);assert.equal(h.calls.length,1);
}));
test('execution requires exact phrase, bound one-use preview and live session; rechecks session after committed report',async()=>environment({DEV_DATA_CLEANUP_ALLOW_EXECUTE:'true'},async()=>{
  const h=handler(),preview=(await h.post({action:'preview'})).body;
  assert.equal((await h.post({action:'execute',token:preview.token,confirmation:'yes'})).status,400);assert.equal(h.calls.length,1);
  const result=await h.post({action:'execute',token:preview.token,confirmation:sql.CLEANUP_PHRASE});assert.equal(result.status,200);assert(result.body.executed&&result.body.allZero&&result.body.sessionVerified);assert.equal(h.calls[1].actor,A);assert.equal(h.calls[1].expected.structure,report.structure);assert.equal(h.authCalls(),4);
  assert.equal((await h.post({action:'execute',token:preview.token,confirmation:sql.CLEANUP_PHRASE})).status,409);assert.equal(h.calls.length,2);
}));
test('transport failure never reports successful cleanup, leaks SQL or automatically retries',async()=>environment({DEV_DATA_CLEANUP_ALLOW_EXECUTE:'true'},async()=>{
  const h=handler({failure:true}),token=h.store.issue(A,report).token,result=await h.post({action:'execute',token,confirmation:sql.CLEANUP_PHRASE});assert.equal(result.status,500);assert.equal(result.body.ok,false);assert(!JSON.stringify(result).includes('private SQL'));assert.equal(h.calls.length,1);
  assert.equal((await h.post({action:'execute',token,confirmation:sql.CLEANUP_PHRASE})).status,409);assert.equal(h.calls.length,1);
}));
function panel(fetch) {
  const slots=[];let cursor=0;const react={useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
  const {CleanupPanel}=withStubs('components/dev/CleanupPanel.tsx',{react,'next/link':{default:'a'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'}});
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
  const render=()=>{cursor=0;return CleanupPanel();};const find=predicate=>nodes(render(),predicate)[0];
  return {find,fetch};
}
test('UI does not fetch or execute on mount; preview precedes confirmation; uncertain result forces a new preview',async()=>{
  const original=global.fetch,calls=[];
  global.fetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='execute')throw Error('network');return {ok:true,json:async()=>({ok:true,...report,token:'test-token',email:'current@example.test',expires:4102444800000,canExecute:true})};};
  try {
    const h=panel();h.find(n=>n.type==='button');assert.equal(calls.length,0);
    h.find(n=>n.type==='button').props.onClick();await tick();assert.deepEqual(calls,[{action:'preview'}]);
    const execute=()=>h.find(n=>n.type==='button'&&n.props.children==='Apagar somente meus dados de teste');assert(execute().props.disabled);
    h.find(n=>n.props?.id==='cleanup-confirmation').props.onChange({target:{value:sql.CLEANUP_PHRASE}});assert.equal(execute().props.disabled,false);execute().props.onClick();await tick();assert.equal(calls.length,2);assert(execute().props.disabled);assert(h.find(n=>n.props?.role==='alert'));assert(!h.find(n=>n.props?.role==='status'));assert.equal(h.find(n=>n.props?.id==='cleanup-confirmation').props.value,'');
  }finally{global.fetch=original;}
});
test('dev cleanup page is unavailable in production and when local flag is disabled',async()=>{
  const {default:Page}=withStubs('app/dev/limpar-dados/page.tsx',{'next/navigation':{notFound(){throw Error('404');}},'@/components/dev/CleanupPanel':{CleanupPanel:()=>null}});
  await environment({NODE_ENV:'production',DEV_DATA_CLEANUP_ALLOW_EXECUTE:'true'},()=>assert.throws(()=>Page(),/404/));await environment({DEV_DATA_CLEANUP_ENABLED:'false'},()=>assert.throws(()=>Page(),/404/));
});
test('local CLI transport pins the development project, uses argument arrays, removes temporary SQL and never runs while disabled',async()=>{
  const calls=[],removed=[],written=[];
  const {runDevCleanup}=withStubs('lib/dev-cleanup/transport.ts',{
    'node:child_process':{execFile:(command,args,options,callback)=>{calls.push({command,args,options});callback(null,JSON.stringify({rows:[{report}]}));}},
    'node:fs/promises':{mkdtemp:async()=> 'C:/Temp/rotina-cleanup-test',writeFile:async(...args)=>written.push(args),unlink:async value=>removed.push(value),rmdir:async value=>removed.push(value)},
    'node:os':{tmpdir:()=> 'C:/Temp'},'node:path':require('node:path'),'./sql':sql,
  });
  await environment({NODE_ENV:'production',DEV_DATA_CLEANUP_ALLOW_EXECUTE:'true'},async()=>{await assert.rejects(()=>runDevCleanup(A));assert.equal(calls.length,0);});
  await environment({},async()=>{
    await assert.rejects(()=>runDevCleanup(A,report));assert.equal(calls.length,0);
    assert.equal((await runDevCleanup(A)).executed,false);assert.equal(calls.length,1);assert.equal(removed.length,2);assert(written[0][1].includes('read only'));assert.equal(calls[0].options.windowsHide,true);assert(!calls[0].options.shell);
    assert(calls[0].args.includes(sql.CLEANUP_PROJECT_REF));assert(calls[0].args.includes('--file'));assert(!calls[0].args.includes('--db-url'));
  });
});
