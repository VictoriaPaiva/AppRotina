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
  const repo={};for(const method of ['create','setCompleted','reschedule','setTime','completeChecklist','reorder','setQuantity'])repo[method]=async input=>{calls.push({method,input});if(saveError)throw saveError;return item;};
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
  assert.equal(h.clients(),1);assert.deepEqual(Object.keys(h.actions).sort(),['completeDailyPlanChecklist','completeDailyPlanSubitem','configureDailyPlanSubitems','createDailyPlan','reorderDailyPlan','rescheduleDailyPlan','setDailyPlanCompleted','setDailyPlanQuantity','setDailyPlanTime']);
});
test('missing/expired session and network/database failure never produce success or invalidation',async()=>{
  for(const config of [{sub:null},{error:{code:'expired'}},{throws:true},{saveError:Error('private SQL')}]) {
    const h=actionHarness(config),result=await h.actions.createDailyPlan(create);
    assert.equal(result.ok,false);assert(!JSON.stringify(result).includes('private'));assert.equal(h.invalidations.length,0);
    if(config.sub===null||config.error){assert.equal(result.kind,'Unauthorized');assert.equal(h.calls.length,0);}else assert.equal(result.kind,'Unknown');
  }
});

test('V0.5 actions verify claims and forward time/check/whole-day expected snapshots with shared invalidation',async()=>{
  const h=actionHarness(),expected=contracts.planSnapshot(item);
  assert((await h.actions.setDailyPlanTime({id,expected,plannedTime:null})).ok);
  assert((await h.actions.completeDailyPlanChecklist({id,expected,checklistItemId:A,completed:true})).ok);
  assert((await h.actions.reorderDailyPlan({plannedDate:data.date,items:[{id,expected}]})).ok);
  assert.deepEqual(h.calls.map(n=>n.method),['setTime','completeChecklist','reorder']);
  assert.deepEqual(h.calls[0].input.expected,expected);assert.equal(h.invalidations.length,9);
  const before=h.clients();assert.equal((await h.actions.setDailyPlanTime({id,expected,plannedTime:'24:00'})).kind,'Validation');assert.equal(h.clients(),before);
  assert.equal((await actionHarness({sub:null}).actions.reorderDailyPlan({plannedDate:data.date,items:[{id,expected}]})).kind,'Unauthorized');
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
function harness(props={data},overrides={},extra={}) {
  const slots=[];let cursor=0,refreshes=0,cleanup;const paths=[];
  const react={useLayoutEffect(setup){cursor++;cleanup??=setup();},useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];}};
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',uiStubs({react,'next/navigation':{useRouter:()=>({refresh(){refreshes++;},push:p=>paths.push(p)})},'@/app/planejamento/actions':overrides,...extra}));
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(c=>nodes(c,predicate))];
  const render=()=>{cursor=0;return PlanningBoard(props);};
  const find=(predicate)=>nodes(render(),predicate)[0];
  return {render,nodes,find,hide(){cleanup?.();cleanup=undefined;},refreshes:()=>refreshes,paths,event:{preventDefault(){}}};
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

test('Hoje and Planejamento share chronology even for completed items; move buttons affect only untimed and submit full CAS',async()=>{
  const rows=[{...item,id:crypto.randomUUID(),activityId:crypto.randomUUID(),name:'A timed',plannedTime:'08:00',sortOrder:4},
    {...item,id:crypto.randomUUID(),activityId:crypto.randomUUID(),name:'B timed',plannedTime:'10:00',sortOrder:0},
    {...item,id:crypto.randomUUID(),activityId:crypto.randomUUID(),name:'C completed',plannedTime:'07:00',sortOrder:8,completedAt:'2026-10-22T14:00:00Z'},
    ...Array.from({length:3},(_,i)=>({...item,id:crypto.randomUUID(),activityId:crypto.randomUUID(),name:'Untimed '+i,plannedTime:null,sortOrder:i+10}))];
  const value={...data,items:rows,activities:[]},expected=[rows[2],rows[0],rows[1],...rows.slice(3)];
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',uiStubs({'@/components/ui/button':{Button:({asChild,children,...props})=>asChild?children:React.createElement('button',props,children)}}));
  for(const todayMode of [false,true]){
    const html=renderToStaticMarkup(React.createElement(PlanningBoard,{data:value,todayMode}));
    const links=[...html.matchAll(/href="\/banco-mestre\/([0-9a-f-]+)"/g)].map(n=>n[1]);assert.deepEqual(links,(todayMode?[rows[0],rows[1],...rows.slice(3),rows[2]]:expected).map(n=>n.activityId));
    assert(!html.includes('Mover A timed para cima'));assert(html.includes('Mover Untimed 1 para cima'));
  }
  const calls=[],h=harness({data:value,todayMode:true},{reorderDailyPlan:async input=>{calls.push(input);return {ok:false,kind:'Conflict',message:'Review'};}});
  h.find(n=>n.props?.['aria-label']==='Mover Untimed 1 para cima').props.onClick();await tick();assert.equal(calls.length,1);
  assert.deepEqual(calls[0].items.map(n=>n.id),[rows[2],rows[0],rows[1],rows[4],rows[3],rows[5]].map(n=>n.id));
  assert.deepEqual(calls[0].items[0].expected,contracts.planSnapshot(rows[2]));assert.equal(h.refreshes(),0);
});

