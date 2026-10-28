import pg from 'pg';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

// No URL/host override. Only the local-cluster runner supplies port/data-directory.
const port=Number(process.env.ROTINA_PG_PORT);
const data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data)throw new Error('Run npm run test:pg:local; external databases are not accepted.');
const cacheRoot=normalize(resolve('node_modules/.cache/rotina-pg-concurrency')).toLowerCase();
if(!normalize(resolve(data)).toLowerCase().startsWith(cacheRoot+'\\') &&
   !normalize(resolve(data)).toLowerCase().startsWith(cacheRoot+'/')){
 throw new Error('Only disposable cluster directories inside the ignored test cache are accepted.');
}
const A='00000000-0000-4000-8000-000000000001';
const area='00000000-0000-4000-8000-000000000011';
const installer='progress_local_installer';
// The cluster itself is disposable and verified before DDL; no database cloning.
const database='postgres';
let admin;
const clients=new Set();
async function connect(db=database){
 const c=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:db,
  connectionTimeoutMillis:5000,application_name:'rotina-local-concurrency'});
 await c.connect();clients.add(c);c.pid=(await c.query('select pg_backend_pid() pid')).rows[0].pid;
 await c.query("set statement_timeout='12s';set lock_timeout='10s'");return c;
}
async function close(c){if(c&&clients.has(c)){clients.delete(c);await c.end();}}
async function session(){const c=await connect();await c.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await c.query('set role authenticated');return c;}
async function withSessions(run){const s1=await session(),s2=await session();assert.notEqual(s1.pid,s2.pid);
 try{return await run(s1,s2);}finally{for(const c of [s1,s2]){try{await c.query('rollback');}finally{await close(c);}}}}
async function waitBlocked(pid,blocker){
 const until=Date.now()+6000;
 while(Date.now()<until){
  const r=(await admin.query('select pg_blocking_pids($1) blockers',[pid])).rows[0];
  if(r.blockers.includes(blocker))return;
  await new Promise(done=>setTimeout(done,15));
 }
 throw new Error('Expected database lock overlap was not observed.');
}
const result=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
const first=r=>r.rows[0];
const goal=()=>({id:randomUUID(),metric:'count',unit:'execution',minimum_target:1,ideal_target:3,period:'day',starts_on:'2020-01-01'});
function clean(g){return Object.fromEntries(Object.entries(g).filter(([k])=>!['user_id','activity_id','created_at','updated_at'].includes(k)));}
async function save(c,f,goals=f.goals,extra={}){
 return first(await c.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) aggregate',[
  JSON.stringify({id:f.activity.id,name:f.activity.name,type:f.activity.type,area_id:area,...extra}),
  JSON.stringify({goals:goals.map(clean)}),f.activity.revision])).aggregate;
}
async function fixture(){const c=await session();try{
 const f=first(await c.query('select save_activity_aggregate($1::jsonb,$2::jsonb,null) aggregate',[
  JSON.stringify({name:'Concurrent technical fixture',type:'variableActivity',area_id:area}),
  JSON.stringify({goals:[goal()]})])).aggregate;
 return f;
}finally{await close(c);}}
async function args(f,attempt=randomUUID()){
 const c=await session();try{const ctx=first(await c.query('select * from get_progress_context()'));
 return [attempt,f.activity.id,f.activity.revision,ctx.today,ctx.temporal_revision];
 }finally{await close(c);}}
const record=(c,a)=>c.query('select * from record_activity_progress($1,$2,$3,$4,$5)',a);
const voidLog=(c,id,attempt=randomUUID())=>c.query('select * from void_activity_progress($1,$2)',[attempt,id]);
async function count(table,f){return Number(first(await admin.query(`select count(*) n from public.${table} where activity_id=$1`,[f.activity.id])).n);}

