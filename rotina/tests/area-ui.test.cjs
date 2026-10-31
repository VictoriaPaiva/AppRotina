/* eslint-disable @typescript-eslint/no-require-imports -- Node UI tests without browser credentials. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {PersistenceError,toPersistenceError}=load('lib/banco-mestre/data/errors.ts');
const {readManagedAreas}=load('lib/banco-mestre/data/area-read-model.ts');
const {owner}=require('./helpers/data-fixtures.cjs');
const navigation=load('lib/banco-mestre/area-navigation.ts');
const area={id:'10000000-0000-4000-8000-000000000001',name:'Área real',active:true,sortPosition:37,updatedAt:'2026-10-20T10:00:00.123456Z'};
const snapshot=({name,active,sortPosition,updatedAt})=>({name,active,sortPosition,updatedAt});
const actions={createMasterArea:async()=>{throw Error('unexpected creation');},renameMasterArea:async()=>{throw Error('unexpected rename');},setMasterAreaActive:async()=>{throw Error('unexpected state change');}};
const ui={Button:'button',Card:'div',CardContent:'div',Badge:'span',Input:'input',Label:'label'};
function stubs(extra={}) {return {'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':{default:'a'},...Object.fromEntries(['button','card','badge','input','label'].map(name=>['@/components/ui/'+name,ui])),
  '@/app/banco-mestre/area-actions':actions,'@/lib/banco-mestre/data/errors':{toPersistenceError},'@/lib/banco-mestre/area-navigation':navigation,...extra};}

test('areas SSR reader verifies claims per request and exposes only listing',async()=>{
  let sub=owner,instances=0;const calls=[];
  const {createManagedAreasReader}=withStubs('lib/banco-mestre/data/area-server-reader.ts',{
    '@/lib/supabase/server':{createClient:async()=>{instances++;return {auth:{getClaims:async()=>({data:{claims:{sub}},error:null})}};}},
    './area-repository':{createAreaRepository:(_client,user)=>{calls.push(user);return {listManagedAreas:async()=>[area],createArea(){throw Error('unexpected write');}};}},
    './errors':{PersistenceError},
  });
  const reader=await createManagedAreasReader();assert.deepEqual(Object.keys(reader),['listManagedAreas']);
  assert.deepEqual(await readManagedAreas(async()=>reader),{status:'ready',areas:[area]});
  await createManagedAreasReader();assert.equal(instances,2);assert.deepEqual(calls,[owner,owner]);
  sub=null;assert.equal((await readManagedAreas(createManagedAreasReader)).kind,'Unauthorized');assert.equal(calls.length,2);
});

test('areas page uses Suspense and real SSR listing, including empty/error without fallback data',async()=>{
  let areas=[area];let calls=0;
  const Page=withStubs('app/banco-mestre/areas/page.tsx',{
    '@/components/banco-mestre/AreaManagement':{AreaManagement:'AreaManagement'},
    '@/lib/banco-mestre/data/area-read-model':{readManagedAreas},
    '@/lib/banco-mestre/data/area-server-reader':{createManagedAreasReader:async()=>({listManagedAreas:async()=>{calls++;return areas;}})},
    '@/lib/banco-mestre/area-navigation':navigation,
  }).default;
  const page=Page({searchParams:Promise.resolve({})});assert.equal(page.props.fallback.props.role,'status');
  assert.deepEqual((await page.props.children.type(page.props.children.props)).props.result,{status:'ready',areas:[area]});
  areas=[];assert.deepEqual((await page.props.children.type(page.props.children.props)).props.result,{status:'ready',areas:[]});assert.equal(calls,2);
  const failure=await readManagedAreas(async()=>{throw Error('private SQL');});assert.equal(failure.kind,'Unknown');assert(!failure.message.includes('private'));
});

test('management renders active/inactive/empty/error states without exposing order or delete controls',()=>{
  const elements=Object.fromEntries(Object.entries(ui).map(([name,tag])=>[name,function Element({children,asChild,...props}) {
    delete props.variant;
    return asChild?React.cloneElement(React.Children.only(children),props):React.createElement(tag,props,children);
  }]));
  const {AreaManagement}=withStubs('components/banco-mestre/AreaManagement.tsx',stubs(Object.fromEntries(['button','card','badge','input','label'].map(name=>['@/components/ui/'+name,elements]))));
  const render=result=>renderToStaticMarkup(React.createElement(AreaManagement,{result}));
  const html=render({status:'ready',areas:[area,{...area,id:crypto.randomUUID(),name:'Área desativada',active:false}]});
  for(const text of ['Área real','Área desativada','Ativa','Inativa','Salvar nome','Desativar','Reativar'])assert(html.includes(text));
  for(const hidden of ['sortPosition','sort_position','Excluir','DELETE','Reordenar','Mover para cima','Mover para baixo','Prioridade',area.updatedAt])assert(!html.includes(hidden));
  const empty=render({status:'ready',areas:[]});assert(empty.includes('Você ainda não tem áreas'));assert(empty.includes('Criar primeira área'));
  const inactive=render({status:'ready',areas:[{...area,active:false}]});assert(inactive.includes('Todas as áreas estão inativas'));
  const denied=render({status:'error',kind:'Unauthorized',message:'Entre novamente.'});assert(denied.includes('/auth/login'));assert(!denied.includes('Criar área'));
});

function harness(component,props={},overrides={}) {
  const slots=[];let cursor=0;let refreshes=0;
  const react={useLayoutEffect(){cursor++;},useId(){cursor++;return 'test-row';},useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];}};
  const components=withStubs('components/banco-mestre/AreaManagement.tsx',stubs({react,'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})},'@/app/banco-mestre/area-actions':{...actions,...overrides}}));
  function nodes(node,predicate){if(!node||typeof node!=='object')return [];if(typeof node.type==='function'&&node.type.name==='MutationError')return nodes(node.type(node.props),predicate);return [...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];}
  const render=()=>{cursor=0;return components[component](props);};
  const input=tree=>nodes(tree,n=>n.type==='input')[0];
  const form=tree=>nodes(tree,n=>n.type==='form')[0];
  const button=(tree,text)=>nodes(tree,n=>n.type==='button'&&n.props.children===text)[0];
  return {render,input,form,button,nodes,refreshes:()=>refreshes,event:{preventDefault(){}}};
}

test('creation validates name, preserves draft and UUID on network retry, blocks duplicate submits and refreshes only confirmed success',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const calls=[];
  const h=harness('AreaCreateForm',{}, {createMasterArea:async input=>{calls.push(input);if(calls.length===1)throw Error('private network');return calls.length===2?gate:{ok:true,area:{...area,id:input.id}};}});
  await h.form(h.render()).props.onSubmit(h.event);assert.equal(calls.length,0);
  h.input(h.render()).props.onChange({target:{value:'New real area'}});
  await h.form(h.render()).props.onSubmit(h.event);assert.equal(h.input(h.render()).props.value,'New real area');assert.equal(h.refreshes(),0);
  assert(h.nodes(h.render(),n=>n.type==='p'&&String(n.props.children).includes('a resposta pode ter sido interrompida após o salvamento')).length);
  assert(!h.nodes(h.render(),n=>n.type==='p'&&String(n.props.children).includes('Área criada')).length);
  const pending=h.form(h.render()).props.onSubmit(h.event);await h.form(h.render()).props.onSubmit(h.event);
  assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);assert(!('user_id' in calls[0]));assert.equal(h.refreshes(),0);
  assert.equal(h.form(h.render()).props['aria-busy'],true);
  release({ok:true,area:{...area,id:calls[1].id}});await pending;assert.equal(h.refreshes(),1);
  assert(h.button(h.render(),'Criar outra área'));assert(!h.form(h.render()));
  h.button(h.render(),'Criar outra área').props.onClick();assert.equal(h.input(h.render()).props.value,'');
  h.input(h.render()).props.onChange({target:{value:'Another area'}});
  await h.form(h.render()).props.onSubmit(h.event);assert.equal(calls.length,3);assert.notEqual(calls[2].id,calls[1].id);assert.equal(h.refreshes(),2);
});

test('rename uses exact SSR snapshot and Conflict preserves name without another save; reload requires confirmation',async()=>{
  const calls=[];const h=harness('AreaRow',{area},{renameMasterArea:async input=>{calls.push(input);return {ok:false,kind:'Conflict',message:'Safe conflict'};}});
  h.input(h.render()).props.onChange({target:{value:'Unsaved rename'}});
  await h.form(h.render()).props.onSubmit(h.event);
  assert.deepEqual(calls[0],{id:area.id,name:'Unsaved rename',expected:snapshot(area)});
  assert.equal(h.input(h.render()).props.value,'Unsaved rename');assert.equal(h.refreshes(),0);
  await h.form(h.render()).props.onSubmit(h.event);assert.equal(calls.length,1);
  const previous=global.window;let consent=false,reloads=0;global.window={confirm:()=>consent,location:{reload:()=>reloads++}};
  try {h.button(h.render(),'Recarregar áreas').props.onClick();assert.equal(reloads,0);consent=true;h.button(h.render(),'Recarregar áreas').props.onClick();assert.equal(reloads,1);}finally{global.window=previous;}
});

test('deactivation needs confirmation and reactivation sends explicit true; draft rename prevents state change',async()=>{
  const previous=global.window;let consent=false;global.window={confirm:()=>consent};
  try {
    const calls=[];const h=harness('AreaRow',{area},{setMasterAreaActive:async input=>{calls.push(input);return {ok:true,area:{...area,active:input.active}};}});
    await h.button(h.render(),'Desativar').props.onClick();assert.equal(calls.length,0);
    h.input(h.render()).props.onChange({target:{value:'Draft'}});assert(h.button(h.render(),'Desativar').props.disabled);
    consent=true;await h.button(h.render(),'Desativar').props.onClick();assert.equal(calls.length,0);
    h.button(h.render(),'Restaurar nome').props.onClick();await h.button(h.render(),'Desativar').props.onClick();
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[0].active,false);assert.deepEqual(calls[0].expected,snapshot(area));assert.equal(h.refreshes(),1);
    const other=harness('AreaRow',{area:{...area,active:false}},{setMasterAreaActive:async input=>{calls.push(input);return {ok:true,area};}});
    await other.button(other.render(),'Reativar').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[1].active,true);assert.equal(other.refreshes(),1);
  } finally {global.window=previous;}
});

test('Unauthorized and validation errors keep rename draft and never refresh or navigate automatically',async()=>{
  for(const kind of ['Unauthorized','Validation','NotFound','Unknown']) {
    const h=harness('AreaRow',{area},{renameMasterArea:async()=>({ok:false,kind,message:'Safe error'})});
    h.input(h.render()).props.onChange({target:{value:'Retained'}});await h.form(h.render()).props.onSubmit(h.event);
    assert.equal(h.input(h.render()).props.value,'Retained');assert.equal(h.refreshes(),0);
    if(kind==='Unauthorized')assert(h.nodes(h.render(),n=>n.props?.href==='/auth/login').length);
  }
});

test('rename blocks duplicate pending/completed saves and refreshes only after confirmed action result',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const calls=[];
  const h=harness('AreaRow',{area},{renameMasterArea:async input=>{calls.push(input);return gate;}});
  h.input(h.render()).props.onChange({target:{value:'Changed'}});
  h.form(h.render()).props.onSubmit(h.event);h.form(h.render()).props.onSubmit(h.event);
  assert.equal(calls.length,1);assert.equal(h.refreshes(),0);assert(h.form(h.render()).props['aria-busy']);
  assert(!h.nodes(h.render(),n=>n.type==='p'&&String(n.props.children).includes('Alteração salva')).length);
  release({ok:true,area:{...area,name:'Changed'}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.refreshes(),1);
  assert.equal(h.nodes(h.render(),n=>n.type==='h3')[0].props.children,area.name,'displayed record stays the SSR result until the server refreshes');
  h.form(h.render()).props.onSubmit(h.event);assert.equal(calls.length,1);
});

test('first area creation replaces empty state only when a fresh SSR result arrives',async()=>{
  const props={result:{status:'ready',areas:[]}};
  const page=harness('AreaManagement',props);
  assert(page.nodes(page.render(),n=>n.type==='h2'&&n.props.children==='Você ainda não tem áreas').length);
  let persisted;
  const create=harness('AreaCreateForm',{}, {createMasterArea:async input=>{
    persisted={...area,id:input.id,name:input.name.trim(),sortPosition:0};return {ok:true,area:persisted};
  }});
  create.input(create.render()).props.onChange({target:{value:' Primeira área '}});
  await create.form(create.render()).props.onSubmit(create.event);
  assert.equal(create.refreshes(),1);
  assert(page.nodes(page.render(),n=>n.type==='h2'&&n.props.children==='Você ainda não tem áreas').length,'no optimistic list insertion');
  props.result=await readManagedAreas(async()=>({listManagedAreas:async()=>[persisted]}));
  assert(!page.nodes(page.render(),n=>n.type==='h2'&&n.props.children==='Você ainda não tem áreas').length);
  const row=page.nodes(page.render(),n=>n.type?.name==='AreaRow')[0];
  assert.deepEqual(row.props.area,persisted);assert.equal(row.key,persisted.id+':'+persisted.updatedAt);
  assert.equal(persisted.name,'Primeira área');
});

test('two editor instances keep original snapshots; stale tab retains draft until explicit fresh SSR remount',async()=>{
  const calls=[];const latest={...area,name:'Saved in tab A',updatedAt:'2026-10-20T10:00:01.654321Z'};
  const renameMasterArea=async input=>{
    calls.push(input);
    return calls.length===2?{ok:false,kind:'Conflict',message:'Safe conflict'}:{ok:true,area:latest};
  };
  const a=harness('AreaRow',{area},{renameMasterArea});
  const b=harness('AreaRow',{area},{renameMasterArea});
  a.input(a.render()).props.onChange({target:{value:latest.name}});
  b.input(b.render()).props.onChange({target:{value:'Unsaved in tab B'}});
  a.form(a.render()).props.onSubmit(a.event);await new Promise(resolve=>setImmediate(resolve));
  b.form(b.render()).props.onSubmit(b.event);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(a.refreshes(),1);assert.equal(b.refreshes(),0);
  assert.deepEqual(calls[0].expected,snapshot(area));assert.deepEqual(calls[1].expected,snapshot(area));
  assert.equal(b.input(b.render()).props.value,'Unsaved in tab B');assert(b.button(b.render(),'Recarregar áreas'));
  b.form(b.render()).props.onSubmit(b.event);assert.equal(calls.length,2);
  const page=harness('AreaManagement',{result:{status:'ready',areas:[latest]}});
  const row=page.nodes(page.render(),n=>n.type?.name==='AreaRow')[0];assert.equal(row.key,latest.id+':'+latest.updatedAt);
  const refreshed=harness('AreaRow',row.props,{renameMasterArea});
  assert.equal(refreshed.input(refreshed.render()).props.value,latest.name);
  refreshed.input(refreshed.render()).props.onChange({target:{value:'Intentional new edit'}});
  refreshed.form(refreshed.render()).props.onSubmit(refreshed.event);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls[2].expected,snapshot(latest));
});

test('expired creation keeps name and login option without success, refresh or second automatic attempt',async()=>{
  const calls=[];
  const h=harness('AreaCreateForm',{}, {createMasterArea:async input=>{calls.push(input);return {ok:false,kind:'Unauthorized',message:'Entre novamente.'};}});
  h.input(h.render()).props.onChange({target:{value:'Draft after logout'}});
  await h.form(h.render()).props.onSubmit(h.event);
  assert.equal(calls.length,1);assert.equal(h.input(h.render()).props.value,'Draft after logout');assert.equal(h.refreshes(),0);
  assert(h.nodes(h.render(),n=>n.props?.href==='/auth/login').length);
  assert(!h.button(h.render(),'Criar outra área'));assert.equal(h.form(h.render()).props['aria-busy'],false);
});

test('area return destination accepts only the exact internal New item path',()=>{
  assert.equal(navigation.areaReturnTo('/banco-mestre/nova'),'/banco-mestre/nova');
  for(const value of [undefined,null,'','https://example.com','//example.com','javascript:alert(1)','/auth/login','/banco-mestre/nova?next=https://example.com','/banco-mestre/nova#x','/banco-mestre/nova/','/banco-mestre/../nova','\\example.com','%2Fbanco-mestre%2Fnova',['/banco-mestre/nova'],['/banco-mestre/nova','https://example.com']])assert.equal(navigation.areaReturnTo(value),undefined);
});

test('areas SSR sanitizes returnTo including repeated query parameters before passing client props',async()=>{
  const Page=withStubs('app/banco-mestre/areas/page.tsx',{
    '@/components/banco-mestre/AreaManagement':{AreaManagement:'AreaManagement'},
    '@/lib/banco-mestre/data/area-read-model':{readManagedAreas},
    '@/lib/banco-mestre/data/area-server-reader':{createManagedAreasReader:async()=>({listManagedAreas:async()=>[area]})},
    '@/lib/banco-mestre/area-navigation':navigation,
  }).default;
  for(const returnTo of ['/banco-mestre/nova',undefined,'https://example.com',['/banco-mestre/nova']]) {
    const page=Page({searchParams:Promise.resolve({returnTo})});
    const content=await page.props.children.type(page.props.children.props);
    assert.equal(content.props.returnTo,navigation.areaReturnTo(returnTo));assert.deepEqual(content.props.result.areas,[area]);
  }
});

test('creation offers explicit safe return only after confirmation, without changing action inputs',async()=>{
  const calls=[];
  const h=harness('AreaCreateForm',{returnTo:'/banco-mestre/nova'},{createMasterArea:async input=>{calls.push(input);return {ok:true,area:{...area,id:input.id}};}});
  assert(!h.nodes(h.render(),n=>n.props?.children==='Voltar para criar item').length);
  h.input(h.render()).props.onChange({target:{value:'First area'}});await h.form(h.render()).props.onSubmit(h.event);
  const link=h.nodes(h.render(),n=>n.props?.children==='Voltar para criar item')[0];assert.equal(link.props.href,'/banco-mestre/nova');
  assert.deepEqual(Object.keys(calls[0]).sort(),['id','name']);assert.equal(h.refreshes(),1);
});

test('after reactivation a fresh SSR read offers contextual return; normal and invalid contexts retain ordinary access',async()=>{
  let saved={...area,active:false};
  const props={result:{status:'ready',areas:[saved]},returnTo:'/banco-mestre/nova'};
  const page=harness('AreaManagement',props);
  const links=()=>page.nodes(page.render(),n=>n.props?.children==='Voltar para criar item');
  assert.equal(links().length,0);
  const row=harness('AreaRow',{area:saved},{setMasterAreaActive:async input=>{saved={...saved,active:input.active,updatedAt:'2026-10-20T10:00:01.654321Z'};return {ok:true,area:saved};}});
  row.button(row.render(),'Reativar').props.onClick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved.active,true);assert.equal(row.refreshes(),1);assert.equal(links().length,0);
  props.result=await readManagedAreas(async()=>({listManagedAreas:async()=>[saved]}));
  assert.equal(links()[0].props.href,'/banco-mestre/nova');
  for(const returnTo of [undefined,'https://example.com','/auth/login']) {
    props.returnTo=returnTo;assert.equal(links().length,0);
    assert(page.nodes(page.render(),n=>n.props?.href==='/banco-mestre').length);
    assert(page.nodes(page.render(),n=>n.type?.name==='AreaCreateForm').length);
    assert(!page.nodes(page.render(),n=>n.props?.href==='https://example.com').length);
  }
});

test('invalid returnTo never becomes a post-creation href; ordinary creation flow remains available',async()=>{
  for(const returnTo of [undefined,'https://example.com','//example.com','/auth/login','javascript:alert(1)']) {
    const h=harness('AreaCreateForm',{returnTo},{createMasterArea:async input=>({ok:true,area:{...area,id:input.id}})});
    h.input(h.render()).props.onChange({target:{value:'Safe creation'}});
    await h.form(h.render()).props.onSubmit(h.event);
    const links=h.nodes(h.render(),n=>typeof n.props?.href==='string');
    assert.deepEqual(links.map(n=>n.props.href),['/banco-mestre/nova']);
    assert.equal(links[0].props.children,'Criar item');assert.equal(h.refreshes(),1);
  }
});
