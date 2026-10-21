import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const area=randomUUID();
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function query(sql,args=[]){return (await db.query(sql,args)).rows;}
async function save(activity,goals=[],revision=null,extra={}){
 return (await query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) result',[
 JSON.stringify({name:'Progress fixture',type:'variableActivity',area_id:area,...activity}),
 JSON.stringify({goals:goals.map(g=>Object.fromEntries(Object.entries(g).filter(([key])=>!['user_id','activity_id','created_at','updated_at'].includes(key)))),...extra}),revision]))[0].result;
}
const goal=(id=randomUUID())=>({id,metric:'count',unit:'execution',minimum_target:1,ideal_target:3,period:'day',starts_on:'2020-01-01'});
async function fixture(){return save({},[goal()]);}
async function versions(id){return query('select * from activity_goal_versions where activity_id=$1 order by source_goal_id,version_no',[id]);}
async function record(f,attempt=randomUUID()){
 const pref=(await query("select revision,(clock_timestamp() at time zone timezone)::date::text as civil_day from user_temporal_preferences"))[0];
 return (await query('select * from public.record_activity_progress($1,$2,$3,$4,$5)',[attempt,f.activity.id,f.activity.revision,pref.civil_day,pref.revision]))[0];
}
before(async()=>{
 await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 insert into auth.users values('${A}'),('${B}');`);
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await user();await query('insert into areas(id,user_id,name) values($1,$2,$3)',[area,A,'Technical area']);
 // Existing Goal must be captured by the migration baseline.
 await fixture();
 await db.exec('reset role');
 await db.exec(await readFile('supabase/candidates/20261021000100_progress_history_candidate.sql','utf8'));
 await user();await query("select * from set_progress_timezone('UTC',null)");
});
after(async()=>{await db.exec('rollback');await db.close();});

test('candidate compiles after six migrations; baseline and invoker/PT409 remain',async()=>{
 assert((await query("select * from activity_goal_versions where transition='baseline'")).length>0);
 assert.equal((await query("select prosecdef from pg_proc where oid='public.save_activity_aggregate(jsonb,jsonb,integer)'::regprocedure"))[0].prosecdef,false);
 const f=await fixture();await assert.rejects(()=>save({id:f.activity.id},f.goals,0),e=>e.code==='PT409');
});
test('save alteration, disable, removal and type switch retain versions',async()=>{
 let f=await fixture();const id=f.activity.id;
 f=await save({id},[{...f.goals[0],minimum_target:2}],f.activity.revision);
 f=await save({id},[{...f.goals[0],enabled:false}],f.activity.revision);
 assert.equal((await versions(id)).length,3);
 f=await save({id},[],f.activity.revision);
 assert.equal((await versions(id)).at(-1).transition,'removed');
 f=await save({id},[goal()],f.activity.revision);
 await save({id,type:'reminder'},[],f.activity.revision,{reminder_config:{reference_date:'2026-10-21'}});
 assert.equal((await query("select count(*)::int n from activity_goal_versions where activity_id=$1 and transition='removed'",[id]))[0].n,2);
});
test('deferred capture skips transient upserts and stores final revision',async()=>{
 const f=await fixture();await db.exec('begin');
 await query('update goals set minimum_target=2 where id=$1',[f.goals[0].id]);
 await query('update goals set minimum_target=1 where id=$1',[f.goals[0].id]);
 await db.exec('commit');assert.equal((await versions(f.activity.id)).length,1);
 await query('update goals set enabled=false where id=$1',[f.goals[0].id]);
 const latest=(await versions(f.activity.id)).at(-1);
 assert.equal(latest.enabled,false);
 assert.equal(latest.activity_revision,(await query('select revision from activities where id=$1',[f.activity.id]))[0].revision);
});
test('invalid aggregate and stale revision roll back history and live rows',async()=>{
 const f=await save({type:'checklistGoal'},[goal()]);const prior=await versions(f.activity.id);
 await assert.rejects(()=>save({id:f.activity.id,type:'checklistGoal'},[],f.activity.revision),e=>e.code==='23514');
 assert.deepEqual(await versions(f.activity.id),prior);
 assert.equal((await query('select count(*)::int n from goals where activity_id=$1',[f.activity.id]))[0].n,1);
});
test('record replay, distinct attempts and void replay preserve one original event',async()=>{
 const f=await fixture(),attempt=randomUUID();const first=await record(f,attempt);
 assert.deepEqual(await record(f,attempt),first);
 const second=await record(f);assert.notEqual(second.o_log_id,first.o_log_id);
 await assert.rejects(()=>record({...f,activity:{...f.activity,revision:f.activity.revision+1}},attempt),e=>e.code==='PT409');
 const voidAttempt=randomUUID();const voided=(await query('select * from void_activity_progress($1,$2)',[voidAttempt,first.o_log_id]))[0];
 assert.deepEqual((await query('select * from void_activity_progress($1,$2)',[voidAttempt,first.o_log_id]))[0],voided);
 const again=(await query('select * from void_activity_progress($1,$2)',[randomUUID(),first.o_log_id]))[0];
 assert.equal(again.o_void_id,voided.o_void_id);assert.equal((await record(f,attempt)).o_voided,true);
});
test('replay survives edit and timezone change; old context for new attempt rejected',async()=>{
 const f=await fixture(),attempt=randomUUID();const first=await record(f,attempt);
 await save({id:f.activity.id,type:'reminder'},[],f.activity.revision,{reminder_config:{reference_date:'2026-10-21'}});
 await query("select * from set_progress_timezone('Europe/Lisbon',1)");
 // Original argument payload is required, not the newly read preference.
 const old=(await query('select * from progress_attempts where attempt_id=$1',[attempt]))[0];
 const replay=(await query('select * from record_activity_progress($1,$2,$3,$4,$5)',[attempt,f.activity.id,f.activity.revision,old.expected_date,old.expected_temporal_revision]))[0];
 assert.equal(replay.o_log_id,first.o_log_id);
 const g=await fixture();await assert.rejects(()=>query('select * from record_activity_progress($1,$2,$3,$4,$5)',[randomUUID(),g.activity.id,g.activity.revision,'2001-01-01',2]),e=>e.code==='PT409');
 await query("select * from set_progress_timezone('UTC',2)");
});
test('A/B/anon, private helpers and historical DML denied',async()=>{
 const f=await fixture();const log=await record(f);
 await user(B);assert.equal((await versions(f.activity.id)).length,0);
 await assert.rejects(()=>query('select * from void_activity_progress($1,$2)',[randomUUID(),log.o_log_id]),e=>e.code==='PT404');
 await user();
 for(const table of ['progress_attempts','activity_progress_logs','activity_goal_versions','progress_log_goal_versions','activity_progress_voids']){
 for(const sql of [`delete from ${table}`,`update ${table} set user_id=user_id`,`insert into ${table} default values`])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
 }
 await assert.rejects(()=>query('select routine_private.finalize_goal_versions($1,$2)',[A,f.activity.id]),e=>e.code==='42501');
 await db.exec('reset role;set role anon');
 await assert.rejects(()=>db.exec('select * from activity_goal_versions'),e=>e.code==='42501');
 await assert.rejects(()=>query('select * from void_activity_progress($1,$2)',[randomUUID(),log.o_log_id]),e=>e.code==='42501');
 await user();
});
test('Goal UUID removal is terminal; restoring removed origin is rejected atomically',async()=>{
 let f=await fixture();const g=f.goals[0];f=await save({id:f.activity.id},[],f.activity.revision);
 await assert.rejects(()=>save({id:f.activity.id},[g],f.activity.revision),e=>e.code==='23514');
 assert.equal((await query('select count(*)::int n from goals where id=$1',[g.id]))[0].n,0);
});
test('direct DELETE archives tombstone; committed snapshot exists before removal',async()=>{
 const f=await fixture();const before=await versions(f.activity.id);
 assert.equal(before.length,1);
 await db.exec('begin');await query('delete from goals where id=$1',[f.goals[0].id]);
 assert.deepEqual(await versions(f.activity.id),before);
 await db.exec('commit');const after=await versions(f.activity.id);
 assert.equal(after.length,2);assert.equal(after[1].transition,'removed');
 assert.equal(after[0].minimum_target,before[0].minimum_target);
});
test('log and associations survive rename, Goal removal and incompatible relations removal',async()=>{
 let f=await fixture();const log=await record(f);
 const old=(await query('select * from activity_progress_logs where id=$1',[log.o_log_id]))[0];
 const links=await query('select * from progress_log_goal_versions where progress_log_id=$1',[log.o_log_id]);
 f=await save({id:f.activity.id,name:'Renamed'},[],f.activity.revision);
 await save({id:f.activity.id,type:'reminder'},[],f.activity.revision,{reminder_config:{reference_date:'2026-10-21'}});
 assert.deepEqual((await query('select * from activity_progress_logs where id=$1',[log.o_log_id]))[0],old);
 assert.deepEqual(await query('select * from progress_log_goal_versions where progress_log_id=$1',[log.o_log_id]),links);
 const v=(await query('select * from void_activity_progress($1,$2)',[randomUUID(),log.o_log_id]))[0];
 assert.deepEqual(v.o_performed_on,log.o_performed_on);
});
test('rollback after record discards receipt, log and associations atomically',async()=>{
 const f=await fixture(),id=randomUUID();await db.exec('begin');const r=await record(f,id);await db.exec('rollback');
 assert.equal((await query('select * from progress_attempts where attempt_id=$1',[id])).length,0);
 assert.equal((await query('select * from activity_progress_logs where id=$1',[r.o_log_id])).length,0);
 const replay=await record(f,id);assert.notEqual(replay.o_log_id,r.o_log_id);
});
test('failed final aggregate rolls back an earlier record in the same transaction',async()=>{
 const f=await save({type:'checklistGoal'},[goal()]);const id=randomUUID();await db.exec('begin');await record(f,id);
 await query('delete from goals where activity_id=$1',[f.activity.id]);
 await assert.rejects(()=>db.exec('commit'),e=>e.code==='23514');await db.exec('rollback');
 assert.equal((await query('select * from progress_attempts where attempt_id=$1',[id])).length,0);
 assert.equal((await query('select count(*)::int n from goals where activity_id=$1',[f.activity.id]))[0].n,1);
});
test('timezone CAS, absent preference, null session and function-owner privileges',async()=>{
 await user(B);assert.equal((await query('select * from get_progress_context()'))[0].configured,false);
 const p=(await query("select * from set_progress_timezone('UTC',null)"))[0];assert.equal(p.o_temporal_revision,1);
 await assert.rejects(()=>query("select * from set_progress_timezone('UTC',null)"),e=>e.code==='PT409');
 await assert.rejects(()=>query("select * from set_progress_timezone('GMT+3',1)"),e=>e.code==='22023');
 await user('');await assert.rejects(()=>query('select * from get_progress_context()'),e=>e.code==='42501');
 await user();const roles=(await query("select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='routine_progress_executor'"))[0];
 assert.deepEqual(roles,{rolcanlogin:false,rolsuper:false,rolbypassrls:false});
 assert.equal((await query("select has_table_privilege('routine_progress_executor','activity_progress_logs','UPDATE') allowed"))[0].allowed,false);
});
test('two simultaneous compatible Goals associate one event without duplicate log',async()=>{
 const f=await save({},[goal(),goal()]);const r=await record(f);
 assert.equal((await query('select * from progress_log_goal_versions where progress_log_id=$1',[r.o_log_id])).length,2);
 assert.equal((await query('select count(*)::int n from activity_progress_logs where id=$1',[r.o_log_id]))[0].n,1);
});
test('failure of historical capture rolls back the otherwise valid save',async()=>{
 const f=await fixture();const old=await versions(f.activity.id);
 await db.exec(`reset role;
 create function pg_temp.reject_version_test() returns trigger language plpgsql as $$begin raise exception 'Injected archive failure' using errcode='23514';end$$;
 create trigger reject_version_test before insert on public.activity_goal_versions for each row execute function pg_temp.reject_version_test();`);
 try {
  await user();
  await assert.rejects(()=>save({id:f.activity.id},[{...f.goals[0],enabled:false}],f.activity.revision),e=>e.code==='23514');
  assert.deepEqual(await versions(f.activity.id),old);
  assert.equal((await query('select enabled from goals where id=$1',[f.goals[0].id]))[0].enabled,true);
  assert.equal((await query('select revision from activities where id=$1',[f.activity.id]))[0].revision,f.activity.revision);
 } finally {
  await db.exec('reset role;drop trigger reject_version_test on public.activity_goal_versions;drop function pg_temp.reject_version_test();');await user();
 }
});
