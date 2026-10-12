/* eslint-disable @typescript-eslint/no-require-imports -- Testes Node sem dependências novas. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {load}=require('./helpers/load-typescript.cjs');
const policy=load('lib/auth/policy.ts');
const {smokeAccessStatus}=load('lib/auth/smoke-access.ts');
const {parseSupabasePublicConfig}=load('lib/supabase/configuration.ts');
function withStubs(file,stubs,environment=process.env.NODE_ENV){
  const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const mod={exports:{}};
  new Function('exports','require','module','process',source)(mod.exports,name=>{assert(name in stubs,'Dependência sem stub: '+name);return stubs[name];},mod,{env:{NODE_ENV:environment}});
  return mod.exports;
}
test('protege seis rotas, subrotas e protected; callbacks e prefixos semelhantes são públicos',()=>{
  for(const route of ['hoje','planejamento','calendario','projetos','banco-mestre','ideias','protected']) {
    assert(policy.requiresSession('/'+route));assert(policy.requiresSession('/'+route+'/item'));assert(!policy.requiresSession('/'+route+'-publico'));
  }
  for(const route of ['/','/auth/login','/auth/sign-up','/auth/confirm','/auth/forgot-password','/auth/update-password','/auth/error','/auth/sign-up-success']) assert(!policy.requiresSession(route));
});
test('redirects internos permitidos; URLs externas, tokens, barras escapadas e traversal rejeitados',()=>{
  assert.equal(policy.safeAuthRedirect('/banco-mestre/item-1'),'/banco-mestre/item-1');
  assert.equal(policy.safeAuthRedirect('/auth/update-password'),'/auth/update-password');
  for(const target of ['https://example.com','//example.com','/hoje?token_hash=teste','/hoje#token','/hoje/../auth','/hoje/%2f','/hoje\\externo','/auth/confirm',null]) assert.equal(policy.safeAuthRedirect(target),'/hoje');
});
test('configuração aceita somente URL apropriada e chave pública; erros não revelam conteúdo técnico',()=>{
  const key='sb_publishable_TEST_ONLY_NOT_A_REAL_KEY';
  assert(parseSupabasePublicConfig('https://example.supabase.co',key));
  assert(parseSupabasePublicConfig('http://127.0.0.1:54321',key));
  for(const url of ['http://example.com','https://user:password@example.com','https://example.com/path','https://example.com?token=test','not-url']) assert.equal(parseSupabasePublicConfig(url,key),null);
  const legacy=role=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
  assert(parseSupabasePublicConfig('https://example.com',legacy('anon')));
  for(const bad of ['your-publishable-key','sb_secret_TEST_ONLY',legacy('service_role'),legacy('authenticated')]) assert.equal(parseSupabasePublicConfig('https://example.com',bad),null);
  assert(!policy.authErrorMessage({message:'private technical details'}).includes('private'));
});
test('endpoint técnico só em desenvolvimento; escrita exige Origin da aplicação',()=>{
  const url='http://localhost:3000/api/dev/data-smoke';
  for(const mode of ['production','test',undefined]) assert.equal(smokeAccessStatus(mode,'POST','http://localhost:3000',url),404);
  assert.equal(smokeAccessStatus('development','GET',null,url),null);
  assert.equal(smokeAccessStatus('development','POST','http://localhost:3000',url),null);
  for(const origin of [null,'http://other.example','invalid']) assert.equal(smokeAccessStatus('development','POST',origin,url),403);
});
function proxyHarness({configured=true,sub=null,error=null,throws=false,refresh=false}={}){
  const response=()=>({headers:new Headers(),cookies:{values:[],getAll(){return this.values;},set(name,value,options){this.values.push(typeof name==='object'?name:{name,value,...options});}}});
  const NextResponse={next:response,redirect(url){const r=response();r.location=url.href;return r;}};
  const stubs={
    'next/server':{NextResponse},'./configuration':{getSupabasePublicConfig:()=>configured?{url:'https://example.com',key:'test-only'}:null},'@/lib/auth/policy':policy,
    '@supabase/ssr':{createServerClient(_url,_key,opts){return {auth:{async getClaims(){
      if(refresh) {opts.cookies.setAll([{name:'session-test',value:'non-real-cookie',options:{httpOnly:true}}],{'Expires':'0','Pragma':'no-cache'});opts.cookies.setAll([{name:'second-cookie',value:'test',options:{}}],{});}
      if(throws) throw Error('unavailable');return {data:{claims:{sub}},error};
    }}};}}
  };
  return async(route)=>{
    const url=new URL('http://localhost:3000'+route);url.clone=()=>new URL(url);
    return withStubs('lib/supabase/proxy.ts',stubs).updateSession({nextUrl:url,cookies:{getAll:()=>[],set(){}}});
  };
}
test('proxy falha fechado sem configuração, sessão expirada ou falha de autenticação',async()=>{
  for(const settings of [{configured:false},{error:{code:'expired'}},{throws:true}]) {
    const proxy=proxyHarness(settings),response=await proxy('/hoje?code=private');
    assert.equal(response.location,'http://localhost:3000/auth/login');
    assert.equal((await proxy('/auth/confirm?code=test')).location,undefined);
  }
  assert.equal((await proxyHarness({sub:'verified-user'})('/projetos')).location,undefined);
});
test('redirect de sessão expirada preserva cookies e headers de renovação',async()=>{
  const response=await proxyHarness({refresh:true})('/ideias');
  assert.equal(response.cookies.getAll()[0].name,'session-test');
  assert.equal(response.cookies.getAll()[0].httpOnly,true);
  assert.equal(response.headers.get('expires'),'0');assert.equal(response.headers.get('pragma'),'no-cache');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('confirmação aceita PKCE e OTP, força recuperação interna e não repassa erro/token',async()=>{
  for(const [query,expected,method] of [
    ['code=test&next=/hoje','/hoje','code'],
    ['token_hash=test&type=email&next=https://outside.example','/hoje','otp'],
    ['token_hash=test&type=recovery&next=/projetos','/auth/update-password','otp'],
    ['token_hash=test&type=invalid','/auth/error',null],
    ['code=test&failure=1','/auth/error','code'],
  ]) {
    let called=null;
    const fail=query.includes('failure');
    const auth={async verifyOtp(){called='otp';return {error:fail?Error('private'):null};},async exchangeCodeForSession(){called='code';return {error:fail?Error('private'):null};}};
    const {GET}=withStubs('app/auth/confirm/route.ts',{
      '@/lib/supabase/server':{createClient:async()=>({auth})},'@/lib/supabase/configuration':{getSupabasePublicConfig:()=>({})},
      '@/lib/auth/policy':policy,'next/navigation':{redirect(target){throw Object.assign(Error('redirect'),{target});}},
    });
    await assert.rejects(()=>GET({nextUrl:new URL('http://localhost/auth/confirm?'+query)}),e=>e.target===expected);
    assert.equal(called,method);
  }
});

test('handler smoke verifica sessão antes do repository e não existe em produção',async()=>{
  for(const scenario of [
    {environment:'production',configured:true,sub:'verified',status:404},
    {environment:'development',configured:false,sub:'verified',status:503},
    {environment:'development',configured:true,sub:null,status:401},
    {environment:'development',configured:true,sub:'verified',status:200},
  ]) {
    let called=false;
    const stubs={
      'next/server':{NextResponse:{json(body,init){return {body,status:init.status??200};}}},
      '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:scenario.sub}},error:null})}})},
      '@/lib/supabase/configuration':{getSupabasePublicConfig:()=>scenario.configured?{}:null},
      '@/lib/banco-mestre/data/smoke':{runRepositorySmoke:async(_client,actor,options)=>{called=true;assert.equal(actor,'verified');assert.equal(options.write,false);return {aggregate:'not-found'};}},
      '@/lib/auth/smoke-access':{smokeAccessStatus},
      '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    };
    const {GET}=withStubs('app/api/dev/data-smoke/route.ts',stubs,scenario.environment);
    const url=new URL('http://localhost/api/dev/data-smoke');
    const response=await GET({method:'GET',url:url.href,nextUrl:url,headers:new Headers()});
    assert.equal(response.status,scenario.status);assert.equal(called,scenario.status===200);
  }
});

test('erros de conta e sessão têm mensagens amigáveis sem detalhes técnicos',()=>{
  assert.equal(policy.authErrorMessage({code:'user_not_found'}),policy.authErrorMessage({code:'invalid_credentials'}));
  for(const code of ['session_expired','session_not_found','refresh_token_not_found','refresh_token_already_used']) assert.equal(policy.authErrorMessage({code,message:'private'}),'Sua sessão expirou. Entre novamente.');
});