test('legacy checklist remains readable, offers definition editing and does not invent checks from goals',()=>{
  const {PlanChecklist}=withStubs('components/planning/PlanChecklist.tsx');
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',uiStubs({'./PlanChecklist':{PlanChecklist},'@/components/ui/button':{Button:({asChild,children,...props})=>asChild?children:React.createElement('button',props,children)}}));
  const html=renderToStaticMarkup(React.createElement(PlanningBoard,{data:{...data,items:[{...item,activityTypeSnapshot:'checklistGoal'}]},todayMode:true}));
  assert(html.includes('/banco-mestre/'+A+'/editar'));assert(html.includes('Revisar checklist'));assert(html.includes('Concluir ocorrência legada'));
  assert.equal((html.match(/type="checkbox"/g)||[]).length,0);
});

test('quantity occurrence has simple execution without artificial checks or checklist-setup prompt',()=>{
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',uiStubs());
  const html=renderToStaticMarkup(React.createElement(PlanningBoard,{data:{...data,items:[{...item,activityTypeSnapshot:'checklistGoal',goalTrackingModeSnapshot:'quantity'}]},todayMode:true}));
  assert(html.includes('Meta por quantidade'));assert(!html.includes('Revisar checklist'));assert(!html.includes('Concluir checklist'));
  assert.equal((html.match(/type="checkbox"/g)||[]).length,0);assert(html.includes('Concluir'));
});

test('moving untimed items asks before discarding a time draft on that same occurrence',async()=>{
  let prompts=0,writes=0;
  const h=harness({data:{...data,items:[item,{...item,id:crypto.randomUUID(),sortOrder:1}]}},{reorderDailyPlan:async()=>{writes++;return {ok:true};}},
    {'@/lib/forms/draft-protection':{useDraftProtection(){},confirmPageLeave:()=>{prompts++;return false;}}});
  h.find(n=>n.props?.onDirty&&n.props?.onSave).props.onDirty(true);
  h.find(n=>n.props?.['aria-label']==='Mover '+item.name+' para baixo').props.onClick();await tick();
  assert.equal(prompts,1);assert.equal(writes,0);assert.equal(h.refreshes(),0);
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
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>({listSubitems:async()=>[],listActivities:async()=>[{activity:{id:A,name:'Real master name',status:'inactive'}}]})},
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

test('V0.4 planning creation resets completed Activity state on hide but preserves unfinished selection',async()=>{
  const calls=[],h=harness({data},{createDailyPlan:async input=>{calls.push(input);return {ok:true};}});
  h.find(n=>n.type==='select').props.onChange({target:{value:A}});h.hide();assert.equal(h.find(n=>n.type==='select').props.value,A);
  h.find(n=>n.type==='form'&&n.props.onSubmit).props.onSubmit(h.event);await tick();assert.equal(calls.length,1);
  h.hide();assert.equal(h.find(n=>n.type==='select').props.value,'');assert.equal(h.find(n=>n.type==='select').props.disabled,false);
  h.find(n=>n.type==='select').props.onChange({target:{value:A}});
  h.find(n=>n.type==='form'&&n.props.onSubmit).props.onSubmit(h.event);await tick();assert.notEqual(calls[0].id,calls[1].id);
});

test('V0.4 new occurrence sends selection/override with the captured definition revision and never mutates master',async()=>{
  const domain=load('lib/activities/subitems.ts'),leaf={id:crypto.randomUUID(),parentId:null,name:'Study',durationMinutes:60,sortOrder:0,active:true,defaultSelected:true};
  const props={data:{...data,activities:[{id:A,name:'Study',active:true,revision:7,subitems:{mode:'none',items:[leaf]}}]}};
  const calls=[],h=harness(props,{createDailyPlan:async input=>{calls.push(input);return {ok:false,kind:'Unknown',message:'Unconfirmed'};}});
  h.find(n=>n.type==='select').props.onChange({target:{value:A}});
  const config=h.find(n=>n.props?.value?.[0]?.id===leaf.id);assert(config);config.props.onChange(domain.toggleBranch(config.props.value,leaf.id,true).map(n=>({...n,overrideMinutes:45})));
  // A background props update must not silently replace the revision associated with the user's draft.
  props.data={...props.data,activities:props.data.activities.map(a=>({...a,revision:8}))};
  h.find(n=>n.type==='form'&&n.props.onSubmit).props.onSubmit(h.event);await tick();
  assert.equal(calls[0].sourceRevision,7);assert.deepEqual(calls[0].configuration,[{id:leaf.id,selected:true,overrideMinutes:45}]);
  h.hide();assert.equal(h.find(n=>n.props?.value?.[0]?.id===leaf.id).props.value[0].overrideMinutes,45);
});

test('quantity action validates before Auth, preserves CAS, verifies session and invalidates only confirmed writes',async()=>{
 const expected=contracts.planSnapshot(item),input={id,expected,goalId:A,unitIndex:0,completed:true},h=actionHarness();
 assert((await h.actions.setDailyPlanQuantity(input)).ok);assert.equal(h.calls[0].method,'setQuantity');assert.deepEqual(h.calls[0].input,input);assert.equal(h.invalidations.length,3);
 for(const patch of [{unitIndex:-1},{unitIndex:20},{completed:'yes'},{user_id:A},{amount:-1},{amount:2,completed:true}])assert.equal((await h.actions.setDailyPlanQuantity({...input,...patch})).kind,'Validation');assert.equal(h.auth(),1);
 const denied=actionHarness({sub:null});assert.equal((await denied.actions.setDailyPlanQuantity(input)).kind,'Unauthorized');assert.equal(denied.calls.length,0);
 const stale=actionHarness({saveError:new PersistenceError('Conflict')});assert.equal((await stale.actions.setDailyPlanQuantity(input)).kind,'Conflict');assert.equal(stale.invalidations.length,0);
});