before(async()=>{
 console.log('Preparing isolated PostgreSQL fixture.');
 const root=await connect('postgres');
 const actual=first(await root.query("select current_setting('data_directory') dir,current_setting('server_version_num') version,inet_server_addr() host"));
 const canonical=path=>normalize(resolve(path)).toLowerCase();
 assert.equal(canonical(await realpath(actual.dir)),canonical(await realpath(data)));
 assert.equal(actual.host,'127.0.0.1');assert.equal(Math.floor(Number(actual.version)/10000),17);
 await close(root);
 console.log('Loopback, data directory and PostgreSQL 17 verified.');
 admin=await connect();
 await admin.query(`create role authenticated nologin;create role anon nologin;create role authenticator nologin;
 create role managed_auth_owner nologin;
 create role ${installer} nologin nosuperuser nobypassrls noinherit createrole;
 grant create on database ${database} to ${installer};alter schema public owner to ${installer};
 create schema auth authorization managed_auth_owner;
 create table auth.users(id uuid primary key);alter table auth.users owner to managed_auth_owner;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 alter function auth.uid() owner to managed_auth_owner;revoke all on function auth.uid() from public;
 grant usage on schema auth to ${installer} with grant option;
 grant execute on function auth.uid() to ${installer} with grant option;
   grant references,trigger on auth.users to ${installer};
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 insert into auth.users values('${A}');`);
 const deploy=await connect();await deploy.query(`set role ${installer}`);
 assert.deepEqual(first(await deploy.query('select rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname=current_user')),
  {rolsuper:false,rolbypassrls:false,rolcreaterole:true});
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await deploy.query(await readFile('supabase/migrations/'+f,'utf8'));
 const candidate=await readFile('supabase/candidates/20261021000100_progress_history_candidate.sql','utf8');
 console.log('Candidate SHA-256: '+createHash('sha256').update(candidate).digest('hex'));
 await deploy.query(candidate);
 console.log('Six migrations and candidate installed by a non-superuser.');
 await close(deploy);
 const c=await session();await c.query('insert into areas(id,user_id,name) values($1,$2,$3)',[area,A,'Local concurrent fixtures']);
 await c.query("select * from set_progress_timezone('UTC',null)");await close(c);
});
after(async()=>{for(const c of [...clients])await close(c);});

