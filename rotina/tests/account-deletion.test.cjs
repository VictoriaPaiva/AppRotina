/* eslint-disable @typescript-eslint/no-require-imports -- Offline security tests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const contract=load('lib/account-deletion/contract.ts');
const {deleteCurrentAccount}=load('lib/account-deletion/delete-account.ts');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const missing={status:404,code:'user_not_found'};
function harness(options={}) {
  const calls=[],users=new Set([A,B]);
  const session={
    async getClaims(){calls.push('claims');if(options.claimThrows)throw Error('private');return {data:{claims:{sub:A}},error:options.claimError??null};},
    async getUser(){calls.push('user');if(options.userThrows)throw Error('private');return {data:{user:options.userError?null:{id:A}},error:options.userError??null};},
  };
  const admin={
    async deleteUser(id,soft){calls.push(['delete',id,soft]);assert.equal(id,A);assert.equal(soft,false);if(options.deleteError)return {data:{user:null},error:options.deleteError};users.delete(id);if(options.lostResponse)throw Error('private');return {data:{user:options.emptyPayload?{}:{id}},error:null};},
    async getUserById(id){calls.push(['lookup',id]);assert.equal(id,A);if(options.lookupThrows)throw Error('private');return users.has(id)?{data:{user:{id}},error:null}:{data:{user:null},error:missing};},
  };
  return {calls,users,run:()=>deleteCurrentAccount(session,()=>{if(options.configError)throw Error('private');return admin;})};
}
test('exact phrase only; injected target IDs/emails/owners and other fields are rejected',()=>{
  assert(contract.validDeletionInput({confirmation:contract.DELETE_ACCOUNT_PHRASE}));
  for(const value of [null,[],{}, {confirmation:'excluir minha conta'},{confirmation:contract.DELETE_ACCOUNT_PHRASE+' '},...['user_id','email','id','target'].map(k=>({confirmation:contract.DELETE_ACCOUNT_PHRASE,[k]:B}))])assert(!contract.validDeletionInput(value));
});
test('hard delete takes subject exclusively from verified session; B is never passed to admin',async()=>{
  const h=harness({emptyPayload:true,lookupThrows:true});assert.deepEqual(await h.run(),{ok:true,alreadyDeleted:false});
  assert.deepEqual(h.calls,['claims','user',['delete',A,false]]);assert(h.users.has(B));assert(!h.users.has(A));
});
test('expired, revoked, missing and online authentication failures never delete',async()=>{
  for(const options of [{claimError:{code:'expired'}},{claimThrows:true},{userError:{code:'session_not_found'}},{userError:{code:'bad_jwt'}},{userError:{name:'AuthRetryableFetchError'}},{userThrows:true},{configError:true}]) {
    const h=harness(options),r=await h.run();assert(!r.ok);assert(h.users.has(A));assert(!h.calls.some(c=>Array.isArray(c)&&c[0]==='delete'));
  }
});
test('lost delete response is success only after own Auth absence is confirmed; retry is idempotent',async()=>{
  const h=harness({lostResponse:true});assert.deepEqual(await h.run(),{ok:true,alreadyDeleted:true});assert(h.users.has(B));
  const seen=[];
  const r=await deleteCurrentAccount({getClaims:async()=>({data:{claims:{sub:A}},error:null}),getUser:async()=>({data:{user:null},error:{code:'user_not_found',status:403}})},()=>({deleteUser(){assert.fail('must not delete again');},async getUserById(id){seen.push(id);return {data:{user:null},error:missing};}}));
  assert.deepEqual(r,{ok:true,alreadyDeleted:true});assert.deepEqual(seen,[A]);
});
test('internal and network failures retain account or remain explicitly unconfirmed; no false success',async()=>{
  for(const options of [{deleteError:{code:'unexpected_failure',status:500}},{deleteError:{code:'database_error',status:400}},{lostResponse:true,lookupThrows:true}]) {
    const h=harness(options),r=await h.run();assert(!r.ok);assert(h.users.has(B));assert(!JSON.stringify(r).includes('private'));
  }
});
function routeHarness(result={ok:true,alreadyDeleted:false}) {
  const calls=[],cleared=[];
  const {POST}=withStubs('app/api/account/delete/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
    'next/headers':{cookies:async()=>({getAll:()=>[{name:'sb-test-auth-token.0'},{name:'sb-other-auth-token'}],set:name=>cleared.push(name)})},
    '@/lib/supabase/configuration':{requireSupabasePublicConfig:()=>({url:'https://test.supabase.co'})},
    '@/lib/supabase/server':{createClient:async()=>({auth:{async signOut(){calls.push('signOut');throw Error('deleted session');}}})},
    '@/lib/account-deletion/admin':{createAccountAdmin:()=>({})},
    '@/lib/account-deletion/delete-account':{deleteCurrentAccount:async()=>{calls.push('delete');return result;}},
    '@/lib/account-deletion/contract':contract,
  });
  const request=(body,origin='http://localhost:3000',suffix='')=>new Request('http://localhost:3000/api/account/delete'+suffix,{method:'POST',headers:{Host:'localhost:3000',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {POST,request,calls,cleared};
}
test('endpoint rejects cross-origin, absent Origin, target query and target body before Auth/admin',async()=>{
  const h=routeHarness(),body={confirmation:contract.DELETE_ACCOUNT_PHRASE};
  for(const req of [h.request(body,'https://attacker.test'),h.request(body,''),h.request(body,undefined,'?user_id='+B),h.request({...body,user_id:B}),h.request({confirmation:'wrong'})])assert([400,403].includes((await h.POST(req)).status));
  assert.deepEqual(h.calls,[]);
});
test('confirmed success clears only this project cookies even when signOut fails; errors retain local session',async()=>{
  const h=routeHarness(),r=await h.POST(h.request({confirmation:contract.DELETE_ACCOUNT_PHRASE}));
  assert.equal(r.status,200);assert.deepEqual(h.cleared,['sb-test-auth-token.0']);assert.deepEqual(h.calls,['delete','signOut']);assert.equal(r.headers['Cache-Control'],'private, no-store');
  const failed=routeHarness({ok:false,category:'UNAUTHORIZED'});assert.equal((await failed.POST(failed.request({confirmation:contract.DELETE_ACCOUNT_PHRASE}))).status,401);assert.deepEqual(failed.calls,['delete']);assert.deepEqual(failed.cleared,[]);
});
test('same-origin checks use actual Host behind Next URL normalization and respect forwarded HTTPS',async()=>{
  const h=routeHarness();
  const req=new Request('http://localhost:3000/api/account/delete',{method:'POST',headers:{Host:'app.example.test',Origin:'https://app.example.test','X-Forwarded-Proto':'https','Content-Type':'application/json'},body:JSON.stringify({confirmation:contract.DELETE_ACCOUNT_PHRASE})});
  assert.equal((await h.POST(req)).status,200);
});
test('admin module is server-only, uses private env and has no session persistence or logging; product does not import dev cleanup',()=>{
  const admin=fs.readFileSync('lib/account-deletion/admin.ts','utf8');assert(admin.includes("import 'server-only'"));assert(!admin.includes('process.env.NEXT_PUBLIC'));assert(admin.includes('persistSession:false'));
  for(const f of ['app/api/account/delete/route.ts','components/account/DeleteAccountPanel.tsx','lib/account-deletion/delete-account.ts']) {const s=fs.readFileSync(f,'utf8');assert(!s.includes('dev-cleanup'));assert(!s.includes('console.'));}
});

function panelHarness(fetcher) {
  const slots=[];let cursor=0;
  const react={useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=next;}];}};
  const {DeleteAccountPanel}=withStubs('components/account/DeleteAccountPanel.tsx',{
    react,'next/link':{default:'a'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/lib/supabase/client':{createClient:()=>({auth:{signOut:async()=>{}}})},'@/lib/account-deletion/contract':contract,
  });
  const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const tree=()=>{cursor=0;return nodes(DeleteAccountPanel());};
  const find=predicate=>tree().find(predicate);
  const originalFetch=global.fetch;global.fetch=fetcher;
  return {find,tree,confirm(){find(n=>n.type==='button').props.onClick();},change(value){find(n=>n.type==='input').props.onChange({target:{value}});},submit(){return find(n=>n.type==='form').props.onSubmit({preventDefault(){}});},restore(){global.fetch=originalFetch;}};
}
test('UI requires exact phrase, blocks repeated pending clicks and retains confirmation on network failure',async()=>{
  let calls=0,reject;
  const h=panelHarness(()=>{calls++;return new Promise((_,r)=>{reject=r;});});
  try {
    h.confirm();h.change('wrong');assert(h.find(n=>n.props.type==='submit').props.disabled);await h.submit();assert.equal(calls,0);
    h.change(contract.DELETE_ACCOUNT_PHRASE);assert(!h.find(n=>n.props.type==='submit').props.disabled);
    const pending=h.submit();await h.submit();assert.equal(calls,1);assert(h.find(n=>n.props.type==='submit').props.disabled);
    reject(Error('private network error'));await pending;
    assert.equal(h.find(n=>n.type==='input').props.value,contract.DELETE_ACCOUNT_PHRASE);assert(h.find(n=>n.props.role==='alert'));assert(!h.find(n=>n.props.role==='status'));
  } finally {h.restore();}
});
test('UI shows relogin only for expired session; internal/uncertain errors never navigate or show success',async()=>{
  for(const category of ['UNAUTHORIZED','DELETE_FAILED','RESULT_UNCONFIRMED']) {
    const h=panelHarness(async()=>({ok:false,json:async()=>({ok:false,category})}));
    try {h.confirm();h.change(contract.DELETE_ACCOUNT_PHRASE);await h.submit();assert(h.find(n=>n.props.role==='alert'));assert.equal(!!h.find(n=>n.type==='a'),category==='UNAUTHORIZED');assert(!h.find(n=>n.props.role==='status'));}
    finally {h.restore();}
  }
});
test('UI confirms deletion before clearing browser session and full login redirect',async()=>{
  const oldWindow=global.window,paths=[];
  global.window={location:{replace:p=>paths.push(p)}};
  const h=panelHarness(async()=>({ok:true,json:async()=>({ok:true,alreadyDeleted:false})}));
  try {h.confirm();h.change(contract.DELETE_ACCOUNT_PHRASE);await h.submit();assert(h.find(n=>n.props.role==='status'));assert.deepEqual(paths,['/auth/login?account=deleted']);}
  finally {h.restore();global.window=oldWindow;}
});
