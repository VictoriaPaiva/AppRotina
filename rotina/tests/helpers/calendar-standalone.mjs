import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {authFixture,A,B} from './account-fixtures.mjs';
import {pgliteClient} from './pglite-client.mjs';
const {load}=createRequire(import.meta.url)('./load-typescript.cjs');
const {createPlanRepository}=load('lib/planning/repository.ts');
const {planSnapshot}=load('lib/planning/contracts.ts');
export function standaloneRepository(db,owner=A){
  const transport={async query(sql,params){
    const result=await db.query(sql,params);
    for(const row of result.rows)if(row.id&&row.updated_at&&row.planned_date){
      const v=(await db.query('select planned_date::text p,updated_at::text u,created_at::text c,completed_at::text d from daily_plan_items where id=$1',[row.id])).rows[0];
      const iso=s=>s.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
      row.planned_date=v.p;row.updated_at=iso(v.u);row.created_at=iso(v.c);row.completed_at=v.d===null?null:iso(v.d);
    }return result;
  }};
  return createPlanRepository(pgliteClient(transport,['daily_plan_items']),owner);
}
export async function calendarStandaloneRegression(db){
  const migration='20261118000300_calendar_standalone_plans.sql';
  await db.exec(authFixture);await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const user=async(id=A)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  await user();
  const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
  const day=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const area=randomUUID(),activity=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Calendar area')",[area,A]);
  await db.query("select save_activity_aggregate($1,'{}',null)",[JSON.stringify({id:activity,area_id:area,name:'Original',type:'variableActivity'})]);
  const legacy=(await db.query('insert into daily_plan_items(user_id,activity_id,planned_date) values($1,$2,$3) returning to_jsonb(daily_plan_items) v',[A,activity,day(-1)])).rows[0].v;
  const historical=(await db.query('update daily_plan_items set completed_at=clock_timestamp() where id=$1 returning to_jsonb(daily_plan_items) v',[legacy.id])).rows[0].v;
  await db.exec('reset role');await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));await user();
  const after=(await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[legacy.id])).rows[0].v;
  const {origin,standalone_title,standalone_description,standalone_importance,...retained}=after;
  assert.equal(origin,'activity');assert.deepEqual([standalone_title,standalone_description,standalone_importance],[null,null,null]);assert.deepEqual(retained,historical,'upgrade never rewrites historical snapshots or timestamps');
  const repo=standaloneRepository(db);
  const input=(extra={})=>({id:randomUUID(),title:'Avulso',plannedDate:today,plannedTime:null,durationMinutes:null,importance:'important',description:null,...extra});
  const untimed=await repo.createStandalone(input()),timed=await repo.createStandalone(input({title:'Dentista pontual',plannedTime:'09:00',durationMinutes:30,importance:'required',description:'Levar documento'}));
  assert.equal(timed.activityId,null);assert.equal(timed.origin,'standalone');assert.equal(timed.plannedDurationMinutes,30);assert.equal(timed.standalone.description,'Levar documento');
  const timedDone=await repo.setCompleted({id:timed.id,expected:planSnapshot(timed),completed:true});
  await repo.setCompleted({id:timed.id,expected:planSnapshot(timedDone),completed:false});
  assert.equal((await db.query('select count(*)::int n from activities')).rows[0].n,1,'standalone never creates a master Activity');
  const regular=await repo.create({id:randomUUID(),activityId:activity,plannedDate:today,plannedTime:'08:00'});
  assert.deepEqual((await repo.listByDate(today)).map(p=>p.id),[regular.id,timed.id,untimed.id],'shared timed/untimed chronology');
  const current=(await repo.listByDate(today)).find(p=>p.id===untimed.id);
  const completed=await repo.setCompleted({id:untimed.id,expected:planSnapshot(current),completed:true});assert(completed.completedAt);
  assert((await repo.listByDate(today)).some(p=>p.id===completed.id));assert((await repo.listCompletedOn(today)).some(p=>p.id===completed.id));
  await assert.rejects(()=>repo.setCompleted({id:untimed.id,expected:planSnapshot(untimed),completed:false}),e=>e.kind==='Conflict');
  const reopened=await repo.setCompleted({id:completed.id,expected:planSnapshot(completed),completed:false});assert.equal(reopened.completedAt,null);
  const past=await repo.createStandalone(input({plannedDate:day(-2)}));assert((await repo.listPending(today)).some(p=>p.id===past.id));
  const stable=(await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[timed.id])).rows[0].v;
  const revision=(await db.query('select revision from activities where id=$1',[activity])).rows[0].revision;
  await db.query("select save_activity_v05($1,'{}',$2,null,'{}'::uuid[],'[]')",[JSON.stringify({id:activity,area_id:area,name:'Renamed original',type:'variableActivity'}),revision]);
  assert.deepEqual((await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[timed.id])).rows[0].v,stable,'Activity sync never touches standalone');
  await assert.rejects(()=>db.query('insert into daily_plan_items(user_id,activity_id,planned_date) values($1,null,$2)',[A,today]),e=>['23503','23514'].includes(e.code));
  await assert.rejects(()=>db.query("insert into daily_plan_items(user_id,origin,standalone_title,standalone_importance,planned_date) values($1,'standalone','Forged','important',$2)",[A,today]),e=>e.code==='42501');
  await assert.rejects(()=>repo.createStandalone({...input(),user_id:B}),e=>e.kind==='Validation');
  for(const extra of [{title:''},{durationMinutes:0},{durationMinutes:1.5},{plannedTime:'24:00'},{importance:'urgent'},{description:'x'.repeat(2001)}])await assert.rejects(()=>repo.createStandalone(input(extra)),e=>e.kind==='Validation');
  await assert.rejects(()=>db.query('select create_standalone_plan($1)',[JSON.stringify({...input(),user_id:B})]),e=>e.code==='23514');
  await user(B);const b=standaloneRepository(db,B);
  assert.deepEqual(await b.listByDate(today),[]);
  await assert.rejects(()=>b.setCompleted({id:timed.id,expected:planSnapshot(timed),completed:true}),e=>e.kind==='NotFound');
  assert.equal((await db.query('update daily_plan_items set completed_at=now() where id=$1 returning id',[timed.id])).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select create_standalone_plan($1)',[JSON.stringify(input())]),e=>e.code==='42501');
  await user();await db.exec('reset role');
  for(const patch of ["origin='activity'","activity_id=gen_random_uuid()","checklist_snapshot='[]'::jsonb","standalone_title=null"])
    await assert.rejects(()=>db.query('update daily_plan_items set '+patch+' where id=$1',[timed.id]),e=>e.code==='23514');
  await assert.rejects(()=>db.query('delete from activities where id=$1',[activity]),e=>['23503','23001'].includes(e.code)&&e.message.includes('daily_plan_items_owner_activity_fkey'));
  await user();
  return {repo,input,day,today};
}