test('1: same attempt/content overlaps: one log and identical receipt',async()=>{
 const f=await fixture(),a=await args(f);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');const r1=first(await record(s1,a));
  const pending=result(record(s2,a));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r2=await pending;assert(r2.ok);assert.deepEqual(first(r2.value),r1);
 });assert.equal(await count('activity_progress_logs',f),1);assert.equal(await count('progress_attempts',f),1);
});
test('2: same attempt/different content overlaps: winner plus PT409',async()=>{
 const f=await fixture(),a=await args(f),different=[...a];different[2]++;
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');await record(s1,a);
  const pending=result(record(s2,different));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r=await pending;assert(!r.ok);assert.equal(r.error.code,'PT409');assert.equal(r.error.message,'attempt-mismatch');
 });assert.equal(await count('activity_progress_logs',f),1);
});
test('3: distinct attempts overlap: two legitimate executions without revision mutation',async()=>{
 const f=await fixture(),a=await args(f),b=[...a];b[0]=randomUUID();
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');const r1=first(await record(s1,a));
  const pending=result(record(s2,b));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r=await pending;assert(r.ok);assert.notEqual(first(r.value).o_log_id,r1.o_log_id);
 });assert.equal(await count('activity_progress_logs',f),2);
 assert.equal(first(await admin.query('select revision from activities where id=$1',[f.activity.id])).revision,f.activity.revision);
});
test('4a: timezone wins: pending record rejects stale temporal context without writing',async()=>{
 const f=await fixture(),a=await args(f);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');await s1.query("select * from set_progress_timezone('Pacific/Kiritimati',$1)",[a[4]]);
  const pending=result(record(s2,a));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r=await pending;assert(!r.ok);assert.equal(r.error.code,'PT409');assert.equal(r.error.message,'temporal-context-changed');
 });assert.equal(await count('activity_progress_logs',f),0);
});
test('4b: record wins: concurrent timezone change cannot reclassify its day',async()=>{
 const f=await fixture(),a=await args(f);let original;
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');original=first(await record(s1,a));
  const pending=result(s2.query("select * from set_progress_timezone('UTC',$1)",[a[4]]));
  await waitBlocked(s2.pid,s1.pid);await s1.query('commit');assert((await pending).ok);
 });const c=await session();try{assert.deepEqual(first(await record(c,a)),original);}finally{await close(c);}
});
test('5a: record wins: save changes target after commit, preserving associated version',async()=>{
 const f=await fixture(),a=await args(f);let log;
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');log=first(await record(s1,a));
  const pending=result(save(s2,f,[{...f.goals[0],ideal_target:5}],{name:'Edited while recording'}));
  await waitBlocked(s2.pid,s1.pid);await s1.query('commit');assert((await pending).ok);
 });const v=first(await admin.query(`select v.ideal_target from progress_log_goal_versions s
 join activity_goal_versions v on v.user_id=s.user_id and v.activity_id=s.activity_id and v.id=s.goal_version_id
 where s.progress_log_id=$1`,[log.o_log_id]));assert.equal(Number(v.ideal_target),3);
 assert.equal(await count('activity_goal_versions',f),2);
});
test('5b: save wins: pending record receives activity-changed and no stale measurement',async()=>{
 const f=await fixture(),a=await args(f);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');await save(s1,f,[{...f.goals[0],enabled:false}]);
  const pending=result(record(s2,a));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r=await pending;assert(!r.ok);assert.equal(r.error.code,'PT409');assert.equal(r.error.message,'activity-changed');
 });assert.equal(await count('activity_progress_logs',f),0);
});
test('6: two void attempts overlap: one effective void, two stable receipts',async()=>{
 const f=await fixture(),a=await args(f),c=await session();const log=first(await record(c,a));await close(c);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');const r1=first(await voidLog(s1,log.o_log_id));
  const pending=result(voidLog(s2,log.o_log_id));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r=await pending;assert(r.ok);assert.equal(first(r.value).o_void_id,r1.o_void_id);
 });assert.equal(await count('activity_progress_voids',f),1);assert.equal(await count('progress_attempts',f),3);
});
test('7a: removal wins over record: tombstone committed, stale record denied',async()=>{
 const f=await fixture(),a=await args(f);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');await save(s1,f,[]);
  const pending=result(record(s2,a));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');
  const r=await pending;assert(!r.ok);assert.equal(r.error.code,'PT409');
 });assert.equal(await count('activity_progress_logs',f),0);
 assert.equal(first(await admin.query("select transition from activity_goal_versions where activity_id=$1 order by version_no desc limit 1",[f.activity.id])).transition,'removed');
});
test('7b: record wins over Goal removal: log, original version and tombstone survive',async()=>{
 const f=await fixture(),a=await args(f);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');await record(s1,a);
  const pending=result(save(s2,f,[]));await waitBlocked(s2.pid,s1.pid);await s1.query('commit');assert((await pending).ok);
 });assert.equal(await count('activity_progress_logs',f),1);assert.equal(await count('activity_goal_versions',f),2);
 assert.equal(await count('progress_log_goal_versions',f),1);
});
test('8: queued records, timezone and save terminate with supported lock order',async()=>{
 const f=await fixture(),a=await args(f);const s1=await session(),s2=await session(),s3=await session(),s4=await session();
 try{
  await s1.query('begin');await record(s1,a);
  const r2=result(record(s2,[randomUUID(),...a.slice(1)]));await waitBlocked(s2.pid,s1.pid);
  const r3=result(s3.query("select * from set_progress_timezone('UTC',$1)",[a[4]]));await waitBlocked(s3.pid,s1.pid);
  const r4=result(save(s4,f,[{...f.goals[0],minimum_target:2}]));await waitBlocked(s4.pid,s1.pid);
  await s1.query('commit');const all=await Promise.all([r2,r3,r4]);
  assert(all.every(r=>r.ok||r.error.code==='PT409'));
  assert(all.every(r=>r.ok||!['40P01','40001'].includes(r.error.code)));
 }finally{for(const c of [s1,s2,s3,s4]){await c.query('rollback');await close(c);}}
});
test('9a: a real induced lock-order inversion propagates 40P01, never PT409',async()=>{
 const f=await fixture(),a=await args(f);
 await withSessions(async(s1,s2)=>{
  await s1.query('begin');await s2.query('begin');
  // Deliberate unsupported inversion: caller locks Activity BEFORE temporal context.
  await s1.query('select id from activities where id=$1 for update',[f.activity.id]);
  const r2=result(record(s2,a));await waitBlocked(s2.pid,s1.pid);
  const r1=result(s1.query("select * from set_progress_timezone('UTC',$1)",[a[4]]));
  const outcome=await Promise.race([r1.then(r=>({r,c:s1})),r2.then(r=>({r,c:s2}))]);
  // The surviving backend's success may reach Node before the victim's error.
  // Release whichever completes first, then inspect both SQLSTATEs.
  await outcome.c.query('rollback');
  const both=await Promise.all([r1,r2]);assert.equal(both.filter(r=>!r.ok&&r.error.code==='40P01').length,1);
  assert(!both.some(r=>!r.ok&&r.error.code==='PT409'));
 });
});
test('9b: real repeatable-read write conflict retains 40001 (RPC rejects this isolation)',async()=>{
 await withSessions(async(s1,s2)=>{
  await s1.query('begin isolation level repeatable read');await s2.query('begin isolation level repeatable read');
  await s1.query('select name from areas where id=$1',[area]);await s2.query('select name from areas where id=$1',[area]);
  await s1.query("update areas set name='Serialization probe' where id=$1",[area]);await s1.query('commit');
  await assert.rejects(()=>s2.query("update areas set name='Old snapshot probe' where id=$1",[area]),e=>e.code==='40001');
 });
 const sql=await readFile('supabase/candidates/20261021000100_progress_history_candidate.sql','utf8');
 assert(!/exception\s+when\s+(?:others|serialization_failure|deadlock_detected)/i.test(sql));
});
test('10: committed result discarded with connection: fresh session replays original',async()=>{
 const f=await fixture(),a=await args(f);let c=await session();let id;
 try{await c.query('begin');id=first(await record(c,a)).o_log_id;await c.query('commit');}finally{await close(c);}
 // Transport caller deliberately discards the result; no retry key regeneration.
 c=await session();try{const r=first(await record(c,a));assert.equal(r.o_log_id,id);}finally{await close(c);}
 assert.equal(await count('activity_progress_logs',f),1);
});

