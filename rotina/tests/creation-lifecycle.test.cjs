/* eslint-disable @typescript-eslint/no-require-imports -- Offline Activity lifecycle regression harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {withStubs}=require('./helpers/load-with-stubs.cjs'),{load}=require('./helpers/load-typescript.cjs');
const money=load('lib/finance/validation.ts');
const stamp='2026-10-31T12:00:00.123456Z';
const cases=[
  {name:'transaction',file:'components/finance/TransactionEditor.tsx',component:'TransactionEditor',
    props:{initialDate:'2026-10-31'},action:'createTransaction',editAction:'updateTransaction',result:'transaction',
    defaults:{'transaction-type':'expense','transaction-date':'2026-10-31','transaction-amount':'','transaction-description':'','transaction-category':''},
    fields:{'transaction-type':'income','transaction-date':'2026-11-02','transaction-amount':'12,34','transaction-description':'A','transaction-category':'Category'},
    titleField:'transaction-description',editProp:'transaction'},
  {name:'fixed expense',file:'components/finance/FixedExpenseEditor.tsx',component:'FixedExpenseEditor',props:{},
    action:'saveFixedExpense',result:'value',defaults:{'fixed-name':'','fixed-amount':'','fixed-due':'1','fixed-category':'Contas fixas'},
    fields:{'fixed-name':'A','fixed-amount':'12,34','fixed-due':'27','fixed-category':'Category'},titleField:'fixed-name',editProp:'expense'},
  {name:'area',file:'components/banco-mestre/AreaManagement.tsx',component:'AreaCreateForm',props:{},action:'createMasterArea',result:'area',
    defaults:{'area-new-name':''},fields:{'area-new-name':'A'},titleField:'area-new-name'},
];
function harness(config,actions,props=config.props,component=config.component) {
  const slots=[],paths=[],protections=[];let cursor=0,cleanup;
  const react={
    useId(){cursor++;return 'test';},
    useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
    useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},
    useLayoutEffect(setup){cursor++;cleanup??=setup();},
  };
  const ui=Object.fromEntries(['Button','Input','Label','Card','CardContent','Badge'].map(n=>[n,n]));
  const components=withStubs(config.file,{
    react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({replace:p=>paths.push(p),refresh(){}})},
    ...Object.fromEntries(['button','input','label','card','badge'].map(n=>['@/components/ui/'+n,ui])),
    '@/lib/forms/draft-protection':{useDraftProtection:(dirty,pending)=>{protections.push({dirty,pending});return ()=>{};}},
    '@/lib/finance/validation':money,'@/app/financas/actions':actions,'@/app/financas/contas/actions':actions,
    '@/app/banco-mestre/area-actions':actions,'@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/area-navigation':load('lib/banco-mestre/area-navigation.ts'),
  });
  const nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>nodes(c,p))];
  const render=()=>{cursor=0;return components[component](props);};
  const find=p=>nodes(render(),p)[0];
  const field=id=>find(n=>n.props?.id===id);
  return {paths,find,field,protection(){render();return protections.at(-1);},hide(){cleanup?.();cleanup=undefined;},
    change(id,value){field(id).props.onChange({target:{value}});},
    submit(){return find(n=>n.type==='form').props.onSubmit({preventDefault(){}});}};
}

test('area editing remains independent of creation cleanup and preserves an unfinished rename',async()=>{
  const config=cases[2],area={id:crypto.randomUUID(),name:'Original',active:true,sortPosition:0,updatedAt:stamp};
  const calls=[],h=harness(config,{renameMasterArea:async input=>{calls.push(input);return {ok:false,kind:'Conflict',message:'Changed elsewhere'};}},{area},'AreaRow');
  h.change('test','Rename draft');h.hide();assert.equal(h.field('test').props.value,'Rename draft');
  await h.submit();h.hide();assert.equal(h.field('test').props.value,'Rename draft');
  assert.equal(calls[0].id,area.id);assert.deepEqual(calls[0].expected,{name:area.name,active:true,sortPosition:0,updatedAt:stamp});
});

test('planning SSR changes board identity after confirmed create and preserves date/activity defaults',async()=>{
  let data={status:'ready',date:'2026-10-31',items:[],pending:[],activities:[{id:'activity-A',name:'A',active:true}]};
  const {PlanPageContent}=withStubs('components/planning/PlanPageContent.tsx',{
    '@/lib/planning/server':{readPlanPage:async()=>data},'./PlanningBoard':{PlanningBoard:'PlanningBoard'},
  });
  const before=await PlanPageContent({activity:'activity-A'});
  data={...data,items:[{id:'plan-A',updatedAt:stamp}]};
  const after=await PlanPageContent({activity:'activity-A'});
  assert.notEqual(before.key,after.key);assert.equal(after.props.initialActivityId,'activity-A');assert.equal(after.props.data.date,data.date);
  const plain=await PlanPageContent({});assert.equal(plain.props.initialActivityId,'');
  assert.notEqual(plain.key,after.key);
});
for(const config of cases) {
  test(config.name+': completed A hides, reopens at defaults, creates distinct B without changing A or automatic writes',async()=>{
    const calls=[],records=new Map();
    const save=async input=>{
      assert(!records.has(input.id));assert(input.expectedUpdatedAt==null);
      calls.push({...input});const record={...input,active:true,createdAt:stamp,updatedAt:stamp};
      records.set(input.id,record);return {ok:true,[config.result]:record};
    };
    const actions={[config.action]:save,[config.editAction??'unused']:async()=>assert.fail('must not update A')};
    const h=harness(config,actions);let first;
    for(const label of ['A','B']) {
      for(const [id,value] of Object.entries(config.defaults))assert.equal(h.field(id)?.props.value,value,id);
      assert(!h.find(n=>n.props?.role==='status'));assert(!h.protection().dirty);
      for(const [id,value] of Object.entries(config.fields))h.change(id,id===config.titleField?label:value);
      assert(h.protection().dirty);await h.submit();assert(h.find(n=>n.props?.role==='status'));
      if(!first)first={...records.get(calls[0].id)};
      const paths=[...h.paths];h.hide();h.find(()=>false);
      assert.deepEqual(h.paths,paths);assert.equal(calls.length,label==='A'?1:2);
      assert.deepEqual(records.get(first.id),first);
    }
    assert.notEqual(calls[0].id,calls[1].id);assert.equal(records.size,2);
  });
  test(config.name+': unfinished draft and failed attempt keep values, UUID and protection across hide',async()=>{
    const calls=[],h=harness(config,{[config.action]:async input=>{calls.push(input);return {ok:false,kind:'Unknown',message:'Unconfirmed'};}});
    for(const [id,value] of Object.entries(config.fields))h.change(id,value);
    h.hide();for(const [id,value] of Object.entries(config.fields))assert.equal(h.field(id).props.value,value);
    await h.submit();h.hide();
    for(const [id,value] of Object.entries(config.fields))assert.equal(h.field(id).props.value,value);
    assert(h.protection().dirty);await h.submit();assert.equal(calls[0].id,calls[1].id);
  });
  if(config.editProp)test(config.name+': existing edit survives hide and retains confirmed snapshot for next update',async()=>{
    const initial={id:crypto.randomUUID(),type:'expense',date:'2026-10-31',amountCents:100,name:'Old',defaultAmountCents:100,dueDay:1,category:'Old',description:'Old',active:true,createdAt:stamp,updatedAt:stamp};
    const calls=[],action=config.editAction??config.action;
    const h=harness(config,{[action]:async input=>{calls.push(input);return {ok:true,[config.result]:{...initial,...input,updatedAt:'2026-10-31T13:00:00Z'}};}},{...config.props,[config.editProp]:initial});
    h.change(config.titleField,'Edited');h.hide();assert.equal(h.field(config.titleField).props.value,'Edited');
    await h.submit();h.hide();assert.equal(h.field(config.titleField).props.value,'Edited');
    h.change(config.titleField,'Again');await h.submit();assert.equal(calls[1].id,initial.id);assert.equal(calls[1].expectedUpdatedAt,'2026-10-31T13:00:00Z');
    assert.deepEqual(h.paths,[]);
  });
}
