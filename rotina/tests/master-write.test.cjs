/* eslint-disable @typescript-eslint/no-require-imports -- Node tests without browser credentials. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {fixture,owner}=require('./helpers/data-fixtures.cjs');
const {saveBancoMestreActivity}=load('lib/banco-mestre/data/write-model.ts');
const errors=load('lib/banco-mestre/data/errors.ts');

test('safe server diagnostics distinguish causes and never serialize raw error, payload, SQL text or credentials',async()=>{
  for(const [cause,category] of [
    [{code:'PT409'},'conflict'],[{code:'40001'},'conflict'],[{code:'23514'},'constraint'],[{code:'42501'},'permission'],
    [{code:'PGRST202'},'rpc'],[{code:'42883'},'rpc'],[{code:'PGRST301'},'authentication'],
    [new errors.MapperError('duration.minutes'),'validation'],[new TypeError('fetch failed'),'network'],[Error('secret SQL'),'unexpected'],
  ])assert.equal(errors.saveFailureDiagnostic(new errors.PersistenceError('Unknown',cause)).category,category);
  const previous=process.env.NODE_ENV,logger=console.error,events=[];process.env.NODE_ENV='development';console.error=(...args)=>events.push(args);
  try{
    const raw={code:'PGRST202',message:'private SQL activity content',details:'token=secret',hint:'private account'};
    const result=await saveBancoMestreActivity(async()=>({saveActivity:async()=>{throw new errors.PersistenceError('Unknown',raw);}}),{mode:'edit',bundle:fixture('academia'),expectedRevision:7});
    assert.equal(result.ok,false);assert.match(result.message,/atualização do banco/);
    assert.deepEqual(events,[['[BancoMestre/save]',JSON.stringify({category:'rpc',code:'PGRST202',missingRpc:true})]]);
    assert(!JSON.stringify([events,result]).includes('private'));assert(!JSON.stringify([events,result]).includes('secret'));
  }finally{console.error=logger;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

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

test('explicit deletion intent is validated before auth and forwarded with aggregate CAS only in edit',async()=>{
  const bundle={...fixture('academia'),subitems:{mode:'custom',items:[]}},removed=crypto.randomUUID(),calls=[];
  const factory=async()=>({saveActivity:async(...args)=>{calls.push(args);return {bundle,revision:8};}});
  assert((await saveBancoMestreActivity(factory,{mode:'edit',bundle,expectedRevision:7,deletedSubitemIds:[removed]})).ok);
  assert.deepEqual(calls[0],[bundle,7,[removed]]);
  for(const input of [
    {mode:'create',bundle,deletedSubitemIds:[removed]},
    {mode:'edit',bundle,expectedRevision:7,deletedSubitemIds:[removed,removed]},
    {mode:'edit',bundle,expectedRevision:7,deletedSubitemIds:['invalid']},
    {mode:'edit',bundle:fixture('academia'),expectedRevision:7,deletedSubitemIds:[removed]},
  ])assert.equal((await saveBancoMestreActivity(async()=>{throw Error('must not authenticate');},input)).kind,'Validation');
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
  const valid=actionHarness();const result=await valid.saveMasterActivity({mode:'create',bundle});assert.equal(result.ok,true);assert.deepEqual(valid.calls,['auth',['save',undefined]]);assert.deepEqual(valid.invalidated,['/banco-mestre','/banco-mestre/'+bundle.activity.id,'/planejamento','/hoje','/calendario']);
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
  let cleanup;
  const react={
    useLayoutEffect(setup){cursor++;cleanup??=setup();},
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
  const hide=()=>{cleanup?.();cleanup=undefined;};
  return {render,nodes,field,text,event,navigations,hide};
}

test('Activity hide/show retires completed creation: A then fresh B with distinct ID and no automatic writes',async()=>{
  const calls=[],area={id:crypto.randomUUID(),name:'Area',active:true};
  const h=formHarness({areas:[area]},async input=>{
    calls.push(input);return {ok:true,activityId:input.bundle.activity.id,revision:1};
  });
  for(const name of ['Item A','Item B']) {
    let tree=h.render();assert.equal(tree.type,'form');
    assert.equal(h.field(tree,'name').props.value,'');
    assert.equal(h.field(tree,'areaId').props.value,'');
    assert(!h.text(tree).includes('Item salvo'));
    assert(!h.text(tree).includes('Alterações não salvas'));
    h.field(tree,'name').props.onChange({target:{value:name}});
    h.field(tree,'areaId').props.onChange({target:{value:area.id}});
    tree=h.render();await tree.props.onSubmit(h.event);
    const saved=h.render();assert(h.text(saved).includes('Item salvo'));
    const id=calls.at(-1).bundle.activity.id;
    assert(h.nodes(saved,n=>n.props?.href==='/banco-mestre/'+id).length);
    await tree.props.onSubmit(h.event); // Still blocked while success is visible.
    assert.equal(calls.length,name==='Item A'?1:2);
    h.hide(); // Same hook slots survive navigation, just like React Activity.
    h.render();assert.equal(calls.length,name==='Item A'?1:2);
  }
  assert.notEqual(calls[0].bundle.activity.id,calls[1].bundle.activity.id);
  assert.deepEqual(calls.map(c=>[c.mode,c.bundle.activity.name]),[['create','Item A'],['create','Item B']]);
  assert.deepEqual(h.navigations,calls.map(c=>'/banco-mestre/'+c.bundle.activity.id));
});

test('Activity cleanup preserves unsaved creation, failed save and existing edit',async()=>{
  const area={id:crypto.randomUUID(),name:'Area',active:true};
  for(const initial of [undefined,fixture('academia')]) {
    const h=formHarness({initial,expectedRevision:initial?3:undefined,areas:[initial?{...area,id:initial.activity.areaId}:area]},async()=>({ok:false,kind:'Unknown',message:'Try again'}));
    let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Draft'}});
    h.hide();tree=h.render();assert.equal(h.field(tree,'name').props.value,'Draft');
    if(!initial)h.field(tree,'areaId').props.onChange({target:{value:area.id}});
    tree=h.render();await tree.props.onSubmit(h.event);
    h.hide();tree=h.render();assert.equal(h.field(tree,'name').props.value,'Draft');
    assert(h.text(tree).includes('Try again'));
  }
});
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

test('missing/only-inactive areas link directly to management without writes or automatic selection; original inactive association stays editable',()=>{
  let writes=0;const action=async()=>{writes++;throw Error('unexpected write');};
  for(const [areas,label,heading] of [[[],'Criar primeira área','Crie sua primeira área'],[[{id:crypto.randomUUID(),name:'Inactive',active:false}],'Criar ou reativar área','Todas as áreas estão inativas']]) {
    const h=formHarness({areas},action);const tree=h.render();
    assert(h.text(tree).includes(heading));
    const links=h.nodes(tree,n=>n.props?.href==='/banco-mestre/areas?returnTo=/banco-mestre/nova');assert.equal(links.length,1);assert.equal(links[0].props.children,label);
    assert(h.nodes(tree,n=>n.props?.href==='/banco-mestre').length);
    assert(!h.nodes(tree,n=>n.type==='form').length);assert.deepEqual(h.navigations,[]);
  }
  const active=formHarness({areas:[{id:crypto.randomUUID(),name:'Active',active:true}]},action);
  assert.equal(active.field(active.render(),'areaId').props.value,'');
  const bundle=fixture('academia');
  const edit=formHarness({initial:bundle,expectedRevision:2,areas:[{id:bundle.activity.areaId,name:'Original inactive',active:false}]},action);
  const tree=edit.render();assert(tree.props.onSubmit);assert.equal(edit.field(tree,'areaId').props.value,bundle.activity.areaId);
  assert(!edit.text(tree).includes('Todas as áreas estão inativas'));assert.equal(writes,0);
});

test('New item rereads areas after the return link for first creation/reactivation without selecting or saving automatically',async()=>{
  const reads=load('lib/banco-mestre/data/read-model.ts');
  const navigation=load('lib/banco-mestre/area-navigation.ts');
  const active={id:crypto.randomUUID(),name:'Available after management',active:true};
  let currentAreas=[],readsCount=0,writes=0;
  const Page=withStubs('app/banco-mestre/nova/page.tsx',{
    '@/components/banco-mestre/ActivityForm':{ActivityForm:'ActivityForm'},
    '@/lib/banco-mestre/data/read-model':reads,
    '@/lib/banco-mestre/data/server-reader':{createBancoMestreReader:async()=>({listAreas:async()=>{readsCount++;return currentAreas;}})},
  }).default;
  const content=async()=>{const page=Page();return page.props.children.type(page.props.children.props);};
  for(const before of [[],[{...active,active:false}]]) {
    currentAreas=before;
    const initial=await content();const blocked=formHarness(initial.props,async()=>{writes++;});
    const link=blocked.nodes(blocked.render(),n=>n.props?.href?.startsWith('/banco-mestre/areas?'))[0];
    const target=new URL(link.props.href,'http://localhost:3000');
    assert.equal(target.pathname,'/banco-mestre/areas');assert.equal(navigation.areaReturnTo(target.searchParams.get('returnTo')),'/banco-mestre/nova');
    currentAreas=[active]; // New server read after confirmed creation/reactivation.
    const returned=await content();assert.deepEqual(returned.props.areas,[active]);
    const form=formHarness(returned.props,async()=>{writes++;});const tree=form.render();
    assert(tree.props.onSubmit);assert.equal(form.field(tree,'areaId').props.value,'');assert(form.text(tree).includes(active.name));
    assert.deepEqual(form.navigations,[]);
  }
  assert.equal(readsCount,4);assert.equal(writes,0);
});

test('mixed active/inactive areas keep normal creation unselected and permit editing the original inactive association',()=>{
  let writes=0;const action=async()=>{writes++;};
  const bundle=fixture('academia');
  const inactive={id:bundle.activity.areaId,name:'Original inactive',active:false};
  const active={id:crypto.randomUUID(),name:'Selectable active',active:true};
  const create=formHarness({areas:[inactive,active]},action);const tree=create.render();
  assert(tree.props.onSubmit);assert.equal(create.field(tree,'areaId').props.value,'');
  const options=create.nodes(create.field(tree,'areaId'),n=>n.type==='option').map(n=>n.props.value);
  assert(options.includes(active.id));assert(!options.includes(inactive.id));
  assert(!create.nodes(tree,n=>n.props?.href?.startsWith('/banco-mestre/areas?')).length);
  const edit=formHarness({initial:bundle,expectedRevision:7,areas:[inactive,active]},action);const editing=edit.render();
  assert(editing.props.onSubmit);assert.equal(edit.field(editing,'areaId').props.value,inactive.id);
  assert.equal(writes,0);
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
  h.hide();assert(h.text(h.render()).includes('Item salvo'));
  const fs=require('node:fs');const path=require('node:path');
  for(const file of ['app/banco-mestre/actions.ts','components/banco-mestre/ActivityForm.tsx','lib/banco-mestre/data/write-model.ts']) {
    const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
    assert(!/from\s+['"][^'"]*mock/i.test(source));
    assert(!/localStorage|useBancoMestre/.test(source));
  }
});

test('V0.4 new Activity resets subitem IDs/defaults after completed creation, preserving unfinished tree drafts',async()=>{
  const area={id:crypto.randomUUID(),name:'Area',active:true},calls=[];
  const h=formHarness({areas:[area]},async input=>{calls.push(input);return {ok:true,activityId:input.bundle.activity.id,revision:2};});
  const editor=()=>h.nodes(h.render(),n=>n.props?.value?.items&&n.props?.onChange)[0];
  const leaf={id:crypto.randomUUID(),parentId:null,name:'Leaf',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true};
  editor().props.onChange({mode:'custom',items:[leaf]});h.hide();assert.equal(editor().props.value.items[0].id,leaf.id);
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'A'}});h.field(tree,'areaId').props.onChange({target:{value:area.id}});
  await h.render().props.onSubmit(h.event);assert.equal(calls[0].bundle.subitems.items[0].id,leaf.id);
  h.hide();assert.deepEqual(editor().props.value,{mode:'all',items:[]});
  tree=h.render();assert.equal(h.field(tree,'name').props.value,'');
});

test('V0.5 checklist definition draft survives hide; completed New item clears checks and never reuses their IDs',async()=>{
  const area={id:crypto.randomUUID(),name:'Area',active:true},calls=[];
  const h=formHarness({areas:[area]},async input=>{calls.push(input);return {ok:true,activityId:input.bundle.activity.id,revision:2};});
  h.field(h.render(),'type').props.onChange({target:{value:'checklistGoal'}});
  const checks=()=>h.nodes(h.render(),n=>Array.isArray(n.props?.value)&&n.props?.onChange)[0];
  checks().props.onTextChange('Texto ainda no campo');h.hide();assert.equal(checks().props.text,'Texto ainda no campo');assert.equal(calls.length,0);checks().props.onTextChange('');
  const definition=[{id:crypto.randomUUID(),label:'First check'}];checks().props.onChange(definition);
  h.hide();assert.deepEqual(checks().props.value,definition);assert.equal(calls.length,0);
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Checklist A'}});h.field(tree,'areaId').props.onChange({target:{value:area.id}});
  assert(!h.nodes(h.render(),n=>n.props?.children==='Adicionar meta').length);
  await h.render().props.onSubmit(h.event);assert.equal(calls.length,1);assert.deepEqual(calls[0].bundle.checklistItems,definition);
  assert.deepEqual(calls[0].bundle.goals,[]);
  h.hide();tree=h.render();assert.equal(h.field(tree,'name').props.value,'');
  h.field(tree,'type').props.onChange({target:{value:'checklistGoal'}});assert.deepEqual(checks().props.value,[]);assert.equal(calls.length,1);
});

test('quantity mode restores numeric editing; switching modes retains data without duplicate controls',async()=>{
 const initial=fixture('escovar'),calls=[];
 const h=formHarness({initial,expectedRevision:7,areas:[{id:initial.activity.areaId,name:'Area',active:true}]},async input=>{calls.push(input);return {ok:true,activityId:initial.activity.id,revision:9};});
 let tree=h.render();assert.equal(h.field(tree,'trackingMode').props.value,'quantity');assert(h.field(tree,'goals.0.minimum'));assert(h.field(tree,'goals.0.period'));assert(!h.nodes(tree,n=>Array.isArray(n.props?.value)&&n.props?.onChange).length);
 h.field(tree,'goals.0.minimum').props.onChange({target:{value:'8'}});h.field(h.render(),'goals.0.ideal').props.onChange({target:{value:''}});
 h.field(h.render(),'trackingMode').props.onChange({target:{value:'checklist'}});
 tree=h.render();assert(!h.nodes(tree,n=>n.props?.['data-field']==='goals.0.minimum').length);
 const definition=[{id:crypto.randomUUID(),label:'Texto revisado'}];h.nodes(tree,n=>Array.isArray(n.props?.value)&&n.props?.onChange)[0].props.onChange(definition);
 h.field(h.render(),'trackingMode').props.onChange({target:{value:'quantity'}});assert.equal(h.field(h.render(),'goals.0.minimum').props.value,'8');
 await h.render().props.onSubmit(h.event);assert.equal(calls.length,1);assert.equal(calls[0].bundle.trackingMode,'quantity');assert.equal(calls[0].bundle.goals[0].minimumTarget,8);assert.deepEqual(calls[0].bundle.checklistItems,definition);
});

test('removing persisted and local subitems stages only persisted IDs until save, retaining draft on conflict',async()=>{
  const leaf={id:crypto.randomUUID(),parentId:null,name:'Persisted',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true};
  const initial={...fixture('academia'),subitems:{mode:'custom',items:[leaf]}},calls=[];
  const h=formHarness({initial,expectedRevision:7,areas:[{id:initial.activity.areaId,name:'Area',active:true}]},async input=>{calls.push(input);return {ok:false,kind:'Conflict',message:'Recarregue os dados mais recentes'};});
  const editor=()=>h.nodes(h.render(),n=>n.props?.value?.items&&n.props?.onChange)[0];
  editor().props.onChange({mode:'custom',items:[leaf,{...leaf,id:crypto.randomUUID(),name:'Local'}]});
  editor().props.onChange({mode:'custom',items:[leaf]});assert.equal(calls.length,0);
  editor().props.onChange({mode:'custom',items:[]});h.hide();assert.deepEqual(editor().props.value.items,[]);assert.equal(calls.length,0);
  await h.render().props.onSubmit(h.event);assert.equal(calls.length,1);
  assert.deepEqual(calls[0].deletedSubitemIds,[leaf.id]);assert.equal(calls[0].expectedRevision,7);
  assert.equal(calls[0].bundle.activity.duration.mode,'unknown');
  assert(h.text(h.render()).includes('Recarregue'));assert.equal(h.navigations.length,0);
  await h.render().props.onSubmit(h.event);assert.equal(calls.length,1);
});

test('logout in another tab: editor POST passes proxy, action denies write and form retains draft with login',async()=>{
  const bundle=fixture('academia');let session=true;let action;
  const policy=load('lib/auth/policy.ts');
  const response=()=>({headers:new Headers(),cookies:{getAll:()=>[],set(){}}});
  const {updateSession}=withStubs('lib/supabase/proxy.ts',{
    'next/server':{NextResponse:{next:response,redirect:()=>({...response(),redirected:true})}},
    './configuration':{getSupabasePublicConfig:()=>({url:'https://example.com',key:'test-only'})},
    '@/lib/auth/policy':policy,
    '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>({data:{user:session?{id:owner}:null},error:null})}})},
  });
  const request=method=>{const url=new URL('http://localhost:3000/banco-mestre/'+bundle.activity.id+'/editar');url.clone=()=>new URL(url);return {method,nextUrl:url,headers:new Headers({'Next-Action':'test-action'}),cookies:{getAll:()=>[],set(){}}};};
  assert(!((await updateSession(request('GET'))).redirected));
  const h=formHarness({initial:bundle,expectedRevision:7,areas:[{id:bundle.activity.areaId,name:'Real area',active:true}]},async input=>{
    const gate=await updateSession(request('POST'));
    assert(!gate.redirected,'redirect would turn the Server Action result into a transport failure');
    action=actionHarness({sub:session?owner:null});return action.saveMasterActivity(input);
  });
  let tree=h.render();h.field(tree,'name').props.onChange({target:{value:'Unsaved after logout'}});
  session=false; // Normal logout removes the session shared by both tabs.
  assert((await updateSession(request('GET'))).redirected);
  tree=h.render();await tree.props.onSubmit(h.event);tree=h.render();
  assert.equal(h.field(tree,'name').props.value,'Unsaved after logout');
  assert(h.text(tree).includes('Entrar novamente'));assert(h.nodes(tree,n=>n.props?.href==='/auth/login').length);
  assert(!h.text(tree).includes('Não foi possível concluir a operação'));
  assert.deepEqual(action.calls,['auth']);assert.deepEqual(action.invalidated,[]);assert.deepEqual(h.navigations,[]);
});
