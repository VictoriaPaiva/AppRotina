import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test,before,beforeEach,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
const {createFinanceRepository}=load('lib/finance/repository.ts'),{financeSummary}=load('lib/finance/summary.ts');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
const iso=value=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
const transport={async query(sql,params){
  const result=await db.query(sql,params);
  for(const row of result.rows)if(Object.hasOwn(row,'updated_at')) {
    const raw=(await db.query('select date::text d,created_at::text c,updated_at::text u from financial_transactions where id=$1',[row.id])).rows[0];
    row.date=raw.d;row.created_at=iso(raw.c);row.updated_at=iso(raw.u);
  }
  return result;
}};
const client=pgliteClient(transport,['financial_transactions']),repo=createFinanceRepository(client,A);
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const input=(extra={})=>({id:randomUUID(),type:'expense',date:'2026-10-27',amountCents:1099,description:'Mercado',category:'Alimentação',...extra});
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;create schema routine_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
  await db.exec(await readFile('supabase/migrations/20261027000200_financial_transactions.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261027000300_fixed_expenses.sql','utf8'));
});
beforeEach(async()=>{await db.exec('reset role;truncate financial_transactions cascade');await user();});
after(async()=>db.close());
test('create income/expense, edit fields/type/month, exact snapshots, positive/negative balance and fresh repository refresh',async()=>{
  assert.deepEqual(await repo.list('2026-10'),[]);
  const income=await repo.create(input({type:'income',amountCents:100000,description:'Salário',category:'Trabalho'}));
  const expense=await repo.create(input());await repo.create(input({amountCents:2901}));await repo.create(input({amountCents:20000,category:'Moradia'}));
  let summary=financeSummary(await repo.list('2026-10'));assert.equal(summary.income,100000n);assert.equal(summary.expense,24000n);assert.equal(summary.balance,76000n);
  assert.deepEqual(summary.categories,[{category:'Moradia',cents:20000n},{category:'Alimentação',cents:4000n}]);
  assert.equal(income.createdAt,income.updatedAt);
  const edited=await repo.update({...input({id:expense.id,type:'income',date:'2026-11-01',amountCents:1001,description:'Reembolso',category:'Outros'}),expectedUpdatedAt:expense.updatedAt});
  assert.notEqual(edited.updatedAt,expense.updatedAt);assert.equal(edited.createdAt,expense.createdAt);
  assert.deepEqual(await createFinanceRepository(client,A).get(edited.id),edited);
  assert.equal((await repo.list('2026-10')).length,3);assert.equal((await repo.list('2026-11'))[0].amountCents,1001);
  await repo.update({...input({id:income.id,amountCents:100000}),expectedUpdatedAt:income.updatedAt});
  summary=financeSummary(await repo.list('2026-10'));assert.equal(summary.balance,-122901n);
  await assert.rejects(()=>repo.update({...input({id:expense.id}),expectedUpdatedAt:expense.updatedAt}),e=>e.kind==='Conflict');
  assert.equal((await repo.get(expense.id)).description,'Reembolso');
  await assert.rejects(()=>repo.create(input({id:expense.id})),e=>e.kind==='Conflict');
});
test('monthly boundaries, leap day, empty months and pagination do not truncate monthly totals',async()=>{
  await repo.create(input({date:'2026-09-30'}));await repo.create(input({date:'2026-11-01'}));
  await repo.create(input({date:'2024-02-29'}));assert.equal((await repo.list('2024-02')).length,1);
  // One SQL insert prepares 501 owned rows; repository must fetch beyond the first page.
  await db.query(`insert into financial_transactions(user_id,type,date,amount_cents,description,category)
    select $1,'expense',case when n=1 then date '2026-10-01' else date '2026-10-31' end,1,'Item '||n,'Teste' from generate_series(1,501) n`,[A]);
  const rows=await repo.list('2026-10');assert.equal(rows.length,501);assert.equal(financeSummary(rows).expense,501n);
  assert.equal(rows[0].date,'2026-10-31');assert.equal(rows.at(-1).date,'2026-10-01');
  assert.deepEqual(await repo.list('2026-12'),[]);
});
test('RLS A/B direct and repository operations; owner spoofing, audit fields, deletion and anon denied',async()=>{
  const transaction=await repo.create(input());await user(B);const b=createFinanceRepository(client,B);
  assert.deepEqual(await b.list('2026-10'),[]);await assert.rejects(()=>b.get(transaction.id),e=>e.kind==='NotFound');
  await assert.rejects(()=>b.update({...input({id:transaction.id}),expectedUpdatedAt:transaction.updatedAt}),e=>e.kind==='NotFound');
  assert.equal((await db.query('select id from financial_transactions where id=$1',[transaction.id])).rows.length,0);
  assert.equal((await db.query('update financial_transactions set amount_cents=1 where id=$1 returning id',[transaction.id])).rows.length,0);
  await assert.rejects(()=>db.query("insert into financial_transactions(user_id,type,date,amount_cents,description,category) values($1,'income','2026-10-27',1,'Spoof','X')",[A]),e=>e.code==='42501');
  await b.create(input({description:'Owner B'}));assert.equal((await b.list('2026-10')).length,1);
  await user();assert.equal((await repo.list('2026-10')).length,1);
  for(const sql of ['update financial_transactions set user_id=user_id','update financial_transactions set created_at=now()','update financial_transactions set updated_at=now()','update financial_transactions set id=id','delete from financial_transactions'])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec('select * from financial_transactions'),e=>e.code==='42501');
  await assert.rejects(()=>db.query("insert into financial_transactions(user_id,type,date,amount_cents,description,category) values($1,'income','2026-10-27',1,'Anon','X')",[A]),e=>e.code==='42501');
});
test('SQL and repository reject invalid amounts/type/text/date; exact integer cents at both boundaries',async()=>{
  for(const amountCents of [1,2147483647])assert.equal((await repo.create(input({amountCents}))).amountCents,amountCents);
  for(const extra of [{amountCents:0},{amountCents:-1},{amountCents:1.1},{amountCents:2147483648},{amountCents:'100'},{type:'other'},{date:'2026-02-29'},{description:' '},{category:' '},{description:'x'.repeat(501)},{category:'x'.repeat(101)},{user_id:A},{updated_at:'x'}])await assert.rejects(()=>repo.create(input(extra)),e=>e.kind==='Validation');
  for(const [type,date,amount,description,category] of [['other','2026-10-01',1,'X','X'],['expense','2026-10-01',0,'X','X'],['expense','2026-10-01',-1,'X','X'],['expense','2026-10-01',1,' ','X'],['expense','2026-10-01',1,'X','x'.repeat(101)],['expense','infinity',1,'X','X']])await assert.rejects(()=>db.query('insert into financial_transactions(user_id,type,date,amount_cents,description,category) values($1,$2,$3,$4,$5,$6)',[A,type,date,amount,description,category]),e=>e.code==='23514');
});
