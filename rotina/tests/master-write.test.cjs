/* eslint-disable @typescript-eslint/no-require-imports -- Node tests without browser credentials. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {fixture,owner}=require('./helpers/data-fixtures.cjs');
const {saveBancoMestreActivity}=load('lib/banco-mestre/data/write-model.ts');
const errors=load('lib/banco-mestre/data/errors.ts');

test('write boundary validates create/edit revision and payload before calling repository',async()=>{
  const bundle=fixture('academia');const calls=[];
  const factory=async()=>({saveActivity:async(...args)=>{const [b,r]=args;calls.push(args);return {bundle:b,revision:(r??0)+1};}});
  assert.deepEqual(await saveBancoMestreActivity(factory,{mode:'create',bundle}),{ok:true,activityId:bundle.activity.id,revision:1});
  assert.deepEqual(await saveBancoMestreActivity(factory,{mode:'edit',bundle,expectedRevision:7}),{ok:true,activityId:bundle.activity.id,revision:8});
  assert.equal(calls[0].length,1);assert.equal(calls[1].length,2);
  assert.equal(calls[0][1],undefined);assert.equal(calls[1][1],7);
  for(const input of [null,{}, {mode:'edit',bundle},{mode:'edit',bundle,expectedRevision:1.5},{mode:'edit',bundle,expectedRevision:0},{mode:'create',bundle,expectedRevision:7},{mode:'create',bundle:{activity:{}}},{mode:'create',bundle:{...bundle,user_id:owner}},{mode:'create',bundle:{...bundle,activity:{...bundle.activity,duration:{mode:'fixed',minutes:30.5}}}}]) {
    const result=await saveBancoMestreActivity(async()=>{throw Error('must not access repository');},input);
    assert.equal(result.ok,false);assert.equal(result.kind,'Validation');
  }
});
test('write errors preserve safe categories, without raw SQL/ownership/auth diagnostics',async()=>{
  const bundle=fixture('academia');
  for(const [code,kind] of [['PT409','Conflict'],['42501','Unauthorized'],['23514','Validation'],['40001','Conflict'],['XX000','Unknown']]) {
    const result=await saveBancoMestreActivity(async()=>({saveActivity:async()=>{throw {code,message:'private cookie token email SQL',details:owner};}}),{mode:'edit',bundle,expectedRevision:1});
    assert.equal(result.ok,false);assert.equal(result.kind,kind);assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes(owner));
  }
});
function actionHarness({sub=owner,code=null}={}) {
  const calls=[],invalidated=[];
  const action=withStubs('app/banco-mestre/actions.ts',{
    'next/cache':{revalidatePath:path=>invalidated.push(path)},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>{calls.push('auth');return {data:{claims:{sub}},error:null};}}})},
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>({saveActivity:async(bundle,revision)=>{calls.push(['save',revision]);if(code)throw {code,message:'private SQL'};return {bundle,revision:(revision??0)+1};}})},
    '@/lib/banco-mestre/data/errors':errors,
    '@/lib/banco-mestre/data/write-model':{saveBancoMestreActivity},
  });
  return {...action,calls,invalidated};
}
test('server action requires verified session and invalidates list/detail only after success',async()=>{
  const bundle=fixture('academia');
  const denied=actionHarness({sub:null});assert.equal((await denied.saveMasterActivity({mode:'create',bundle})).kind,'Unauthorized');assert.deepEqual(denied.calls,['auth']);assert.deepEqual(denied.invalidated,[]);
  const conflict=actionHarness({code:'PT409'});assert.equal((await conflict.saveMasterActivity({mode:'edit',bundle,expectedRevision:3})).kind,'Conflict');assert.deepEqual(conflict.invalidated,[]);
  const valid=actionHarness();const result=await valid.saveMasterActivity({mode:'create',bundle});assert.equal(result.ok,true);assert.deepEqual(valid.calls,['auth',['save',undefined]]);assert.deepEqual(valid.invalidated,['/banco-mestre','/banco-mestre/'+bundle.activity.id]);
  assert.deepEqual(Object.keys(result).sort(),['activityId','ok','revision']);
});
test('new/edit pages load real areas and preserve the aggregate revision for the existing form',async()=>{
  const reads=load('lib/banco-mestre/data/read-model.ts');
  const bundle=fixture('academia'),areas=[{id:bundle.activity.areaId,name:'Server area',active:false}];
  const factory=async()=>({listAreas:async()=>areas,listActivities(){throw Error('unexpected list query');},getActivity:async id=>{assert.equal(id,bundle.activity.id);return {bundle,revision:19};}});
  const stubs={
    '@/components/banco-mestre/ActivityForm':{ActivityForm:'ActivityForm'},
    '@/components/banco-mestre/ActivityDetail':{ActivityRouteView:'ActivityRouteView'},
    '@/lib/banco-mestre/data/read-model':reads,
    '@/lib/banco-mestre/data/server-reader':{createBancoMestreReader:factory},
  };
  const New=withStubs('app/banco-mestre/nova/page.tsx',stubs).default;
  const fresh=await New().props.children.type();assert.equal(fresh.type,'ActivityForm');assert.deepEqual(fresh.props.areas,areas);assert(!fresh.props.initial);
  const Edit=withStubs('app/banco-mestre/[id]/editar/page.tsx',stubs).default;
  const page=Edit({params:Promise.resolve({id:bundle.activity.id})});
  const existing=await page.props.children.type(page.props.children.props);
  assert.equal(existing.props.initial,bundle);assert.equal(existing.props.expectedRevision,19);assert.deepEqual(existing.props.areas,areas);
  const invalid=Edit({params:Promise.resolve({id:'old-mock-id'})});
  const unavailable=await invalid.props.children.type(invalid.props.children.props);assert.equal(unavailable.type,'ActivityRouteView');assert.equal(unavailable.props.result.status,'error');
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function formHarness(props,action) {
  const slots=[];let cursor=0;const navigations=[];
  const react={
    useId(){cursor++;return 'test-form';},
    useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
  };
  const ui=Object.fromEntries(['Button','Card','CardContent','Checkbox','Input','Label'].map(name=>[name,name]));
  const {ActivityForm}=withStubs('components/banco-mestre/ActivityForm.tsx',{
    react,'next/navigation':{useRouter:()=>({push:path=>navigations.push(path),replace:path=>navigations.push(path),refresh(){throw Error('unexpected automatic reload');}})},
    'next/link':{default:'a'},...Object.fromEntries(['button','card','checkbox','input','label'].map(name=>['@/components/ui/'+name,ui])),
    '@/app/banco-mestre/actions':{saveMasterActivity:action},'@/lib/banco-mestre/data/errors':errors,
    '@/lib/banco-mestre/editor':load('lib/banco-mestre/editor.ts'),'@/lib/banco-mestre/presentation':load('lib/banco-mestre/presentation.ts'),
  });
  const render=()=>{cursor=0;return ActivityForm(props);};
  function nodes(node,predicate){if(!node||typeof node!=='object')return [];return [...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];}
  const field=(tree,name)=>nodes(tree,node=>node.props?.['data-field']===name)[0];
  const text=tree=>JSON.stringify(tree,(key,value)=>typeof value==='function'?undefined:value);
  const event={preventDefault(){}};
  return {render,nodes,field,text,event,navigations};
}
test('create form waits for confirmation, blocks double submit and navigates only with saved ID',async()=>{
  const gate=deferred(),calls=[];const area={id:crypto.randomUUID(),name:'Real area',active:true};
  const h=formHarness({areas:[area]},async input=>{calls.push(input);return gate.promise;});
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Created for real'}});h.field(tree,'areaId').props.onChange({target:{value:area.id}});tree=h.render();
  const pending=tree.props.onSubmit(h.event);await tree.props.onSubmit(h.event);
  assert.equal(calls.length,1);assert.equal(calls[0].mode,'create');assert(!('expectedRevision' in calls[0]));assert.deepEqual(h.navigations,[]);
  const busy=h.render();assert.equal(busy.props['aria-busy'],true);assert(h.nodes(busy,n=>n.type==='fieldset'&&n.props.disabled).length);assert(h.text(busy).includes('Salvando'));
  gate.resolve({ok:true,activityId:calls[0].bundle.activity.id,revision:1});await pending;
  assert.deepEqual(h.navigations,['/banco-mestre/'+calls[0].bundle.activity.id]);assert(h.text(h.render()).includes('Item salvo'));
  await tree.props.onSubmit(h.event);assert.equal(calls.length,1);
});
test('edit conflict keeps draft and old revision, blocks overwrite, reload requires confirmation',async()=>{
  const bundle=fixture('academia'),calls=[];
  const h=formHarness({initial:bundle,expectedRevision:7,areas:[{id:bundle.activity.areaId,name:'Area',active:true}]},async input=>{calls.push(input);return {ok:false,kind:'Conflict',message:'Atualize antes de salvar.'};});
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Unsaved draft'}});tree=h.render();await tree.props.onSubmit(h.event);
  const failed=h.render();assert.equal(calls[0].expectedRevision,7);assert.equal(h.field(failed,'name').props.value,'Unsaved draft');assert(h.text(failed).includes('mantidas'));assert.deepEqual(h.navigations,[]);
  await failed.props.onSubmit(h.event);assert.equal(calls.length,1);
  const reload=h.nodes(failed,n=>n.props?.children==='Recarregar versão salva')[0];
  const previous=global.window;let reloads=0;let consent=false;
  global.window={confirm:()=>consent,location:{reload:()=>reloads++}};
  try {reload.props.onClick();assert.equal(reloads,0);consent=true;reload.props.onClick();assert.equal(reloads,1);}finally{global.window=previous;}
});
test('network failure keeps draft and stable create UUID; validation never sends invalid form',async()=>{
  const calls=[],area={id:crypto.randomUUID(),name:'Area',active:true};
  const h=formHarness({areas:[area]},async input=>{calls.push(input);throw Error('private network details');});
  const oldAnimation=global.requestAnimationFrame;global.requestAnimationFrame=fn=>fn();
  try {await h.render().props.onSubmit(h.event);}finally{global.requestAnimationFrame=oldAnimation;}
  assert.equal(calls.length,0);
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Preserved'}});h.field(tree,'areaId').props.onChange({target:{value:area.id}});tree=h.render();await tree.props.onSubmit(h.event);
  const retry=h.render();assert.equal(h.field(retry,'name').props.value,'Preserved');assert(!h.text(retry).includes('private network'));assert.equal(retry.props['aria-busy'],false);assert.deepEqual(h.navigations,[]);
  await retry.props.onSubmit(h.event);assert.equal(calls.length,2);assert.equal(calls[0].bundle.activity.id,calls[1].bundle.activity.id);
});
test('edit preserves its inactive area as an option, without admitting other inactive areas',()=>{
  const bundle=fixture('academia'),active={id:crypto.randomUUID(),name:'Active',active:true},other={id:crypto.randomUUID(),name:'Other inactive',active:false};
  const h=formHarness({initial:bundle,expectedRevision:1,areas:[{id:bundle.activity.areaId,name:'Original inactive',active:false},active,other]},async()=>{throw Error('unexpected save');});
  let tree=h.render();h.field(tree,'areaId').props.onChange({target:{value:active.id}});tree=h.render();
  const options=h.nodes(h.field(tree,'areaId'),n=>n.type==='option').map(n=>n.props.value);
  assert(options.includes(bundle.activity.areaId));assert(options.includes(active.id));assert(!options.includes(other.id));
});

test('validation, expired session and unavailable item keep the edited form with safe guidance',async()=>{
  for(const kind of ['Validation','Unauthorized','NotFound']) {
    const bundle=fixture('academia');
    const message=new errors.PersistenceError(kind).message;
    const h=formHarness({initial:bundle,expectedRevision:4,areas:[{id:bundle.activity.areaId,name:'Real area',active:true}]},async()=>({ok:false,kind,message}));
    let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Draft retained'}});
    tree=h.render();await tree.props.onSubmit(h.event);tree=h.render();
    assert.equal(h.field(tree,'name').props.value,'Draft retained');
    assert(h.text(tree).includes(message));assert.deepEqual(h.navigations,[]);
    assert.equal(tree.props['aria-busy'],false);
    if(kind==='Unauthorized') assert(h.nodes(tree,n=>n.props?.href==='/auth/login').length);
  }
  assert.match(errors.toPersistenceError({code:'PT409',message:'private SQL'}).message,/outra sessão/);
});

test('edit success uses original revision and redirects to the repository result without mock dependencies',async()=>{
  const bundle=fixture('academia'),calls=[],savedId=crypto.randomUUID();
  const h=formHarness({initial:bundle,expectedRevision:11,areas:[{id:bundle.activity.areaId,name:'Real area',active:true}]},async input=>{calls.push(input);return {ok:true,activityId:savedId,revision:12};});
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Updated'}});
  tree=h.render();await tree.props.onSubmit(h.event);
  assert.equal(calls[0].expectedRevision,11);assert.equal(calls[0].bundle.activity.name,'Updated');
  assert.deepEqual(h.navigations,['/banco-mestre/'+savedId]);
  const fs=require('node:fs');const path=require('node:path');
  for(const file of ['app/banco-mestre/actions.ts','components/banco-mestre/ActivityForm.tsx','lib/banco-mestre/data/write-model.ts']) {
    const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
    assert(!/from\s+['"][^'"]*mock/i.test(source));
    assert(!/localStorage|useBancoMestre/.test(source));
  }
});
