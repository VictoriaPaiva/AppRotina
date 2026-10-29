/* eslint-disable @typescript-eslint/no-require-imports -- Browser event and form regressions without live accounts. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {load}=require('./helpers/load-typescript.cjs');
function protection({dirty=true,pending=false,confirm=false}={}) {
  const previous={window:global.window,document:global.document};const cleanups=[];let prompts=0,alerts=0;
  global.document=new EventTarget();global.window=new EventTarget();
  window.location={href:'http://localhost:3000/projetos/nova'};
  window.confirm=()=>{prompts++;return confirm;};window.alert=()=>{alerts++;};
  const subject=withStubs('lib/forms/draft-protection.ts',{react:{useEffect(fn){cleanups.push(fn());},useRef:v=>({current:v})}});
  subject.useDraftProtection(dirty,pending);
  return {module:subject,prompts:()=>prompts,alerts:()=>alerts,
    click({href='/projetos',target='',modified=false}={}){const event=new Event('click',{cancelable:true});Object.defineProperties(event,{button:{value:0},ctrlKey:{value:modified},target:{value:{closest:()=>({href,target,hasAttribute:()=>false})}}});document.dispatchEvent(event);return event;},
    cleanup(){for(const fn of cleanups)fn?.();global.window=previous.window;global.document=previous.document;}};
}
test('dirty visible back/sidebar navigation can cancel; blank/new-tab/hash navigation stays usable',()=>{
  const h=protection();
  try {assert(h.click().defaultPrevented);assert.equal(h.prompts(),1);assert(!h.module.confirmPageLeave());assert.equal(h.prompts(),2);assert(!h.click({target:'_blank'}).defaultPrevented);assert(!h.click({modified:true}).defaultPrevented);assert(!h.click({href:'/projetos/nova#section'}).defaultPrevented);assert.equal(h.prompts(),2);}
  finally{h.cleanup();}
  const blank=protection({dirty:false});try{assert(!blank.click().defaultPrevented);assert(blank.module.confirmPageLeave());assert.equal(blank.prompts(),0);}finally{blank.cleanup();}
});
test('pending save blocks navigation/logout; refresh/close warns and approved departure can bypass one unload',()=>{
  const h=protection({pending:true});try{assert(h.click().defaultPrevented);assert(!h.module.confirmPageLeave());assert.equal(h.alerts(),2);assert.equal(h.prompts(),0);}finally{h.cleanup();}
  const dirty=protection({confirm:true});try{
    const refresh=new Event('beforeunload',{cancelable:true});window.dispatchEvent(refresh);assert(refresh.defaultPrevented);
    assert(dirty.module.confirmPageLeave());dirty.module.allowPageLeave();const approved=new Event('beforeunload',{cancelable:true});window.dispatchEvent(approved);assert(!approved.defaultPrevented);
  }finally{dirty.cleanup();}
});
function formHarness(file,exportName,auth) {
  const slots=[];let cursor=0;const paths=[];
  const react={useState(v){const i=cursor++;slots[i]??={value:v};return [slots[i].value,next=>{slots[i].value=next;}];},useRef(v){const i=cursor++;slots[i]??={current:v};return slots[i];}};
  const mod=withStubs(file,{
    react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({replace:p=>paths.push(p),refresh(){}})},
    '@/lib/utils':{cn:()=>'',hasEnvVars:true},'@/lib/auth/policy':load('lib/auth/policy.ts'),
    '@/lib/supabase/client':{createClient:()=>({auth})},
    '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/components/ui/card':Object.fromEntries(['Card','CardContent','CardHeader','CardTitle','CardDescription'].map(k=>[k,k])),
  });
  function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
  const find=predicate=>{cursor=0;return nodes(mod[exportName]({})).find(predicate);};
  return {paths,find,change:(id,value)=>find(n=>n.props.id===id).props.onChange({target:{value}}),submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}})};
}
test('login/signup/recovery/password updates prevent same-tick duplicate sends and retain values after network failure',async()=>{
  const oldWindow=global.window;global.window={location:{origin:'http://localhost:3000'}};
  try {
    for(const [file,name,method] of [['login-form','LoginForm','signInWithPassword'],['sign-up-form','SignUpForm','signUp'],['forgot-password-form','ForgotPasswordForm','resetPasswordForEmail'],['update-password-form','UpdatePasswordForm','updateUser']]) {
      let calls=0,resolve;const h=formHarness('components/'+file+'.tsx',name,{[method]:()=>{calls++;return new Promise(r=>{resolve=r;});}});
      if(h.find(n=>n.props.id==='email'))h.change('email','fixture@example.test');if(h.find(n=>n.props.id==='password'))h.change('password','fixture-password');if(h.find(n=>n.props.id==='repeat-password'))h.change('repeat-password','fixture-password');
      const pending=h.submit();await h.submit();assert.equal(calls,1,file);assert(h.find(n=>n.type==='form').props['aria-busy']);
      resolve({error:{name:'AuthRetryableFetchError'}});await pending;assert(h.find(n=>n.props.role==='alert'));assert.equal(h.paths.length,0);assert(!h.find(n=>n.type==='form').props['aria-busy']);
      if(h.find(n=>n.props.id==='email'))assert.equal(h.find(n=>n.props.id==='email').props.value,'fixture@example.test');
    }
  } finally {global.window=oldWindow;}
});
test('logout asks before discarding draft, waits for Auth, blocks duplicates and fully replaces navigation after success',async()=>{
  const previous=global.window;const paths=[];global.window={location:{replace:p=>paths.push(p)}};
  let allowed=false,calls=0,resolve,approved=0;const slots=[];let cursor=0;
  const react={useState(v){const i=cursor++;slots[i]??={value:v};return [slots[i].value,next=>{slots[i].value=next;}];},useRef(v){const i=cursor++;slots[i]??={current:v};return slots[i];}};
  const {LogoutButton}=withStubs('components/logout-button.tsx',{
    react,'lucide-react':{LogOut:'icon'},'@/components/ui/button':{Button:'button'},
    '@/lib/forms/draft-protection':{confirmPageLeave:()=>allowed,allowPageLeave:()=>{approved++;}},
    '@/lib/supabase/client':{createClient:()=>({auth:{signOut:()=>{calls++;return new Promise(r=>{resolve=r;});}}})},
  });
  const button=()=>{cursor=0;return LogoutButton({}).props.children[0];};
  try {await button().props.onClick();assert.equal(calls,0);allowed=true;const pending=button().props.onClick();await button().props.onClick();assert.equal(calls,1);assert.deepEqual(paths,[]);resolve({error:null});await pending;assert.equal(approved,1);assert.deepEqual(paths,['/auth/login?logout=success']);}
  finally {global.window=previous;}
});
test('public authentication screens hide application sidebar, bottom navigation and global add menu',()=>{
  const stubs={'next/navigation':{usePathname:()=>'/auth/login'},'next/link':{default:'a'},'lucide-react':{Wallet:'i'},
    './FloatingAddButton':{FloatingAddButton:()=>null},'@/components/theme/ThemeToggle':{ThemeToggle:()=>null},'@/components/ui/button':{Button:'button'},'@/components/ui/dropdown-menu':{}};
  for(const [file,name] of [['Sidebar','Sidebar'],['BottomNavigation','BottomNavigation'],['FloatingAddButton','FloatingAddButton']]) {
    const subject=withStubs('components/navigation/'+file+'.tsx',stubs);assert.equal(subject[name](),null,name);
  }
});

test('auth network and missing-session errors remain actionable and never show internal detail',()=>{
  const {authErrorMessage}=load('lib/auth/policy.ts');assert(authErrorMessage({name:'AuthSessionMissingError',message:'private UUID SQL'}).includes('Entre novamente'));assert(authErrorMessage({name:'AuthRetryableFetchError'}).includes('conexão'));assert(!authErrorMessage({message:'private UUID SQL'}).includes('SQL'));
});

test('unexpected errors and missing routes offer safe Portuguese recovery without exposing the exception',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');let retries=0;
  const stubs={'next/link':{default:'a'},'@/components/ui/button':{Button:'button'}};
  const {default:ErrorPage}=withStubs('app/error.tsx',stubs),{default:NotFound}=withStubs('app/not-found.tsx',stubs);
  const node=ErrorPage({error:Error('private SQL/token/UUID'),retry:()=>{retries++;}});
  node.props.children.find(n=>n.type==='button').props.onClick();assert.equal(retries,1);
  const html=renderToStaticMarkup(node);assert(html.includes('Tentar novamente'));assert(!html.includes('private'));assert(html.includes('/hoje'));assert(renderToStaticMarkup(React.createElement(NotFound)).includes('Página não encontrada'));
});
