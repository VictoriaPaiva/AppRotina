/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node/React harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const validation=load('lib/finance/validation.ts'),summary=load('lib/finance/summary.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const id='10000000-0000-4000-8000-000000000001';
const input={id,type:'expense',date:'2026-10-27',amountCents:1099,description:'Mercado',category:'Alimentação'};
const transaction={...input,createdAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00.123456Z'};
test('decimal input parses integer cents exactly, rejects ambiguous/invalid amounts, formats BRL without rounding',()=>{
  for(const [text,cents] of [['0,01',1],['0.10',10],['1',100],['1,1',110],['0001,01',101],['21474836,47',2147483647]])assert.equal(validation.parseAmount(text),cents);
  for(const text of ['0','-1','1.001','1,001','1.000,00','1,000.00','1e3','NaN','Infinity','','1,','0,00','21474836,48','999999999999999999999'])assert.throws(()=>validation.parseAmount(text));
  assert.equal(validation.amountInput(1099),'10,99');assert.equal(summary.formatMoney(1099),'R$ 10,99');assert.equal(summary.formatMoney(-1n),'-R$ 0,01');
  assert.equal(summary.formatMoney(900719925474099301n),'R$ 9.007.199.254.740.993,01');
});
test('strict transaction inputs validate dates, cents, text and reject browser owner/audit fields',()=>{
  assert.equal(validation.createTransactionInput({...input,category:'  Alimentação  '}).category,'Alimentação');
  for(const extra of [{user_id:id},{created_at:'x'},{amountCents:'1099'},{amountCents:10.1},{amountCents:0},{amountCents:2147483648},{type:'other'},{date:'2026-02-29'},{description:' '},{category:''},{description:'x'.repeat(501)},{category:'x'.repeat(101)},{category:'\0'}])assert.throws(()=>validation.createTransactionInput({...input,...extra}));
  assert.equal(validation.updateTransactionInput({...input,expectedUpdatedAt:transaction.updatedAt}).expectedUpdatedAt,transaction.updatedAt);
  assert.deepEqual(validation.monthBounds('2024-02'),{start:'2024-02-01',end:'2024-02-29'});
  assert.deepEqual(validation.monthBounds('9999-12'),{start:'9999-12-01',end:'9999-12-31'});
  for(const month of ['2026-00','2026-13','0000-01','2026-1','2026-01-01',['2026-10']])assert.throws(()=>validation.financeMonth(month));
});
test('monthly summary covers zero/positive/negative balance, cent precision and expense-only categories sorted descending',()=>{
  assert.deepEqual(summary.financeSummary([]),{income:0n,expense:0n,balance:0n,categories:[]});
  const rows=[{...transaction,type:'income',amountCents:10000,category:'Salário'},{...transaction,amountCents:10},{...transaction,amountCents:20},{...transaction,amountCents:10001,category:'Moradia'}];
  assert.deepEqual(summary.financeSummary(rows),{income:10000n,expense:10031n,balance:-31n,categories:[{category:'Moradia',cents:10001n},{category:'Alimentação',cents:30n}]});
  assert.equal(summary.financeSummary(rows.slice(0,3)).balance,9970n);
});
function actionsHarness({failure,authFailure=false}={}) {
  const calls=[],paths=[];
  const repo={create:async v=>{calls.push(v);if(failure)throw failure;return transaction;},update:async v=>{calls.push(v);if(failure)throw failure;return transaction;}};
  return {calls,paths,...withStubs('app/financas/actions.ts',{
    'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/finance/server':{financeRepositoryForSession:async()=>{if(authFailure)throw new PersistenceError('Unauthorized');return repo;}},
    '@/lib/finance/validation':validation,'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
  })};
}
test('actions validate before session, verify owner and invalidate only confirmed create/edit; safe failures never report success',async()=>{
  const h=actionsHarness();assert.deepEqual(await h.createTransaction(input),{ok:true,transaction});assert.deepEqual(h.paths,['/financas','/financas/'+id]);
  assert((await h.updateTransaction({...input,expectedUpdatedAt:transaction.updatedAt})).ok);assert.equal(h.calls[1].expectedUpdatedAt,transaction.updatedAt);
  assert.equal((await h.createTransaction({...input,amountCents:0})).kind,'Validation');assert.equal(h.calls.length,2);
  for(const config of [{authFailure:true},{failure:Error('private SQL details')},{failure:new PersistenceError('Conflict')}]) {
    const f=actionsHarness(config),result=await f.createTransaction(input);assert.equal(result.ok,false);assert.equal(f.paths.length,0);assert(!JSON.stringify(result).includes('private SQL'));
  }
});
test('SSR reads requested month, defaults to current Sao Paulo month, rejects invalid months, fails closed on expired claims',async()=>{
  const calls=[],stubs={
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:id}},error:null})}})},
    '@/lib/banco-mestre/data/errors':{PersistenceError},'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    './validation':validation,'@/lib/planning/dates':{planToday:()=> '2026-10-27'},
    './repository':{createFinanceRepository:(_client,owner)=>{assert.equal(owner,id);return {list:async month=>{calls.push(month);return [transaction];},get:async()=>transaction};}},
  };
  const server=withStubs('lib/finance/server.ts',stubs);
  assert.equal((await server.readFinance()).month,'2026-10');assert.equal((await server.readFinance('2026-09')).month,'2026-09');
  assert.equal((await server.readFinance('bad')).kind,'Validation');assert.deepEqual(calls,['2026-10','2026-09']);assert.deepEqual((await server.readTransaction(id)).transaction,transaction);
  for(const result of [{data:null,error:null},{data:{claims:{sub:id}},error:{code:'expired'}}]) {
    const expired=withStubs('lib/finance/server.ts',{...stubs,'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>result}})}});assert.equal((await expired.readFinance()).kind,'Unauthorized');
  }
});
test('real overview renders month form, empty states, totals, escaped rows and editing links without placeholders',()=>{
  const {FinanceOverview}=withStubs('components/finance/FinanceOverview.tsx',{'next/link':{default:'a'},'@/components/ui/button':{Button:({children})=>children},'@/lib/finance/summary':summary,'@/lib/planning/dates':load('lib/planning/dates.ts')});
  const render=transactions=>renderToStaticMarkup(React.createElement(FinanceOverview,{month:'2026-10',transactions}));
  const empty=render([]);assert(empty.includes('Nenhum lançamento neste mês'));assert(empty.includes('Nenhuma despesa'));assert(empty.includes('name="month"'));assert(empty.includes('value="2026-10"'));assert(empty.includes('/financas/nova?month=2026-10'));
  const html=render([{...transaction,description:'<script>'},{...transaction,id:'second',type:'income',amountCents:10000}]);
  for(const text of ['&lt;script&gt;','Receita','Despesa','27/10/2026','R$ 10,99','R$ 100,00','R$ 89,01','/financas/'+id,'Despesas por categoria'])assert(html.includes(text));
});
function editorHarness({initial=transaction,create,update}={}) {
  const slots=[],paths=[];let cursor=0,refreshes=0;
  const react={useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
  const {TransactionEditor}=withStubs('components/finance/TransactionEditor.tsx',{
    react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({replace:p=>paths.push(p),refresh(){refreshes++;}})},
    '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/app/financas/actions':{createTransaction:create,updateTransaction:update},'@/lib/finance/validation':validation,
  });
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
  const render=()=>{cursor=0;return TransactionEditor({transaction:initial,initialDate:'2026-10-27'});};
  const find=predicate=>nodes(render(),predicate)[0];
  return {find,paths,refreshes:()=>refreshes,change:(field,value)=>find(n=>n.props?.id==='transaction-'+field).props.onChange({target:{value}}),submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}})};
}
test('editing retains every draft field on session/network/conflict failures without false success',async()=>{
  for(const failure of ['throw','Unauthorized','Conflict']) {
    const calls=[],h=editorHarness({update:async value=>{calls.push(value);if(failure==='throw')throw Error('network');return {ok:false,kind:failure,message:'Falha segura'};}});
    for(const [field,value] of [['type','income'],['date','2026-11-01'],['amount','123,45'],['description','Rascunho'],['category','Outra']])h.change(field,value);
    await h.submit();assert.equal(calls[0].amountCents,12345);assert.equal(calls[0].expectedUpdatedAt,transaction.updatedAt);
    for(const [field,value] of [['type','income'],['date','2026-11-01'],['amount','123,45'],['description','Rascunho'],['category','Outra']])assert.equal(h.find(n=>n.props?.id==='transaction-'+field).props.value,value);
    assert(h.find(n=>n.props?.role==='alert'));assert(!h.find(n=>n.props?.role==='status'));assert.equal(h.paths.length,0);assert.equal(h.refreshes(),0);
    if(failure==='Unauthorized')assert(h.find(n=>n.props?.href==='/auth/login'));
  }
});
test('new transaction retains attempt UUID, blocks pending duplicate submits, navigates only on confirmation',async()=>{
  const calls=[];let resolve;const h=editorHarness({initial:null,create:async value=>{calls.push(value);if(calls.length===1)throw Error('network');return new Promise(r=>{resolve=r;});}});
  h.change('amount','10,99');h.change('description','Mercado');h.change('category','Alimentação');await h.submit();assert.equal(h.paths.length,0);
  const pending=h.submit();h.submit();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);
  resolve({ok:true,transaction:{...transaction,id:calls[1].id}});await pending;assert.deepEqual(h.paths,['/financas/'+calls[1].id]);assert.equal(h.refreshes(),1);
  h.submit();assert.equal(calls.length,2);
});
test('confirmed edit adopts database snapshot and changed month; invalid amount is blocked and remains editable',async()=>{
  const calls=[],h=editorHarness({update:async value=>{calls.push(value);return {ok:true,transaction:{...transaction,...value,updatedAt:'2026-10-27T13:00:00.123456Z'}};}});
  h.change('date','2026-11-01');await h.submit();assert(h.find(n=>n.props?.role==='status'));assert(h.find(n=>n.props?.href==='/financas?month=2026-11'));
  h.change('amount','0,01');await h.submit();assert.equal(calls[1].expectedUpdatedAt,'2026-10-27T13:00:00.123456Z');assert.equal(calls[1].amountCents,1);
  h.change('amount','1.234,56');assert(h.find(n=>n.props?.type==='submit').props.disabled);assert.equal(h.find(n=>n.props?.id==='transaction-amount').props.value,'1.234,56');
});
test('conflict reload asks before discarding draft',async()=>{
  const original=global.window;let consent=false,reloads=0;global.window={confirm:()=>consent,location:{reload(){reloads++;}}};
  try {const h=editorHarness({update:async()=>({ok:false,kind:'Conflict',message:'Recarregue'})});h.change('description','Rascunho');await h.submit();
    const reload=()=>h.find(n=>n.type==='button'&&n.props.children==='Recarregar dados salvos').props.onClick();reload();assert.equal(reloads,0);consent=true;reload();assert.equal(reloads,1);
  } finally {global.window=original;}
});
