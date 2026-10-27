/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node/React harness. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const dates=load('lib/planning/dates.ts'), validation=load('lib/planning/validation.ts'), contracts=load('lib/planning/contracts.ts');
const A='00000000-0000-4000-8000-000000000001', id='10000000-0000-4000-8000-000000000001';
const item={id,activityId:A,plannedDate:'2026-10-22',completedAt:null,createdAt:'2026-10-22T12:00:00Z',updatedAt:'2026-10-22T12:00:00.123456Z',name:'Atividade real',active:true};
const data={status:'ready',today:'2026-10-22',tomorrow:'2026-10-23',date:'2026-10-22',items:[item],pending:[],activities:[{id:A,name:item.name,active:true}]};
const create={id,activityId:A,plannedDate:data.date};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function actionHarness({sub=A,error=null,throws=false,saveError=null}={}) {
  const calls=[],invalidations=[];let auth=0,clients=0;
  const repo={};for(const method of ['create','setCompleted','reschedule'])repo[method]=async input=>{calls.push({method,input});if(saveError)throw saveError;return item;};
  const actions=withStubs('app/planejamento/actions.ts',{
    'next/cache':{revalidatePath:path=>invalidations.push(path)},
    '@/lib/supabase/server':{async createClient(){clients++;if(throws)throw Error('private network');return {auth:{async getClaims(){auth++;return {data:sub?{claims:{sub}}:null,error};}}};}},
    '@/lib/banco-mestre/data/errors':{PersistenceError},
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    '@/lib/planning/repository':{createPlanRepository(_client,owner){assert.equal(owner,A);return repo;}},
    '@/lib/planning/validation':validation,
  });
  return {actions,calls,invalidations,auth:()=>auth,clients:()=>clients};
}
test('civil dates use explicit MVP timezone and handle month/year boundaries without browser timezone',()=>{
  assert.equal(dates.planToday(new Date('2026-10-22T02:59:59Z')),'2026-10-21');
  assert.equal(dates.planToday(new Date('2026-10-22T03:00:00Z')),'2026-10-22');
  assert.equal(dates.nextPlanDate('2026-12-31'),'2027-01-01');assert.equal(dates.nextPlanDate('2028-02-28'),'2028-02-29');
  assert.equal(dates.formatPlanDate(data.date),'22/10/2026');
});
test('actions validate strict inputs, verify claims and only then construct owner-scoped repository',async()=>{
  const h=actionHarness();assert.deepEqual(await h.actions.createDailyPlan(create),{ok:true});
  assert.deepEqual(h.calls,[{method:'create',input:create}]);assert.equal(h.auth(),1);
  assert.deepEqual(h.invalidations,['/planejamento','/hoje','/calendario']);
  for(const extra of [{user_id:A},{completed_at:'x'},{updated_at:'x'},{id:'invalid'},{plannedDate:'2026-02-30'}])assert.equal((await h.actions.createDailyPlan({...create,...extra})).kind,'Validation');
  assert.equal(h.clients(),1);assert.deepEqual(Object.keys(h.actions).sort(),['createDailyPlan','rescheduleDailyPlan','setDailyPlanCompleted']);
});
test('missing/expired session and network/database failure never produce success or invalidation',async()=>{
  for(const config of [{sub:null},{error:{code:'expired'}},{throws:true},{saveError:Error('private SQL')}]) {
    const h=actionHarness(config),result=await h.actions.createDailyPlan(create);
    assert.equal(result.ok,false);assert(!JSON.stringify(result).includes('private'));assert.equal(h.invalidations.length,0);
    if(config.sub===null||config.error){assert.equal(result.kind,'Unauthorized');assert.equal(h.calls.length,0);}else assert.equal(result.kind,'Unknown');
  }
});
test('completion/undo and reschedule preserve expected snapshot; Conflict/NotFound remain safe',async()=>{
  const h=actionHarness();
  for(const completed of [true,false])assert((await h.actions.setDailyPlanCompleted({id,expected:contracts.planSnapshot(item),completed})).ok);
  assert.equal(h.calls[0].input.completed,true);assert.equal(h.calls[1].input.completed,false);
  assert.deepEqual(h.calls[0].input.expected,contracts.planSnapshot(item));
  assert((await h.actions.rescheduleDailyPlan({id,expected:contracts.planSnapshot(item),plannedDate:'2026-10-24'})).ok);
  for(const kind of ['Conflict','NotFound','Validation']) {
    const failed=actionHarness({saveError:new PersistenceError(kind,Error('private'))});
    const result=await failed.actions.createDailyPlan(create);assert.equal(result.kind,kind);assert.equal(failed.invalidations.length,0);assert(!JSON.stringify(result).includes('private'));
  }
});
const ui={Button:'button',Card:'div',CardContent:'div',Input:'input',Label:'label'};
function uiStubs(extra={}){return {
  'next/link':{default:'a'},'next/navigation':{useRouter:()=>({refresh(){},push(){}})},
  ...Object.fromEntries(['button','card','input','label'].map(name=>['@/components/ui/'+name,ui])),
  '@/lib/planning/contracts':contracts,'@/lib/planning/dates':dates,
  '@/app/planejamento/actions':{createDailyPlan:async()=>({ok:true}),setDailyPlanCompleted:async()=>({ok:true}),rescheduleDailyPlan:async()=>({ok:true})},...extra,
};}
function harness(props={data},overrides={}) {
  const slots=[];let cursor=0,refreshes=0;const paths=[];
  const react={useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];}};
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',uiStubs({react,'next/navigation':{useRouter:()=>({refresh(){refreshes++;},push:p=>paths.push(p)})},'@/app/planejamento/actions':overrides}));
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(c=>nodes(c,predicate))];
  const render=()=>{cursor=0;return PlanningBoard(props);};
  const find=(predicate)=>nodes(render(),predicate)[0];
  return {render,nodes,find,refreshes:()=>refreshes,paths,event:{preventDefault(){}}};
}
test('real list, completed, pending, inactive association, empty and Unauthorized states have honest UI',()=>{
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',uiStubs({'@/components/ui/button':{Button:({asChild,children,...props})=>asChild?children:React.createElement('button',props,children)}}));
  const render=(data,todayMode=true)=>renderToStaticMarkup(React.createElement(PlanningBoard,{data,todayMode}));
  const html=render({...data,items:[{...item,completedAt:'2026-10-22T14:00:00Z',active:false}],pending:[{...item,id:'20000000-0000-4000-8000-000000000001',plannedDate:'2026-10-20'}]});
  for(const text of ['Concluídos','Desfazer conclusão','Pendências','Reagendar','Atividade inativa','Atividade real'])assert(html.includes(text));
  for(const text of ['Academia','Tarot','Meta semanal','Trabalho'])assert(!html.includes(text));
  assert(render({...data,items:[],pending:[],activities:[]}).includes('Nenhuma pendência'));
  assert(render({...data,items:[],pending:[],activities:[]},false).includes('Nenhuma atividade ativa'));
  assert(render({status:'error',kind:'Unauthorized',message:'Entre na conta.'}).includes('Entrar novamente'));
});
test('creation preserves draft/attempt on network error, prevents duplicate submits, navigates only on confirmed success',async()=>{
  const calls=[];let resolve;
  const h=harness({data},{createDailyPlan:async input=>{calls.push(input);if(calls.length===1)throw Error('network');return new Promise(r=>{resolve=r;});}});
  h.find(n=>n.type==='select').props.onChange({target:{value:A}});
  const submit=()=>h.find(n=>n.type==='form'&&n.props.onSubmit).props.onSubmit(h.event);
  submit();await tick();assert.equal(h.find(n=>n.type==='select').props.value,A);assert.equal(h.refreshes(),0);assert.equal(h.paths.length,0);
  assert(h.nodes(h.render(),n=>n.type==='p'&&String(n.props.children).includes('Não foi possível confirmar')).length);
  submit();submit();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);assert.equal(calls[1].plannedDate,data.date);
  resolve({ok:true});await tick();assert.equal(h.refreshes(),1);assert.deepEqual(h.paths,['/planejamento?date=2026-10-22']);
  assert.equal(h.find(n=>n.type==='select').props.disabled,true);submit();assert.equal(calls.length,2);
});
test('completion sends original snapshot; stale/rejected action leaves data/draft intact, without automatic retry',async()=>{
  for(const kind of ['Conflict','Unauthorized','Unknown']) {
    const calls=[];const h=harness({data},{setDailyPlanCompleted:async value=>{calls.push(value);return {ok:false,kind,message:'Safe failure'};}});
    h.find(n=>n.type==='button'&&n.props.children==='Concluir').props.onClick();await tick();
    assert.deepEqual(calls,[{id,expected:contracts.planSnapshot(item),completed:true}]);assert.equal(h.refreshes(),0);
    assert(h.nodes(h.render(),n=>n.type==='button'&&n.props.children==='Concluir').length);
    if(kind==='Unauthorized')assert(h.nodes(h.render(),n=>n.props?.href==='/auth/login').length);
  }
});
test('rescheduling sends chosen date and original snapshot; reload is explicit and confirmed',async()=>{
  const originalFormData=global.FormData, originalWindow=global.window;let reloads=0,consent=false;const calls=[];
  global.FormData=class{get(){return '2026-10-24';}};
  global.window={confirm:()=>consent,location:{reload(){reloads++;}}};
  try {
    const h=harness({data},{rescheduleDailyPlan:async input=>{calls.push(input);return {ok:false,kind:'Conflict',message:'Safe conflict'};}});
    const forms=h.nodes(h.render(),n=>n.type==='form'&&n.props.onSubmit);forms[1].props.onSubmit({...h.event,currentTarget:{}});await tick();
    assert.deepEqual(calls,[{id,expected:contracts.planSnapshot(item),plannedDate:'2026-10-24'}]);assert.equal(h.refreshes(),0);
    const reload=()=>h.find(n=>n.type==='button'&&n.props.children==='Recarregar dados salvos').props.onClick();
    reload();assert.equal(reloads,0);consent=true;reload();assert.equal(reloads,1);
  }finally{global.FormData=originalFormData;global.window=originalWindow;}
});
test('SSR reads normal session, master names and inactive associations; errors never fall back to mocks',async()=>{
  const requests=[];
  const base={
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:A}},error:null})}})},
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>({listActivities:async()=>[{activity:{id:A,name:'Real master name',status:'inactive'}}]})},
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    '@/lib/banco-mestre/data/errors':{PersistenceError},'@/lib/banco-mestre/data/validation':load('lib/banco-mestre/data/validation.ts'),
    './repository':{createPlanRepository(_client,owner){assert.equal(owner,A);return {listByDate:async d=>{requests.push(d);return [item];},listPending:async()=>[]};}},
    './dates':{...dates,planToday:()=>data.today},
  };
  const {readPlanPage}=withStubs('lib/planning/server.ts',base);
  const ready=await readPlanPage('2026-10-23');assert.equal(ready.items[0].name,'Real master name');assert.equal(ready.items[0].active,false);assert.deepEqual(requests,['2026-10-23']);
  assert.equal((await readPlanPage(['2026-10-23'])).kind,'Validation');
  const missing=withStubs('lib/planning/server.ts',{...base,'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:null,error:null})}})}});
  assert.equal((await missing.readPlanPage()).kind,'Unauthorized');
});
