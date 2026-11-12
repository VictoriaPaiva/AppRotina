/* eslint-disable @typescript-eslint/no-require-imports -- Offline execution/UI regressions. */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const {checklistItems,checklistSnapshot}=load('lib/activities/checklist.ts');
const {orderPlanItems,movePlanItem}=load('lib/planning/order.ts');
const validation=load('lib/planning/validation.ts');
const id=()=>crypto.randomUUID(),date='2026-11-01',stamp='2026-11-01T12:00:00.123456Z';
const item=()=>({id:id(),activityId:id(),plannedDate:date,completedAt:null,createdAt:stamp,updatedAt:stamp});
const snapshot=n=>load('lib/planning/contracts.ts').planSnapshot(n);

test('strict estimated time, frozen checklist IDs/labels and order reject injected/contradictory payloads',()=>{
  const n=item(),expected=snapshot(n);
  for(const time of ['08:00','14:30',null])assert.equal(validation.timePlanInput({id:n.id,expected,plannedTime:time}).plannedTime,time);
  for(const time of ['8:00','24:00','12:00:01','',0,undefined])assert.throws(()=>validation.timePlanInput({id:n.id,expected,plannedTime:time}));
  assert.throws(()=>validation.reorderPlanInput({plannedDate:date,items:[{id:n.id,expected},{id:n.id,expected}]}));
  assert.throws(()=>validation.reorderPlanInput({plannedDate:'2026-11-02',items:[{id:n.id,expected}]}));
  const check={id:id(),label:'Escovar dentes'};assert.deepEqual(checklistItems([check]),[check]);
  for(const value of [[check,check],[{...check,label:''}],[{...check,user_id:id()}],[{...check,id:'bad'}]])assert.throws(()=>checklistItems(value));
  assert.deepEqual(checklistSnapshot([{...check,completedAt:stamp}]),[{...check,completedAt:stamp}]);
});

test('chronology wins over manual order; timed ties and untimed positions are stable and movement is untimed only',()=>{
  const a={...item(),sortOrder:0,plannedTime:'08:00'},b={...item(),sortOrder:1,plannedTime:null},c={...item(),sortOrder:2,plannedTime:'07:00'};
  const source=[c,a,b];assert.deepEqual(orderPlanItems(source),[c,a,b]);assert.deepEqual(source,[c,a,b]);
  assert.deepEqual(movePlanItem(source,b.id,-1),[c,a,b]);assert.deepEqual(movePlanItem(source,a.id,1),[c,a,b]);
  const d={...item(),sortOrder:3,plannedTime:null},e={...item(),sortOrder:4,plannedTime:null};
  assert.deepEqual(movePlanItem([b,d,e],d.id,-1),[d,b,e]);assert.deepEqual(movePlanItem([b,d,e],d.id,1),[b,e,d]);
  assert.deepEqual(movePlanItem([b,{...d,plannedDate:'2026-11-02'}],b.id,1),[b,{...d,plannedDate:'2026-11-02'}]);
  assert.deepEqual(orderPlanItems([{...a,sortOrder:2},{...c,plannedTime:'08:00',sortOrder:1}]).map(n=>n.id),[c.id,a.id]);
});

test('Hoje checklist shows real checks, progress and small/large collapse without automatic writes',()=>{
  const {PlanChecklist}=withStubs('components/planning/PlanChecklist.tsx',{});
  const items=Array.from({length:4},(_,i)=>({id:id(),label:'Check '+i,completedAt:i<2?stamp:null}));let writes=0;
  const component=PlanChecklist({items,onComplete:()=>writes++});
  const html=renderToStaticMarkup(component);assert(html.includes('2 de 4'));assert(html.includes('<details open'));assert.equal((html.match(/type="checkbox"/g)||[]).length,4);assert.equal(writes,0);
  const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
  nodes(component).find(n=>n.type==='input').props.onChange({target:{checked:false}});assert.equal(writes,1);
  assert(!renderToStaticMarkup(React.createElement(PlanChecklist,{items:[...items,...items.map(n=>({...n,id:id()}))]})).includes('<details open'));
  assert(renderToStaticMarkup(React.createElement(PlanChecklist,{items:[]})).includes('salvo sem itens de checklist'));
});

test('checklist definition edits stable IDs, local order/add/remove and cancel without remote writes',()=>{
  const {ChecklistDefinitionEditor}=withStubs('components/banco-mestre/ChecklistDefinitionEditor.tsx',{'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'}});
  let value=[{id:id(),label:'A'},{id:id(),label:'B'}],changes=0,approve=false;
  const original=global.window;global.window={confirm:()=>approve};
  const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const render=()=>ChecklistDefinitionEditor({value,text:'New item',onChange:next=>{changes++;value=typeof next==='function'?next(value):next;}});
  try{
    const html=renderToStaticMarkup(render());assert(html.includes('Meta / Checklist'));assert(!html.includes('Itens de execução'));
    const a=value[0].id;
    nodes(render()).find(n=>n.props?.['aria-label']==='Texto do item 1').props.onChange({target:{value:'Edited'}});assert.equal(value[0].id,a);
    nodes(render()).find(n=>n.props?.['aria-label']==='Mover item 2 para cima').props.onClick();assert.equal(value[1].id,a);
    const before=changes;nodes(render()).find(n=>n.props?.['aria-label']==='Excluir item 1 da checklist').props.onClick();assert.equal(changes,before);
    approve=true;nodes(render()).find(n=>n.props?.['aria-label']==='Excluir item 1 da checklist').props.onClick();assert.equal(value.length,1);
    nodes(render()).find(n=>n.props?.children==='Adicionar item').props.onClick();assert.equal(value.length,2);assert.notEqual(value[1].id,a);
  }finally{if(original===undefined)delete global.window;else global.window=original;}
});

test('repository sends explicit null time inside JSON object and whole-day CAS without optimistic writes',async()=>{
  const n=item(),calls=[];
  const row={id:n.id,user_id:n.activityId,activity_id:n.activityId,planned_date:date,completed_at:null,created_at:stamp,updated_at:stamp,planned_time:null,sort_order:0,manual_order:true};
  const repo=load('lib/planning/repository.ts').createPlanRepository({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='reorder_plan_day'?null:row,error:null};}},n.activityId);
  assert.equal((await repo.setTime({id:n.id,expected:snapshot(n),plannedTime:null})).plannedTime,null);
  assert.deepEqual(calls[0].args.p_value,{plannedTime:null});
  await repo.reorder({plannedDate:date,items:[{id:n.id,expected:snapshot(n)}]});assert.equal(calls[1].name,'reorder_plan_day');
  assert.deepEqual(calls[1].args.p_items,[{id:n.id,expected:snapshot(n)}]);
});

test('quick time editor stages edits/removal, tracks dirty draft and only writes on explicit submit',()=>{
  let state='14:30';const saves=[],dirty=[];
  const {PlanTimeEditor}=withStubs('components/planning/PlanTimeEditor.tsx',{
    react:{useState:()=>[state,value=>{state=value;}]},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},
  });
  const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const render=()=>PlanTimeEditor({id:'time',value:'14:30',disabled:false,onSave:value=>saves.push(value),onDirty:value=>dirty.push(value)});
  assert.equal(saves.length,0);nodes(render()).find(n=>n.type==='input').props.onChange({target:{value:'08:00'}});assert.equal(state,'08:00');
  nodes(render()).find(n=>n.props?.children==='Remover horário').props.onClick();assert.equal(state,'');assert.equal(saves.length,0);assert(dirty.every(Boolean));
  render().props.onSubmit({preventDefault(){}});assert.deepEqual(saves,[null]);
});
