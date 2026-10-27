import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test,before,beforeEach,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
const {createBillsRepository}=load('lib/finance/bills-repository.ts'),{createFinanceRepository}=load('lib/finance/repository.ts');
const {billReferenceMonth,shiftBillMonth,billTotals}=load('lib/finance/bills.ts');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();let currentMonth,today;
const transport={async query(sql,params){
  const result=await db.query(sql,params);
  for(const row of result.rows)if(Object.hasOwn(row,'updated_at')) {
    const table=Object.hasOwn(row,'reference_month')?'fixed_expense_months':Object.hasOwn(row,'starts_on')?'fixed_expenses':'financial_transactions';
    const raw=(await db.query(`select to_jsonb(t) value from ${table} t where id=$1`,[row.id])).rows[0].value;
    Object.assign(row,raw);
  }
  return result;
}};
const client={...pgliteClient(transport,['fixed_expenses','fixed_expense_months','financial_transactions']),async rpc(name,args){
  try {
    const signatures={save_fixed_expense:['uuid','text','integer','integer','text','boolean','timestamptz'],initialize_fixed_expense_month:['date'],save_fixed_expense_month:['uuid','integer','boolean','timestamptz']};
    const keys={save_fixed_expense:['p_id','p_name','p_default_amount_cents','p_due_day','p_category','p_active','p_expected_updated_at'],initialize_fixed_expense_month:['p_reference_month'],save_fixed_expense_month:['p_id','p_amount_cents','p_paid','p_expected_updated_at']};
    assert(name in signatures);const values=keys[name].map(key=>args[key]??null);
    const result=await db.query(`select public.${name}(${signatures[name].map((type,index)=>'$'+(index+1)+'::'+type).join(',')}) value`,values);
    return {data:result.rows[0].value,error:null};
  }catch(error){return {data:null,error};}
}};
const repo=createBillsRepository(client,A),finance=createFinanceRepository(client,A);
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const definition=(extra={})=>({id:randomUUID(),name:'Aluguel',defaultAmountCents:150000,dueDay:27,category:'Moradia',active:true,expectedUpdatedAt:null,...extra});
const pay=(row,extra={})=>({id:row.id,amountCents:row.amountCents,paid:true,expectedUpdatedAt:row.updatedAt,...extra});
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;create schema routine_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
  for(const file of ['20261027000200_financial_transactions.sql','20261027000300_fixed_expenses.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  today=(await db.query("select ((clock_timestamp() at time zone 'America/Sao_Paulo')::date)::text d")).rows[0].d;currentMonth=billReferenceMonth(today);
});
beforeEach(async()=>{await db.exec('reset role;truncate fixed_expenses,fixed_expense_months,financial_transactions cascade');await user();});
after(async()=>db.close());
test('create rent due 27 appears in current financial month; lazy initialization and duplicate create retry are idempotent',async()=>{
  const input=definition(),saved=await repo.saveDefinition(input);assert.equal(saved.startsOn,currentMonth+'-01');
  await repo.saveDefinition(input);await repo.initialize(currentMonth);await repo.initialize(currentMonth);
  const rows=await repo.month(currentMonth);assert.equal(rows.length,1);assert.equal(rows[0].dueDay,27);assert.equal(rows[0].paidAt,null);assert.equal(rows[0].amountCents,150000);
  await repo.initialize(shiftBillMonth(currentMonth,-1));assert.equal((await repo.month(shiftBillMonth(currentMonth,-1))).length,0);
  assert.equal((await repo.definitions()).length,1);assert.deepEqual(await repo.definition(saved.id),saved);
});
test('payment, refresh, retries, monthly value edit, next month and previous history retain independent state and linked transaction',async()=>{
  const saved=await repo.saveDefinition(definition({name:'Luz',defaultAmountCents:18000,category:'Casa'}));
  const row=(await repo.month(currentMonth))[0];const request=pay(row,{amountCents:21347});
  const paid=await repo.saveMonth(request);assert(paid.paidAt);assert(paid.financialTransactionId);assert.equal(paid.amountCents,21347);
  assert.deepEqual(await repo.saveMonth(request),paid);assert.deepEqual(await createBillsRepository(client,A).getMonth(paid.id),paid);
  const tx=await finance.get(paid.financialTransactionId);assert.equal(tx.type,'expense');assert.equal(tx.amountCents,21347);assert.equal(tx.date,today);assert.equal(tx.fixedExpenseMonthId,paid.id);
  assert.equal((await db.query('select count(*)::int n from financial_transactions')).rows[0].n,1);
  const changed=await repo.saveMonth(pay(paid,{amountCents:22001}));assert.equal(changed.paidAt,paid.paidAt);assert.equal(changed.financialTransactionId,paid.financialTransactionId);assert.equal((await finance.get(tx.id)).amountCents,22001);
  await assert.rejects(()=>repo.saveMonth(pay(row,{amountCents:1})),e=>e.kind==='Conflict');
  assert.equal((await repo.definition(saved.id)).defaultAmountCents,18000);
  const next=shiftBillMonth(currentMonth,1);await repo.initialize(next);const future=(await repo.month(next))[0];assert.equal(future.paidAt,null);assert.equal(future.amountCents,18000);
  assert.equal((await repo.getMonth(row.id)).paidAt,paid.paidAt);assert.equal((await repo.getMonth(row.id)).amountCents,22001);
});
test('undo deletes only its linked transaction, retries are safe, re-payment creates exactly one current expense',async()=>{
  await repo.saveDefinition(definition());const row=(await repo.month(currentMonth))[0],paid=await repo.saveMonth(pay(row));
  const manual=await finance.create({id:randomUUID(),type:'expense',date:today,amountCents:100,description:'Manual',category:'Outra'});
  const request=pay(paid,{paid:false}),undone=await repo.saveMonth(request);assert.equal(undone.paidAt,null);assert.equal(undone.financialTransactionId,null);
  assert.deepEqual(await repo.saveMonth(request),undone);await assert.rejects(()=>finance.get(paid.financialTransactionId),e=>e.kind==='NotFound');assert.equal((await finance.get(manual.id)).amountCents,100);
  const again=await repo.saveMonth(pay(undone));await repo.saveMonth(pay(undone));assert(again.financialTransactionId);assert.equal((await db.query('select count(*)::int n from financial_transactions where fixed_expense_month_id=$1',[row.id])).rows[0].n,1);
});
test('definition edits do not change historical snapshots; inactive stops new months while history and reactivation remain available',async()=>{
  const saved=await repo.saveDefinition(definition()),row=(await repo.month(currentMonth))[0],paid=await repo.saveMonth(pay(row));
  const changed=await repo.saveDefinition({...definition({id:saved.id,name:'Novo nome',defaultAmountCents:170000,dueDay:10,active:false,expectedUpdatedAt:saved.updatedAt})});
  const next=shiftBillMonth(currentMonth,1);await repo.initialize(next);assert.deepEqual(await repo.month(next),[]);
  assert.deepEqual(await repo.getMonth(row.id),paid);assert.equal((await repo.definitions())[0].active,false);
  await assert.rejects(()=>repo.saveDefinition({...definition({id:saved.id,name:'Stale',expectedUpdatedAt:saved.updatedAt})}),e=>e.kind==='Conflict');
  await repo.saveDefinition({...definition({id:saved.id,name:changed.name,defaultAmountCents:changed.defaultAmountCents,dueDay:changed.dueDay,expectedUpdatedAt:changed.updatedAt})});await repo.initialize(next);
  const future=(await repo.month(next))[0];assert.equal(future.amountCents,170000);assert.equal(future.name,'Novo nome');assert.equal(future.dueDay,10);assert.equal(future.paidAt,null);
});
test('A/B/anon and direct DML cannot cross owners, forge links, modify generated expenses or delete manual transactions',async()=>{
  const saved=await repo.saveDefinition(definition()),row=(await repo.month(currentMonth))[0],paid=await repo.saveMonth(pay(row));
  assert.equal((await db.query('update financial_transactions set amount_cents=1 where id=$1 returning id',[paid.financialTransactionId])).rows.length,0);
  await assert.rejects(async()=>finance.update({id:paid.financialTransactionId,type:'expense',date:today,amountCents:1,description:'Tamper',category:'X',expectedUpdatedAt:(await finance.get(paid.financialTransactionId)).updatedAt}),e=>e.kind==='Conflict');
  for(const sql of ['update fixed_expense_months set paid_at=null','insert into fixed_expenses(name) values(\'X\')','delete from fixed_expenses','delete from financial_transactions'])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
  await user(B);const b=createBillsRepository(client,B);assert.deepEqual(await b.definitions(),[]);assert.deepEqual(await b.month(currentMonth),[]);
  await assert.rejects(()=>b.getMonth(row.id),e=>e.kind==='NotFound');await assert.rejects(()=>b.saveMonth(pay(row)),e=>e.kind==='NotFound');await assert.rejects(()=>b.saveDefinition(definition({id:saved.id,expectedUpdatedAt:saved.updatedAt})),e=>e.kind==='NotFound');
  await b.initialize(currentMonth);assert.deepEqual(await b.month(currentMonth),[]);
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec('select * from fixed_expense_months'),e=>e.code==='42501');await assert.rejects(()=>db.query('select initialize_fixed_expense_month($1)',[currentMonth+'-01']),e=>e.code==='42501');
  await user('');await assert.rejects(()=>repo.initialize(currentMonth),e=>e.kind==='Unauthorized');
});
test('database and TypeScript cutoff agree on 19/20, month/year transitions; totals are exact',async()=>{
  await db.exec('reset role');for(const [date,expected] of [['2026-10-27','2026-10'],['2026-11-19','2026-10'],['2026-11-20','2026-11'],['2026-11-27','2026-11'],['2027-01-01','2026-12'],['2027-01-20','2027-01']]) {
    assert.equal(billReferenceMonth(date),expected);assert.equal((await db.query('select routine_private.bill_reference_month($1)::text m',[date])).rows[0].m,expected+'-01');
  }await user();
  await repo.saveDefinition(definition({defaultAmountCents:10001}));await repo.saveDefinition(definition({name:'Internet',defaultAmountCents:12000,dueDay:10}));const rows=await repo.month(currentMonth);await repo.saveMonth(pay(rows[0]));
  const totals=billTotals(await repo.month(currentMonth));assert.equal(totals.expected,22001n);assert.equal(totals.paid,BigInt(rows[0].amountCents));assert.equal(totals.remaining,22001n-BigInt(rows[0].amountCents));
});
test('failed linked insert/update/delete rolls back the entire bill operation without false payment or orphan entries',async()=>{
  await repo.saveDefinition(definition());let row=(await repo.month(currentMonth))[0];
  await db.exec(`reset role;create function public.reject_bill_tx() returns trigger language plpgsql as $$begin raise exception 'injected failure';end$$;create trigger reject_bill_tx before insert or update or delete on financial_transactions for each row execute function public.reject_bill_tx();`);await user();
  await assert.rejects(()=>repo.saveMonth(pay(row)));assert.deepEqual(await repo.getMonth(row.id),row);assert.equal((await db.query('select count(*)::int n from financial_transactions')).rows[0].n,0);
  await db.exec('reset role;alter table financial_transactions disable trigger reject_bill_tx');await user();row=await repo.saveMonth(pay(row));
  await db.exec('reset role;alter table financial_transactions enable trigger reject_bill_tx');await user();
  await assert.rejects(()=>repo.saveMonth(pay(row,{amountCents:1})));await assert.rejects(()=>repo.saveMonth(pay(row,{paid:false})));assert.deepEqual(await repo.getMonth(row.id),row);assert.equal((await finance.get(row.financialTransactionId)).amountCents,row.amountCents);
  await db.exec('reset role;drop trigger reject_bill_tx on financial_transactions;drop function public.reject_bill_tx()');
});
test('composite FKs, unique month and column grants prevent cross-owner links; RPC privileges are restricted',async()=>{
  await repo.saveDefinition(definition());const a=(await repo.month(currentMonth))[0];
  await user(B);const b=createBillsRepository(client,B);await b.saveDefinition(definition());const foreign=(await b.month(currentMonth))[0];const paid=await b.saveMonth(pay(foreign));
  await db.exec('reset role');
  await assert.rejects(()=>db.query('update fixed_expense_months set fixed_expense_id=$1 where id=$2',[foreign.fixedExpenseId,a.id]),e=>e.code==='23503');
  await assert.rejects(()=>db.query('update fixed_expense_months set paid_at=now(),financial_transaction_id=$1 where id=$2',[paid.financialTransactionId,a.id]),e=>e.code==='23503'||e.code==='23505');
  await assert.rejects(()=>db.query('update financial_transactions set fixed_expense_month_id=$1 where id=$2',[a.id,paid.financialTransactionId]),e=>e.code==='23503');
  const duplicate={...a};await assert.rejects(()=>db.query('insert into fixed_expense_months(user_id,fixed_expense_id,reference_month,name,due_day,category,amount_cents) values($1,$2,$3,$4,$5,$6,$7)',[A,duplicate.fixedExpenseId,currentMonth+'-01','Duplicate',27,'X',1]),e=>e.code==='23505');
  const functions=(await db.query("select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth from pg_proc where pronamespace='public'::regnamespace and proname in ('save_fixed_expense','initialize_fixed_expense_month','save_fixed_expense_month')")).rows;
  assert.equal(functions.length,3);for(const fn of functions){assert.equal(fn.prosecdef,true);assert.equal(fn.anon,false);assert.equal(fn.auth,true);assert(fn.proconfig.some(value=>value.startsWith('search_path=')));}
  await user();await assert.rejects(()=>db.query('update financial_transactions set fixed_expense_month_id=$1',[a.id]),e=>e.code==='42501');
  const rpc=await client.rpc('initialize_fixed_expense_month',{p_reference_month:currentMonth+'-02'});assert.equal(rpc.error.code,'22023');
});
