import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {createPlanRepository}=load('lib/planning/repository.ts');
const {planSnapshot}=load('lib/planning/contracts.ts');
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
const iso=value=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
// Keep exact microseconds, just like PostgREST (JS Date would truncate a CAS token).
const transport={async query(sql,params){
  const result=await db.query(sql,params);
  for(const row of result.rows) if(Object.hasOwn(row,'updated_at')) {
    const raw=(await db.query('select planned_date::text p,created_at::text c,updated_at::text u,completed_at::text d from daily_plan_items where id=$1',[row.id])).rows[0];
    row.planned_date=raw.p;row.created_at=iso(raw.c);row.updated_at=iso(raw.u);row.completed_at=raw.d===null?null:iso(raw.d);
  }
  return result;
}};
const client=pgliteClient(transport,['daily_plan_items']);
const repo=createPlanRepository(client,A);
const kind=name=>error=>error.kind===name;
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function activity(owner=A){
  const area=randomUUID();await db.query('insert into areas(id,user_id,name) values($1,$2,$3)',[area,owner,'Planning area']);
  return (await db.query("select save_activity_aggregate($1::jsonb,'{}'::jsonb) result",[JSON.stringify({name:'Real planned activity',type:'variableActivity',area_id:area})])).rows[0].result.activity;
}
const create=(activityId,plannedDate='2026-10-22')=>repo.create({id:randomUUID(),activityId,plannedDate});
before(async()=>{
  await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values('${A}'),('${B}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await user();
});
after(async()=>db.close());

test('plans persist stable UUID for today, tomorrow and custom date; duplicate activity/date conflicts',async()=>{
  const a=await activity(), id=randomUUID();
  const first=await repo.create({id,activityId:a.id,plannedDate:'2026-10-22'});
  assert.equal(first.id,id);assert.equal(first.completedAt,null);
  for(const date of ['2026-10-23','2027-01-03'])assert.equal((await create(a.id,date)).plannedDate,date);
  assert.equal((await repo.listByDate('2026-10-22')).find(p=>p.id===id).id,id);
  await assert.rejects(()=>create(a.id),kind('Conflict'));
  await assert.rejects(()=>repo.create({id,activityId:a.id,plannedDate:'2026-10-22'}),kind('Conflict'));
  assert.equal((await db.query('select count(*)::int n from daily_plan_items where activity_id=$1',[a.id])).rows[0].n,3);
});
test('complete/undo uses database clock and exact snapshot; stale tabs cannot overwrite',async()=>{
  const a=await activity(), p=await create(a.id);
  const done=await repo.setCompleted({id:p.id,expected:planSnapshot(p),completed:true});
  assert(done.completedAt.startsWith('20'));assert(!done.completedAt.startsWith('2000-'));assert.notEqual(done.updatedAt,p.updatedAt);
  await assert.rejects(()=>repo.reschedule({id:p.id,expected:planSnapshot(p),plannedDate:'2026-10-24'}),kind('Conflict'));
  await assert.rejects(()=>repo.setCompleted({id:p.id,expected:planSnapshot(p),completed:false}),kind('Conflict'));
  const undone=await repo.setCompleted({id:p.id,expected:planSnapshot(done),completed:false});assert.equal(undone.completedAt,null);
  assert.equal((await db.query('select revision from activities where id=$1',[a.id])).rows[0].revision,a.revision);
});
test('pending means before civil today and uncompleted; reschedule preserves identity and clears pending',async()=>{
  const a=await activity(), p=await create(a.id,'2026-10-21');
  assert((await repo.listPending('2026-10-22')).some(i=>i.id===p.id));
  const moved=await repo.reschedule({id:p.id,expected:planSnapshot(p),plannedDate:'2026-10-23'});
  assert.equal(moved.id,p.id);assert.equal(moved.createdAt,p.createdAt);assert.equal(moved.completedAt,null);
  assert(!(await repo.listPending('2026-10-22')).some(i=>i.id===p.id));
  const past=await create(a.id,'2026-10-20');
  await repo.setCompleted({id:past.id,expected:planSnapshot(past),completed:true});
  assert(!(await repo.listPending('2026-10-22')).some(i=>i.id===past.id));
  assert(!(await repo.listPending('2026-10-23')).some(i=>i.id===moved.id));
});
test('reschedule collision rolls back; completed items cannot be rescheduled even by direct DML',async()=>{
  const a=await activity(), p=await create(a.id), other=await create(a.id,'2026-10-23');
  await assert.rejects(()=>repo.reschedule({id:p.id,expected:planSnapshot(p),plannedDate:other.plannedDate}),kind('Conflict'));
  assert.equal((await repo.listByDate(p.plannedDate)).find(i=>i.id===p.id).updatedAt,p.updatedAt);
  const done=await repo.setCompleted({id:p.id,expected:planSnapshot(p),completed:true});
  await assert.rejects(()=>repo.reschedule({id:p.id,expected:planSnapshot(done),plannedDate:'2026-10-25'}),kind('Validation'));
  await assert.rejects(()=>db.query('update daily_plan_items set planned_date=$1 where id=$2',['2026-10-25',p.id]),e=>e.code==='23514');
});
test('deactivation prevents new plans at SQL level but preserves old plan visibility and completion',async()=>{
  const a=await activity(), p=await create(a.id);
  await db.query("update activities set status='inactive' where id=$1",[a.id]);
  await assert.rejects(()=>create(a.id,'2026-10-23'),kind('NotFound'));
  assert((await repo.listByDate(p.plannedDate)).some(i=>i.id===p.id));
  assert((await repo.setCompleted({id:p.id,expected:planSnapshot(p),completed:true})).completedAt);
});
test('RLS isolates A/B reads/writes and composite FK rejects foreign Activity; anon and DELETE denied',async()=>{
  const a=await activity(), p=await create(a.id);
  await user(B);const b=createPlanRepository(client,B);
  assert.equal((await b.listByDate(p.plannedDate)).some(i=>i.id===p.id),false);
  await assert.rejects(()=>b.setCompleted({id:p.id,expected:planSnapshot(p),completed:true}),kind('NotFound'));
  await assert.rejects(()=>b.create({id:randomUUID(),activityId:a.id,plannedDate:p.plannedDate}),kind('NotFound'));
  await assert.rejects(()=>db.query('insert into daily_plan_items(id,user_id,activity_id,planned_date) values($1,$2,$3,$4)',[randomUUID(),A,a.id,'2026-10-26']),e=>['42501','23503'].includes(e.code));
  assert.equal((await db.query('update daily_plan_items set completed_at=now() where id=$1 returning id',[p.id])).rows.length,0);
  const ownB=await activity(B), planB=await b.create({id:randomUUID(),activityId:ownB.id,plannedDate:p.plannedDate});
  await user();assert.equal((await repo.listByDate(p.plannedDate)).find(i=>i.id===p.id).completedAt,null);
  assert(!(await repo.listByDate(p.plannedDate)).some(i=>i.id===planB.id));
  await assert.rejects(()=>repo.setCompleted({id:planB.id,expected:planSnapshot(planB),completed:true}),kind('NotFound'));
  await assert.rejects(()=>db.query('delete from daily_plan_items where id=$1',[p.id]),e=>e.code==='42501');
  for(const field of ['updated_at','created_at','user_id','activity_id'])await assert.rejects(()=>db.exec('update daily_plan_items set '+field+'='+field),e=>e.code==='42501');
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
  await assert.rejects(()=>db.query('select * from daily_plan_items'),e=>e.code==='42501');
  await user();
});
test('not found is safe; malformed dates, ownership and audit fields never enter public commands',async()=>{
  await assert.rejects(()=>repo.setCompleted({id:randomUUID(),expected:{plannedDate:'2026-10-22',completedAt:null,updatedAt:'2026-10-22T10:00:00.123456Z'},completed:true}),kind('NotFound'));
  for(const extra of [{user_id:B},{completed_at:'2026-10-22T00:00:00Z'},{updated_at:'x'},{plannedDate:'2026-02-30'},{id:'bad'}])await assert.rejects(()=>repo.create({id:randomUUID(),activityId:randomUUID(),plannedDate:'2026-10-22',...extra}),kind('Validation'));
  assert(!('delete' in repo));assert(!('rpc' in client && Object.keys(repo).includes('rpc')));
});