test('audit 11: definer owners, paths, grants and table ownership stay restricted',async()=>{
 const functions=(await admin.query(`select p.prosecdef,p.proconfig,r.rolname,r.rolsuper,r.rolbypassrls,
 has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') browser,n.nspname
 from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace
 where r.rolname='routine_progress_executor'`)).rows;
 assert.equal(functions.length,8);
 for(const f of functions){assert(f.prosecdef);assert(!f.rolsuper&&!f.rolbypassrls&&!f.anon);
  assert(f.proconfig.includes('row_security=on'));assert(f.proconfig.includes('search_path=pg_catalog, pg_temp'));
  if(f.nspname==='routine_private')assert.equal(f.browser,false);
 }
 assert.equal(first(await admin.query("select count(*)::int n from pg_class where relowner='routine_progress_executor'::regrole and relkind='r'")).n,0);
});

async function internalTransaction(run){
 await admin.query('begin');
 try{
  await admin.query("select set_config('request.jwt.claim.sub',$1,true)",[A]);
  await admin.query('set local role routine_progress_executor');await run();await admin.query('commit');
 }catch(error){await admin.query('rollback');throw error;}
}
test('audit 12: log cannot forge an effect against a void receipt',async()=>{
 const f=await fixture(),a=await args(f),c=await session();const log=first(await record(c,a));const attempt=randomUUID();
 await voidLog(c,log.o_log_id,attempt);await close(c);
 await assert.rejects(()=>internalTransaction(()=>admin.query(`insert into activity_progress_logs(
 user_id,activity_id,attempt_id,performed_on,timezone_at_recording,temporal_revision,accepted_at,
 activity_name_at_recording,activity_type_at_recording,activity_revision)
 select user_id,activity_id,$1,performed_on,timezone_at_recording,temporal_revision,accepted_at,
 activity_name_at_recording,activity_type_at_recording,activity_revision from activity_progress_logs where id=$2`,[attempt,log.o_log_id])),e=>e.code==='23514');
 assert.equal(await count('activity_progress_logs',f),1);
});
test('audit 13: late association cannot give retroactive credit to a new Goal',async()=>{
 const f=await fixture(),a=await args(f),c=await session();const log=first(await record(c,a));const g=goal();
 await save(c,f,[...f.goals,g]);await close(c);
 const version=first(await admin.query('select id from activity_goal_versions where source_goal_id=$1',[g.id]));
 await assert.rejects(()=>internalTransaction(()=>admin.query(`insert into progress_log_goal_versions(user_id,activity_id,progress_log_id,goal_version_id)
 values($1,$2,$3,$4)`,[A,f.activity.id,log.o_log_id,version.id])),e=>e.code==='23514');
 assert.equal(await count('progress_log_goal_versions',f),1);
});
test('audit 14: void must be backed by its winning void command, never a record receipt',async()=>{
 const f=await fixture(),a=await args(f),c=await session();const log=first(await record(c,a));await close(c);
 await assert.rejects(()=>internalTransaction(()=>admin.query(`insert into activity_progress_voids(user_id,activity_id,progress_log_id,winning_attempt_id,voided_at)
 values($1,$2,$3,$4,clock_timestamp())`,[A,f.activity.id,log.o_log_id,a[0]])),e=>e.code==='23514');
 assert.equal(await count('activity_progress_voids',f),0);
});
test('audit 15: early constraints fail safely; complete RPC validates when constraints are forced afterwards',async()=>{
 const f=await fixture(),a=await args(f),c=await session();
 try{
  await c.query('begin;set constraints all immediate');
  await assert.rejects(()=>record(c,a),e=>e.code==='23503'||e.code==='P0002');await c.query('rollback');
  assert.equal(await count('activity_progress_logs',f),0);
  await c.query('begin');await record(c,a);await c.query('set constraints all immediate');await c.query('commit');
 }finally{await c.query('rollback');await close(c);}
 assert.equal(await count('activity_progress_logs',f),1);
});
test('audit 16: maximum version_no rejects next change atomically without wrapping',async()=>{
 const f=await fixture();
 await admin.query(`insert into activity_goal_versions(user_id,activity_id,source_goal_id,version_no,activity_revision,transition,
 effective_at,enabled,metric,unit,minimum_target,ideal_target,period,starts_on)
 select user_id,activity_id,source_goal_id,9223372036854775807,activity_revision,'upsert',clock_timestamp(),
 enabled,metric,unit,minimum_target,ideal_target,period,starts_on from activity_goal_versions where activity_id=$1`,[f.activity.id]);
 const c=await session();try{await assert.rejects(()=>save(c,f,[{...f.goals[0],enabled:false}]),e=>e.code==='22003');}finally{await close(c);}
 assert.equal(first(await admin.query('select revision from activities where id=$1',[f.activity.id])).revision,f.activity.revision);
});
test('audit 17: RESTRICT blocks account removal and retains history',async()=>{
 const f=await fixture(),a=await args(f),c=await session();await record(c,a);await close(c);
 await assert.rejects(()=>admin.query('delete from auth.users where id=$1',[A]),e=>e.code==='23503');
 assert.equal(await count('activity_progress_logs',f),1);
 assert.equal(first(await admin.query('select count(*)::int n from auth.users where id=$1',[A])).n,1);
});
test('audit 18: DST conversion, session timezone and later preferences do not rewrite stored day',async()=>{
 const r=first(await admin.query(`select
 (timestamptz '2026-03-08 06:59+00' at time zone 'America/New_York')::text before_gap,
 (timestamptz '2026-03-08 07:00+00' at time zone 'America/New_York')::text after_gap,
 (timestamptz '2026-11-01 05:30+00' at time zone 'America/New_York')::text repeat_one,
 (timestamptz '2026-11-01 06:30+00' at time zone 'America/New_York')::text repeat_two`));
 assert(r.before_gap.endsWith('01:59:00'));assert(r.after_gap.endsWith('03:00:00'));assert.equal(r.repeat_one,r.repeat_two);
 const f=await fixture(),a=await args(f),c=await session();const original=first(await record(c,a));
 try{
  await c.query("set timezone='Pacific/Honolulu'");await c.query("select * from set_progress_timezone('Pacific/Kiritimati',$1)",[a[4]]);
  assert.deepEqual(first(await record(c,a)),original);
 }finally{await close(c);}
});
test('audit 19: temporary tables/functions cannot shadow qualified definer objects',async()=>{
 const f=await fixture(),a=await args(f),c=await session();
 try{
  await c.query(`create temp table activities(id uuid);create temp table progress_attempts(attempt_id uuid);
   create function pg_temp.gen_random_uuid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000099'::uuid$$;
   set search_path=pg_temp,public;`);
  const r=first(await record(c,a));assert.notEqual(r.o_log_id,'00000000-0000-4000-8000-000000000099');
  assert.equal(first(await c.query('select count(*)::int n from pg_temp.progress_attempts')).n,0);
 }finally{await close(c);}
 assert.equal(await count('activity_progress_logs',f),1);
});
test('audit 20: historical eligibility does not depend on wall-clock ordering',async()=>{
 const f=await fixture();
 // Fixture simulates a clock moving backwards after a version was captured;
 // production RPCs expose no clock override or historical DML.
 await admin.query(`insert into activity_goal_versions(user_id,activity_id,source_goal_id,version_no,activity_revision,
 transition,effective_at,enabled,metric,unit,minimum_target,ideal_target,period,starts_on)
 select user_id,activity_id,source_goal_id,version_no+1,activity_revision,'upsert',clock_timestamp()+interval '1 day',
 enabled,metric,unit,minimum_target,ideal_target,period,starts_on from activity_goal_versions where activity_id=$1`,[f.activity.id]);
 const a=await args(f),c=await session();try{await record(c,a);}finally{await close(c);}
 assert.equal(await count('activity_progress_logs',f),1);
});
test('audit 21: Activity and temporal revision limits reject changes atomically',async()=>{
 const f=await fixture();
 // Administrator-only boundary fixtures in this disposable cluster; no production bypass.
 await admin.query('begin');await admin.query("select set_config('request.jwt.claim.sub',$1,true)",[A]);
 await admin.query('alter table activities disable trigger a_stamp');
 await admin.query('update activities set revision=2147483647 where id=$1',[f.activity.id]);
 await admin.query('set constraints all immediate;alter table activities enable trigger a_stamp;commit');
 const c=await session();
 try{
  await assert.rejects(()=>save(c,{...f,activity:{...f.activity,revision:2147483647}}),e=>e.code==='22003');
  await admin.query('begin;alter table user_temporal_preferences disable trigger progress_timezone_stamp');
  await admin.query('update user_temporal_preferences set revision=9223372036854775807 where user_id=$1',[A]);
  await admin.query('alter table user_temporal_preferences enable trigger progress_timezone_stamp;commit');
  await assert.rejects(()=>c.query("select * from set_progress_timezone('UTC',9223372036854775807)"),e=>e.code==='22003');
  assert.equal(first(await c.query('select revision::text r from user_temporal_preferences')).r,'9223372036854775807');
 }finally{await admin.query('rollback');await close(c);}
});
