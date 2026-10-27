/* eslint-disable @typescript-eslint/no-require-imports -- Offline bill UI/action/session harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const bills=load('lib/finance/bills.ts'),validation=load('lib/finance/bills-validation.ts'),money=load('lib/finance/validation.ts'),summary=load('lib/finance/summary.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const id='10000000-0000-4000-8000-000000000001',fixedExpenseId='20000000-0000-4000-8000-000000000001';
const item={id,fixedExpenseId,referenceMonth:'2026-10',name:'Aluguel',dueDay:27,category:'Moradia',amountCents:150000,paidAt:null,financialTransactionId:null,createdAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00.123456Z'};
const expense={id:fixedExpenseId,name:'Aluguel',defaultAmountCents:150000,dueDay:27,category:'Moradia',active:true,startsOn:'2026-10-01',createdAt:item.createdAt,updatedAt:item.updatedAt};
const defInput={id:fixedExpenseId,name:'Aluguel',defaultAmountCents:150000,dueDay:27,category:'Moradia',active:true,expectedUpdatedAt:null};
const payment={id,amountCents:150000,paid:true,expectedUpdatedAt:item.updatedAt};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cutoff day 20, manual month shifts, year boundary and exact totals',()=>{
  for(const [date,month] of [['2026-10-27','2026-10'],['2026-11-19','2026-10'],['2026-11-20','2026-11'],['2026-11-27','2026-11'],['2027-01-01','2026-12']])assert.equal(bills.billReferenceMonth(date),month);
  assert.equal(bills.shiftBillMonth('2026-12',1),'2027-01');assert.equal(bills.shiftBillMonth('2027-01',-1),'2026-12');assert.equal(bills.shiftBillMonth('9999-12',1),null);
  assert.throws(()=>bills.billReferenceMonth('2026-02-30'));
  assert.deepEqual(bills.billTotals([]),{expected:0n,paid:0n,remaining:0n});
  assert.deepEqual(bills.billTotals([item,{...item,id:'other',amountCents:21347,paidAt:item.updatedAt}]),{expected:171347n,paid:21347n,remaining:150000n});
});
test('strict inputs reject owner, links, audit values, invalid money/day and preserve timestamp precision',()=>{
  assert.equal(validation.fixedExpenseInput(defInput).dueDay,27);assert.equal(validation.billPaymentInput(payment).expectedUpdatedAt,item.updatedAt);
  for(const extra of [{user_id:id},{defaultAmountCents:1.1},{defaultAmountCents:0},{defaultAmountCents:2147483648},{dueDay:0},{dueDay:32},{active:'true'},{name:''},{category:''},{expectedUpdatedAt:'bad'}])assert.throws(()=>validation.fixedExpenseInput({...defInput,...extra}));
  for(const extra of [{user_id:id},{financialTransactionId:id},{paidAt:item.updatedAt},{paid:'true'},{amountCents:0},{expectedUpdatedAt:'bad'}])assert.throws(()=>validation.billPaymentInput({...payment,...extra}));
});
test('actions authenticate, preserve exact snapshot and invalidate only confirmed writes; network/session failures cannot report success',async()=>{
  for(const failure of [null,'Unauthorized','network']) {
    const paths=[],calls=[];
    const actions=withStubs('app/financas/contas/actions.ts',{'next/cache':{revalidatePath:(...p)=>paths.push(p)},'@/lib/finance/bills-validation':validation,'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
      '@/lib/finance/bills-server':{billsRepositoryForSession:async()=>{if(failure==='Unauthorized')throw new PersistenceError('Unauthorized');return {saveMonth:async value=>{calls.push(value);if(failure)throw Error('private SQL');return item;},saveDefinition:async()=>expense};}},
    });
    const result=await actions.saveBillMonth(payment);assert.equal(result.ok,!failure);assert(!JSON.stringify(result).includes('private SQL'));assert.equal(paths.length,failure?0:1);
    if(!failure){assert.deepEqual(calls,[payment]);assert((await actions.saveFixedExpense(defInput)).ok);}
    assert.equal((await actions.saveBillMonth({...payment,user_id:id})).kind,'Validation');
  }
});
test('SSR selects financial reference and lazily initializes only after verified claims; explicit month navigation is preserved',async()=>{
  const calls=[],stubs={'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:id}},error:null})}})},'@/lib/banco-mestre/data/errors':{PersistenceError},'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    '@/lib/planning/dates':{planToday:()=> '2026-11-19'},'./validation':money,'./bills':bills,
    './bills-repository':{createBillsRepository:(_client,owner)=>{assert.equal(owner,id);return {initialize:async month=>calls.push(month),month:async()=>[item],definitions:async()=>[expense],definition:async()=>expense,getMonth:async()=>item};}},
  };
  const server=withStubs('lib/finance/bills-server.ts',stubs);assert.equal((await server.readBills()).month,'2026-10');assert.equal((await server.readBills('2026-12')).month,'2026-12');assert.deepEqual(calls,['2026-10','2026-12']);
  const expired=withStubs('lib/finance/bills-server.ts',{...stubs,'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:null,error:null})}})}});
  assert.equal((await expired.readBills()).kind,'Unauthorized');assert.deepEqual(calls,['2026-10','2026-12']);
});
function harness(component,actions,initial) {
  const slots=[],callbacks=[],paths=[];let cursor=0,refreshes=0;
  const react={useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
  const file=component==='BillRow'?'BillsSection':'FixedExpenseEditor';
  const components=withStubs('components/finance/'+file+'.tsx',{react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({replace:p=>paths.push(p),refresh(){refreshes++;}})},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/lib/finance/validation':money,'@/lib/finance/bills':bills,'@/lib/finance/summary':summary,'@/app/financas/contas/actions':actions});
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
  const render=()=>{cursor=0;return components[component](component==='BillRow'?{item:initial??item,onSaved:value=>callbacks.push(value)}:{expense:initial});};
  const find=predicate=>nodes(render(),predicate)[0];
  return {find,callbacks,paths,refreshes:()=>refreshes,submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}}),change:(id,value)=>find(n=>n.props?.id===id).props.onChange({target:{value}})};
}
test('payment UI preserves amount/checkbox on expired session, conflict and uncertain network response without false success',async()=>{
  const original=global.window;global.window={confirm:()=>true};
  try {for(const kind of ['Unauthorized','Conflict','network']) {
    const calls=[],h=harness('BillRow',{saveBillMonth:async value=>{calls.push(value);if(kind==='network')throw Error('offline');return {ok:false,kind,message:'Falha segura'};}});
    h.change('bill-amount-'+id,'213,47');h.find(n=>n.props?.type==='checkbox').props.onChange({target:{checked:true}});await tick();
    assert.equal(calls[0].amountCents,21347);assert.equal(calls[0].expectedUpdatedAt,item.updatedAt);assert.equal(h.find(n=>n.props?.type==='checkbox').props.checked,false);
    assert.equal(h.find(n=>n.props?.id==='bill-amount-'+id).props.value,'213,47');assert.equal(h.callbacks.length,0);assert(!h.find(n=>n.props?.role==='status'));assert(h.find(n=>n.props?.role==='alert'));
    if(kind==='Unauthorized')assert(h.find(n=>n.props?.href==='/auth/login'));
  }}finally{global.window=original;}
});
test('payment confirmation, duplicate click lock, adoption of confirmed snapshot and explicit undo',async()=>{
  const original=global.window;let consent=false;global.window={confirm:()=>consent};
  try {let resolve;const calls=[],h=harness('BillRow',{saveBillMonth:async value=>{calls.push(value);return new Promise(r=>{resolve=r;});}});
    const toggle=checked=>h.find(n=>n.props?.type==='checkbox').props.onChange({target:{checked}});
    toggle(true);assert.equal(calls.length,0);consent=true;toggle(true);toggle(true);assert.equal(calls.length,1);assert.equal(h.callbacks.length,0);
    resolve({ok:true,value:{...item,paidAt:item.updatedAt,financialTransactionId:fixedExpenseId,updatedAt:'2026-10-27T13:00:00.123456Z'}});await tick();assert.equal(h.find(n=>n.props?.type==='checkbox').props.checked,true);
    toggle(false);assert.equal(calls[1].paid,false);assert.equal(calls[1].expectedUpdatedAt,'2026-10-27T13:00:00.123456Z');resolve({ok:true,value:{...item,updatedAt:'2026-10-27T14:00:00Z'}});await tick();assert.equal(h.find(n=>n.props?.type==='checkbox').props.checked,false);
  }finally{global.window=original;}
});
test('new fixed bill keeps draft and attempt UUID after network loss; blocks duplicates and redirects only on confirmed create',async()=>{
  const calls=[];let resolve;
  const h=harness('FixedExpenseEditor',{saveFixedExpense:async value=>{calls.push(value);if(calls.length===1)throw Error('offline');return new Promise(r=>{resolve=r;});}});
  h.change('fixed-name','Aluguel');h.change('fixed-amount','1500,00');h.change('fixed-due','27');await h.submit();assert.equal(h.paths.length,0);assert.equal(h.find(n=>n.props?.id==='fixed-name').props.value,'Aluguel');
  const pending=h.submit();h.submit();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);resolve({ok:true,value:{...expense,id:calls[1].id}});await pending;assert.deepEqual(h.paths,['/financas']);assert.equal(h.refreshes(),1);
});
test('overview shows independent reference, month navigation, totals, empty state and inactive definitions',()=>{
  const {BillsSection}=withStubs('components/finance/BillsSection.tsx',{'next/link':{default:'a'},'next/navigation':{useRouter:()=>({refresh(){}})},'@/components/ui/button':{Button:({children})=>children},'@/components/ui/input':{Input:'input'},'@/lib/finance/validation':money,'@/lib/finance/bills':bills,'@/lib/finance/summary':summary,'@/app/financas/contas/actions':{}});
  const html=renderToStaticMarkup(React.createElement(BillsSection,{month:'2026-11',currentMonth:'2026-10',initialItems:[],definitions:[{...expense,active:false}],calendarMonth:'2026-12'}));
  for(const text of ['Contas do mês','novembro de 2026','mês futuro','Nenhuma conta','Desativada','/financas/contas/nova','Total previsto','Total pago','Restante a pagar','month=2026-12&amp;billMonth=2026-10'])assert(html.includes(text),text);
});
