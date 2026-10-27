import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,beforeEach,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
const {cleanupSql,CLEANUP_TABLES}=load('lib/dev-cleanup/sql.ts');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
async function actor(id) {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function run(id,expected) {
  try {
    const results=await db.exec(cleanupSql(id,expected));
    return results.flatMap(result=>result.rows).find(row=>row.report)?.report;
  } catch(error) {await db.exec('rollback');throw error;}
}
async function save(type,areaId,relations={}) {
  return (await db.query('select save_activity_aggregate($1::jsonb,$2::jsonb) value',[JSON.stringify({name:'Teste '+type,area_id:areaId,type}),JSON.stringify(relations)])).rows[0].value.activity;
}
async function seed(id) {
  await actor(id);const areaId=randomUUID();await db.query('insert into areas(id,user_id,name) values($1,$2,$3)',[areaId,id,'Área teste']);
  await save('reminder',areaId,{reminder_config:{reference_date:'2026-10-27'},recurrence_rules:[{basis:'calendar',pattern:'interval',interval_count:1,unit:'month',anchor_date:'2026-10-27',invalid_date_policy:'lastValidDay',starts_on:'2026-10-27'}]});
  await save('commitment',areaId,{commitment_config:{date:'2026-10-27',start_time:'10:00',end_time:'11:00'}});
  await save('fixedActivity',areaId,{fixed_schedules:[{weekdays:[1,3],start_time:'08:00',end_time:'09:00'}]});
  const variable=await save('variableActivity',areaId,{planning_context:{location:'Teste'},time_windows:[{kind:'timeRange',effect:'preferred',coverage:'startOnly',start_time:'14:00',end_time:'15:00',end_day_offset:0,starts_on:'2026-10-27'}]});
  await save('checklistGoal',areaId,{goals:[{metric:'count',unit:'execution',minimum_target:1,period:'day',starts_on:'2026-10-27'}]});
  await db.query('insert into daily_plan_items(user_id,activity_id,planned_date) values($1,$2,$3)',[id,variable.id,'2026-10-27']);
  await db.query('insert into ideas(user_id,title,content) values($1,$2,$3)',[id,'Ideia teste','Texto teste']);
  const project=randomUUID();await db.query('insert into projects(id,user_id,title) values($1,$2,$3)',[project,id,'Projeto teste']);await db.query('insert into project_tasks(user_id,project_id,title) values($1,$2,$3)',[id,project,'Tarefa teste']);
  await db.query("insert into financial_transactions(user_id,type,date,amount_cents,description,category) values($1,'expense','2026-10-27',12345,'Manual teste','Teste')",[id]);
  await db.query("select save_fixed_expense($1,'Aluguel',150000,27,'Moradia',true)",[randomUUID()]);
  const bill=(await db.query('select id,updated_at::text updated_at from fixed_expense_months where user_id=$1',[id])).rows[0];
  await db.query('select save_fixed_expense_month($1,150000,true,$2::timestamptz)',[bill.id,bill.updated_at]);
}
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}','a@example.test','password-hash-A'),('${B}','b@example.test','password-hash-B');create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);insert into supabase_migrations.schema_migrations values('fixture');`);
  for(const file of (await readdir('supabase/migrations')).filter(file=>file.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
});
beforeEach(async()=>{await db.exec('reset role;truncate '+CLEANUP_TABLES.map(table=>'public.'+table).join(',')+' cascade');await seed(A);await seed(B);await db.exec('reset role');});
after(async()=>db.close());
test('preview counts every owned table without changing any data; authenticated role itself has no reset privilege',async()=>{
  const preview=await run(A);assert.equal(preview.executed,false);assert.equal(preview.accountPreserved,true);assert.equal(preview.otherAccounts,1);
  for(const table of CLEANUP_TABLES){assert(preview.counts[table]>0,table);assert(preview.otherCounts[table]>0,table);}
  assert.deepEqual((await run(A)).ownerState,preview.ownerState);
  await actor(A);await db.exec('set role authenticated');await assert.rejects(()=>db.exec('delete from areas'),error=>error.code==='42501');await db.exec('reset role');
});
test('clear A atomically, all 16 tables zero, B byte-equivalent, Auth/password and schema/functions/policies/migrations intact',async()=>{
  const preview=await run(A),beforeB=await run(B),authBefore=(await db.query('select * from auth.users order by id')).rows;
  const result=await run(A,preview);assert(result.executed&&result.allZero&&result.othersUnchanged&&result.accountPreserved&&result.structureUnchanged);
  for(const table of CLEANUP_TABLES){assert.equal(result.counts[table],0,table);assert.equal(result.otherCounts[table],preview.otherCounts[table]);}
  assert.deepEqual((await run(B)).ownerState,beforeB.ownerState);assert.deepEqual((await db.query('select * from auth.users order by id')).rows,authBefore);assert.equal(result.structure,preview.structure);
  assert.deepEqual((await db.query('select * from supabase_migrations.schema_migrations')).rows,[{version:'fixture'}]);
});
test('after cleanup A has initial Banco Mestre state and can create first area/activity, idea, project, plan, finance and fixed bill under real authenticated grants',async()=>{
  await run(A,await run(A));await actor(A);await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select id from areas')).rows,[]);assert.deepEqual((await db.query('select id from activities')).rows,[]);
  const area=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Primeira área')",[area,A]);
  const first=await save('reminder',area,{reminder_config:{reference_date:'2026-10-27'}});assert(first.id);
  await db.query("insert into ideas(user_id,title) values($1,'Oficial')",[A]);
  const project=randomUUID();await db.query("insert into projects(id,user_id,title) values($1,$2,'Oficial')",[project,A]);
  await db.query("insert into daily_plan_items(user_id,activity_id,planned_date) values($1,$2,'2026-10-27')",[A,first.id]);
  await db.query("insert into financial_transactions(user_id,type,date,amount_cents,description,category) values($1,'income','2026-10-27',1,'Oficial','Oficial')",[A]);
  await db.query("select save_fixed_expense($1,'Conta oficial',100,10,'Oficial',true)",[randomUUID()]);
  assert.equal((await db.query('select count(*)::int n from areas')).rows[0].n,1);await db.exec('reset role');
});
test('changed rows or schema after preview fail closed without deleting either account',async()=>{
  const preview=await run(A);await db.query("update ideas set title='Novo dado' where user_id=$1",[A]);
  await assert.rejects(()=>run(A,preview),/CLEANUP_STALE_PREVIEW/);const fresh=await run(A);assert(fresh.counts.activities>0);assert(fresh.otherCounts.activities>0);
  await db.exec('create table public.unreviewed(user_id uuid)');
  try {await assert.rejects(()=>run(A,fresh),/CLEANUP_UNKNOWN_TABLES/);}finally{await db.exec('drop table public.unreviewed');}
  assert.deepEqual((await run(A)).ownerState,fresh.ownerState);
});
test('an injected mid-delete failure rolls back planning removals and cleared finance links together',async()=>{
  await db.exec("create function public.reject_cleanup() returns trigger language plpgsql as $$begin raise exception 'injected';end$$;create trigger reject_cleanup before delete on ideas for each row execute function public.reject_cleanup();");
  try {
    const preview=await run(A),beforeB=await run(B);await assert.rejects(()=>run(A,preview),/injected/);
    assert.deepEqual((await run(A)).ownerState,preview.ownerState);assert.deepEqual((await run(B)).ownerState,beforeB.ownerState);
  } finally {await db.exec('drop trigger reject_cleanup on ideas;drop function public.reject_cleanup()');}
});
test('paused progress or unknown app schema blocks cleanup; missing account and malformed actor cannot select another owner',async()=>{
  const preview=await run(A);await db.exec('create schema unreviewed;create table unreviewed.records(user_id uuid)');
  try {await assert.rejects(()=>run(A,preview),/CLEANUP_UNKNOWN_SCHEMA/);}finally{await db.exec('drop table unreviewed.records;drop schema unreviewed');}
  await db.exec('create table public.progress_attempts(user_id uuid)');try{await assert.rejects(()=>run(A,preview),/CLEANUP_UNKNOWN_TABLES/);}finally{await db.exec('drop table public.progress_attempts');}
  await assert.rejects(()=>run('00000000-0000-4000-8000-000000000099'),/CLEANUP_ACCOUNT_MISSING/);assert.throws(()=>cleanupSql("bad';delete from auth.users;--"));assert.deepEqual((await run(A)).ownerState,preview.ownerState);
});
