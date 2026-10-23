/* eslint-disable @typescript-eslint/no-require-imports -- Node tests, no remote configuration. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs');
const {fixture}=require('./helpers/data-fixtures.cjs');
const {readBancoMestreList,readBancoMestreActivity}=load('lib/banco-mestre/data/read-model.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
test('server reader exposes only the three existing reads and uses a fresh session client',async()=>{
  let instances=0;
  const repo={listAreas:async()=>[],listActivities:async()=>[],getActivity:async()=>null,saveActivity(){throw Error('write');}};
  const {createBancoMestreReader}=withStubs('lib/banco-mestre/data/server-reader.ts',{
    '@/lib/supabase/server':{createClient:async()=>({instance:++instances})},
    './repository':{createBancoMestreRepository(client){assert.equal(client.instance,instances);return repo;}},
  });
  const first=await createBancoMestreReader();await createBancoMestreReader();
  assert.equal(instances,2);assert.deepEqual(Object.keys(first).sort(),['getActivity','listActivities','listAreas']);
});
test('list reads base + areas without N+1, mock fallback or writes; empty is a successful result',async()=>{
  const bundle=fixture('dentista');const {config:ignored,...activity}=bundle.activity;void ignored;
  const areas=[{id:activity.areaId,name:'Real area',active:false}];const calls=[];
  const repo={async listAreas(){calls.push('areas');return areas;},async listActivities(){calls.push('activities');return [{activity,revision:3}];},getActivity(){throw Error('N+1');},saveActivity(){throw Error('write');}};
  assert.deepEqual(await readBancoMestreList(async()=>repo),{status:'ready',areas,activities:[activity]});
  assert.deepEqual(calls.sort(),['activities','areas']);
  assert.deepEqual(await readBancoMestreList(async()=>({...repo,listAreas:async()=>[],listActivities:async()=>[]})),{status:'ready',areas:[],activities:[]});
});
test('direct detail reads aggregate even when absent from list; invalid mock IDs never access backend',async()=>{
  const bundle=fixture('academia'),item={bundle,revision:7};let factories=0,gets=0;
  const factory=async()=>{factories++;return {listAreas:async()=>[],listActivities(){throw Error('list not needed');},async getActivity(id){gets++;assert.equal(id,bundle.activity.id);return item;}};};
  assert.deepEqual(await readBancoMestreActivity(factory,bundle.activity.id),{status:'ready',areas:[],item});
  assert.equal(gets,1);
  const invalid=await readBancoMestreActivity(factory,'academia');assert.equal(invalid.kind,'Validation');assert.equal(factories,1);
});
test('read failures are distinct from empty/missing and never expose raw diagnostics',async()=>{
  for(const kind of ['Unauthorized','NotFound','Unknown','Validation']) {
    const response=await readBancoMestreActivity(async()=>({listAreas:async()=>[],getActivity:async()=>{throw new PersistenceError(kind,{message:'private-id SQL cookie token'});}}),crypto.randomUUID());
    assert.equal(response.status,'error');assert.equal(response.kind,kind);assert(!JSON.stringify(response).includes('private-id'));
  }
  const failed=await readBancoMestreList(async()=>{throw Error('private SQL connection');});
  assert.equal(failed.kind,'Unknown');assert(!JSON.stringify(failed).includes('connection'));assert(!('activities' in failed));
});
test('Next request-time control flow is rethrown instead of becoming a cached error view',async()=>{
  const signal=Object.assign(new Error('request-time cookies'),{digest:'DYNAMIC_SERVER_USAGE'});
  await assert.rejects(()=>readBancoMestreList(async()=>{throw signal;}),error=>error===signal);
});
const element=tag=>function Stub({children,disabled,type,href}){return React.createElement(tag,{disabled,type,href},children);};
const ui={Button:element('button'),Card:element('div'),CardContent:element('div'),CardFooter:element('div'),CardHeader:element('div'),Badge:element('span'),Input:element('input'),Label:element('label'),Checkbox:element('input')};
const uiStubs=Object.fromEntries(['button','card','badge','input','label','checkbox'].map(name=>['@/components/ui/'+name,ui]));
const Link=({children,href})=>React.createElement('a',{href},children);
const provider=withStubs('components/banco-mestre/BancoMestreProvider.tsx',{});
const {default:BancoMestreLayout}=withStubs('app/banco-mestre/layout.tsx',{'@/components/banco-mestre/BancoMestreProvider':provider});
const presentation=load('lib/banco-mestre/presentation.ts');
const menus=Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuRadioGroup','DropdownMenuRadioItem','DropdownMenuTrigger'].map(n=>[n,element('div')]));
const {BancoMestreList}=withStubs('components/banco-mestre/BancoMestreList.tsx',{
  ...uiStubs,'next/link':{default:Link},'next/navigation':{useRouter:()=>({refresh(){}})},'lucide-react':{Search:element('span')},
  './BancoMestreProvider':provider,'@/components/ui/dropdown-menu':menus,'@/lib/banco-mestre/presentation':presentation,
});
const {ActivityRouteView}=withStubs('components/banco-mestre/ActivityDetail.tsx',{...uiStubs,'next/link':{default:Link},'@/lib/banco-mestre/presentation':presentation});
const renderList=(activities=[],areas=[],error)=>renderToStaticMarkup(React.createElement(provider.BancoMestreProvider,{activities,areas},React.createElement(BancoMestreList,{error})));
test('existing list renders real summary without config, genuine empty and safe errors',()=>{
  const b=fixture('trabalho');const {config:ignored,...activity}=b.activity;void ignored;
  const html=renderList([activity],[{id:activity.areaId,name:'Remote area',active:true}]);
    assert(html.includes(activity.name));assert(html.includes('Remote area'));assert(html.includes('/banco-mestre/'+activity.id));assert(html.includes('/banco-mestre/nova'));assert(!html.includes('Dados locais'));
    assert(html.includes('/planejamento?activity='+activity.id));
    assert(!renderList([{...activity,status:'inactive'}],[{id:activity.areaId,name:'Remote area',active:true}]).includes('/planejamento?activity='));
  assert(renderList().includes('Seu Banco Mestre está vazio'));
  const failed=renderList([],[],{status:'error',kind:'Unauthorized',message:'Entre na sua conta.'});assert(failed.includes('/auth/login'));assert(!failed.includes('está vazio'));
  const network=renderList([],[],{status:'error',kind:'Unknown',message:'Não foi possível concluir a operação.'});assert(network.includes('role="alert"'));assert(network.includes('Tentar novamente'));assert(!network.includes('está vazio'));
});

test('list page declares accessible loading while pending, then passes only repository data',async()=>{
  const bundle=fixture('dentista');const {config:ignored,...activity}=bundle.activity;void ignored;
  activity.name='Registro exclusivo do repository';
  const areas=[{id:activity.areaId,name:'Área exclusiva do repository',active:true}];
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const {default:Page}=withStubs('app/banco-mestre/page.tsx',{
    '@/components/banco-mestre/BancoMestreList':{BancoMestreList},
    '@/components/banco-mestre/BancoMestreProvider':provider,
    '@/lib/banco-mestre/data/read-model':{readBancoMestreList},
    '@/lib/banco-mestre/data/server-reader':{createBancoMestreReader:async()=>({listAreas:async()=>areas,listActivities:()=>pending,getActivity(){throw Error('unexpected detail read');},saveActivity(){throw Error('unexpected write');}})},
  });
  const page=Page();const fallback=renderToStaticMarkup(page.props.fallback);
  assert(fallback.includes('role="status"'));assert(fallback.includes('aria-live="polite"'));assert(fallback.includes('Carregando Banco Mestre'));
  const content=page.props.children.type();let complete=false;content.then(()=>{complete=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);
  release([{activity,revision:1}]);
  const html=renderToStaticMarkup(await content);
  assert(html.includes(activity.name));assert(html.includes(areas[0].name));assert(!html.includes('Dados locais'));assert(!html.includes('sem persistência'));
});

test('detail page declares loading and reads getActivity directly; unavailable/errors stay distinct',async()=>{
  const bundle=fixture('academia');let release;
  const pending=new Promise(resolve=>{release=resolve;});
  let get=()=>pending;let calls=0;
  const {default:Page}=withStubs('app/banco-mestre/[id]/page.tsx',{
    '@/components/banco-mestre/ActivityDetail':{ActivityRouteView},
    '@/lib/banco-mestre/data/read-model':{readBancoMestreActivity},
    '@/lib/banco-mestre/data/server-reader':{createBancoMestreReader:async()=>({listAreas:async()=>[],getActivity(id){calls++;assert.equal(id,bundle.activity.id);return get();},listActivities(){throw Error('unexpected list read');},saveActivity(){throw Error('unexpected write');}})},
  });
  const page=Page({params:Promise.resolve({id:bundle.activity.id})});
  const fallback=renderToStaticMarkup(page.props.fallback);assert(fallback.includes('role="status"'));assert(fallback.includes('Carregando atividade'));
  const content=page.props.children.type(page.props.children.props);let complete=false;content.then(()=>{complete=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);
  release({bundle,revision:1});assert(renderToStaticMarkup(await content).includes(bundle.activity.name));assert.equal(calls,1);
  get=()=>{throw new PersistenceError('NotFound');};
  const notFound=renderToStaticMarkup(await page.props.children.type(page.props.children.props));assert(notFound.includes('Item não encontrado'));
  get=()=>{throw new PersistenceError('Unknown');};
  const failed=renderToStaticMarkup(await page.props.children.type(page.props.children.props));assert(failed.includes('Não foi possível carregar o item'));assert(!failed.includes('Item não encontrado'));
});
test('existing detail renders all five types with full aggregate, and safe unavailable state',()=>{
  for(const name of ['aniversario-mae','dentista','trabalho','academia','escovar']) {
    const bundle=fixture(name);
    bundle.activity.name='Registro real '+name;
    if(bundle.activity.type==='reminder') {bundle.activity.config.referenceDate='2027-03-11';bundle.rules=bundle.rules.map(r=>({...r,interval:24}));}
    if(bundle.activity.type==='commitment') {bundle.activity.config.startTime='12:17';bundle.activity.config.endTime='13:19';}
    if(bundle.activity.type==='fixedActivity') {bundle.activity.config.schedules[0].startTime='07:13';bundle.activity.config.schedules[0].endTime='08:17';}
    if(bundle.activity.type==='variableActivity') {
      bundle.activity.config.location='Local exclusivo do agregado real';
      bundle.windows=[{id:crypto.randomUUID(),activityId:bundle.activity.id,kind:'timeRange',effect:'preferred',coverage:'startOnly',startTime:'05:17',endTime:'06:19',endDayOffset:0,startsOn:'2026-10-19'}];
    }
    bundle.goals=bundle.goals.map(g=>({...g,minimumTarget:987,idealTarget:undefined}));
    const html=renderToStaticMarkup(React.createElement(ActivityRouteView,{result:{status:'ready',areas:[],item:{bundle,revision:1}}}));
    assert(html.includes(bundle.activity.name));assert(html.includes('/banco-mestre/'+bundle.activity.id+'/editar'));assert(!html.includes('Somente leitura'));
    if(bundle.activity.type==='reminder') {assert(html.includes('11/03/2027'));if(bundle.rules.length)assert(html.includes('24 meses'));}
    if(bundle.activity.type==='commitment') assert(html.includes('12:17'));
    if(bundle.activity.type==='fixedActivity') assert(html.includes('07:13'));
    if(bundle.activity.type==='variableActivity') {assert(html.includes('Local exclusivo do agregado real'));assert(html.includes('05:17'));}
    if(bundle.goals.length) assert(html.includes('987'));
  }
  const html=renderToStaticMarkup(React.createElement(ActivityRouteView,{result:{status:'error',kind:'NotFound',message:'Este item não está disponível.'}}));
  assert(html.includes('Item não encontrado'));assert(!html.includes('demonstração'));
});
test('existing form uses supplied areas, no seed, and provider has no local save',()=>{
  const {ActivityForm}=withStubs('components/banco-mestre/ActivityForm.tsx',{
    ...uiStubs,'next/link':{default:Link},'next/navigation':{useRouter:()=>({push(){throw Error('unexpected navigation');}})},
    '@/app/banco-mestre/actions':{saveMasterActivity(){throw Error('unexpected write during render');}},
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/editor':load('lib/banco-mestre/editor.ts'),'@/lib/banco-mestre/presentation':presentation,
  });
  const html=renderToStaticMarkup(React.createElement(BancoMestreLayout,null,React.createElement(ActivityForm,{areas:[]})));
  assert(html.includes('Crie sua primeira área'));assert(html.includes('Criar primeira área'));assert(html.includes('/banco-mestre/areas'));assert(!html.includes('<form'));
  const form=renderToStaticMarkup(React.createElement(ActivityForm,{areas:[{id:crypto.randomUUID(),name:'Only real area',active:true}]}));
  assert(form.includes('<form'));assert(form.includes('Only real area'));assert(form.includes('Salvar item'));
  function Probe(){const ctx=provider.useBancoMestre();assert.equal(ctx.save,undefined);assert.deepEqual(ctx.activities,[]);return null;}
  renderToStaticMarkup(React.createElement(provider.BancoMestreProvider,null,React.createElement(Probe)));
});
