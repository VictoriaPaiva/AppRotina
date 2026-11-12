import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {authFixture,A,B} from '../helpers/account-fixtures.mjs';
const port=Number(process.env.ROTINA_PG_PORT),data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data||!resolve(data).startsWith(resolve('node_modules/.cache/rotina-pg-concurrency')))throw Error('Use disposable localhost runner.');
const expected=p=>({updatedAt:p.updated_at,completedAt:p.completed_at,plannedDate:p.planned_date});

test('V0.5 PostgreSQL independent sessions: time, whole-day order and checklist CAS admit one winner and preserve frozen snapshots',async()=>{
  const clients=Array.from({length:3},()=>new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000}));
  const [admin,a,b]=clients;await Promise.all(clients.map(c=>c.connect()));
  try{
    const info=(await admin.query("select current_setting('data_directory') d,current_setting('listen_addresses') h,current_setting('server_version_num') v")).rows[0];
    assert.equal(await realpath(info.d),await realpath(data));assert.equal(info.h,'127.0.0.1');assert.equal(Math.floor(Number(info.v)/10000),17);
    await admin.query(authFixture);await admin.query('insert into auth.users(id) values($1),($2)',[A,B]);
    for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await admin.query(await readFile('supabase/migrations/'+f,'utf8'));
    for(const c of [a,b]){await c.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await c.query('set role authenticated');}
    const area=randomUUID(),activity=randomUUID(),other=randomUUID(),checks=Array.from({length:4},(_,i)=>({id:randomUUID(),label:'Check '+i}));
    await a.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
    const goal={}; // Single source: checklist_items, without a parallel goal.
    await a.query('select save_activity_v05($1,$2,null,null,$3::uuid[],$4)',[JSON.stringify({id:activity,area_id:area,name:'Checklist',type:'checklistGoal'}),JSON.stringify(goal),[],JSON.stringify(checks)]);
    await a.query("select save_activity_aggregate($1,'{}',null)",[JSON.stringify({id:other,area_id:area,name:'Normal',type:'variableActivity'})]);
    let p=(await a.query("select create_daily_plan_v05($1,$2,'2026-11-01','08:00',null,null) v",[randomUUID(),activity])).rows[0].v;
    const q=(await a.query("select create_daily_plan_v05($1,$2,'2026-11-01',null,null,null) v",[randomUUID(),other])).rows[0].v;
    async function race(sql,values){const results=await Promise.allSettled([a,b].map((c,i)=>c.query(sql,values(i))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'40001');return results.find(r=>r.status==='fulfilled').value;}
    p=(await race('select change_daily_plan_v05($1,$2,\'time\',$3) v',i=>[p.id,JSON.stringify(expected(p)),JSON.stringify({plannedTime:i?'14:30':'10:30'})])).rows[0].v;
    p=(await race('select change_daily_plan_v05($1,$2,\'check\',$3) v',i=>[p.id,JSON.stringify(expected(p)),JSON.stringify({id:checks[i].id,completed:true})])).rows[0].v;
    assert.equal(p.checklist_snapshot.filter(n=>n.completedAt).length,1);assert.equal(p.completed_at,null);
    for(let i=0;i<2;i++){const extra=randomUUID();await a.query("select save_activity_aggregate($1,'{}',null)",[JSON.stringify({id:extra,area_id:area,name:'Untimed '+i,type:'variableActivity'})]);await a.query("select create_daily_plan_v05($1,$2,'2026-11-01',null,null,null)",[randomUUID(),extra]);}
    const rows=(await a.query("select to_jsonb(d) v from daily_plan_items d where planned_date='2026-11-01' order by sort_order")).rows.map(r=>r.v);
    const variants=[[rows[0],rows[2],rows[1],rows[3]],[rows[0],rows[3],rows[2],rows[1]]];
    await race("select reorder_plan_day('2026-11-01',$1)",i=>[JSON.stringify(variants[i].map(n=>({id:n.id,expected:expected(n)})))]);
    const ordered=(await a.query("select to_jsonb(d) v from daily_plan_items d order by sort_order")).rows.map(r=>r.v);assert.deepEqual(ordered.map(n=>n.sort_order),[0,1,2,3]);assert(ordered.every(n=>!n.manual_order));assert.equal(ordered[0].id,p.id);
    const before=structuredClone(ordered.find(n=>n.id===p.id));
    const revision=(await a.query('select revision from activities where id=$1',[activity])).rows[0].revision;
    await a.query('select save_activity_checklist($1,$2,$3)',[activity,revision,JSON.stringify([{id:randomUUID(),label:'New definition'}])]);
    assert.deepEqual((await a.query('select to_jsonb(d) v from daily_plan_items d where id=$1',[p.id])).rows[0].v,before);
    const fresh=(await a.query("select create_daily_plan_v05($1,$2,'2026-11-02',null,null,null) v",[randomUUID(),activity])).rows[0].v;assert.deepEqual(fresh.checklist_snapshot.map(n=>n.label),['New definition']);
    const quantityId=randomUUID(),quantityGoal=randomUUID();
    await a.query('select save_activity_v05($1,$2,null,null,$3::uuid[],$4)',[JSON.stringify({id:quantityId,area_id:area,name:'Quantity',type:'checklistGoal',goal_tracking_mode:'quantity'}),JSON.stringify({goals:[{id:quantityGoal,metric:'quantity',unit:'garrafas',minimum_target:2,period:'day',starts_on:'2026-01-01'}]}),[],'[]']);
    let quantityPlan=(await a.query("select create_daily_plan_v05($1,$2,'2026-11-01',null,null,null) v",[randomUUID(),quantityId])).rows[0].v;
    quantityPlan=(await race("select change_daily_plan_v05($1,$2,'quantity',$3) v",i=>[quantityPlan.id,JSON.stringify(expected(quantityPlan)),JSON.stringify({goalId:quantityGoal,unitIndex:i,completed:true})])).rows[0].v;
    assert.equal(quantityPlan.quantity_snapshot[0].completed,1);assert.equal(quantityPlan.completed_at,null);
    const remaining=quantityPlan.quantity_snapshot[0].checked.includes(0)?1:0;
    quantityPlan=(await a.query("select change_daily_plan_v05($1,$2,'quantity',$3) v",[quantityPlan.id,JSON.stringify(expected(quantityPlan)),JSON.stringify({goalId:quantityGoal,unitIndex:remaining,completed:true})])).rows[0].v;
    assert.equal(quantityPlan.quantity_snapshot[0].completed,2);assert(quantityPlan.completed_at);
    const today=(await a.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
    const tomorrow=(await a.query("select ($1::date+1)::text d",[today])).rows[0].d;
    const syncId=randomUUID(),syncGoal=randomUUID();
    const syncActivity={id:syncId,area_id:area,name:'Concurrent sync',type:'checklistGoal',goal_tracking_mode:'quantity'};
    const syncRelations=target=>({goals:[{id:syncGoal,metric:'quantity',unit:'garrafas',minimum_target:target,period:'day',starts_on:'2026-01-01'}]});
    const source=(await a.query('select save_activity_v05($1,$2,null,null,$3::uuid[],$4) v',[JSON.stringify(syncActivity),JSON.stringify(syncRelations(2)),[],'[]'])).rows[0].v;
    const live=(await a.query('select create_daily_plan_v05($1,$2,$3,null,null,null) v',['f'+randomUUID().slice(1),syncId,today])).rows[0].v;
    const untouched=(await a.query('select create_daily_plan_v05($1,$2,$3,null,null,null) v',['0'+randomUUID().slice(1),syncId,tomorrow])).rows[0].v;
    await b.query('begin');
    const concurrent=(await b.query("select change_daily_plan_v05($1,$2,'quantity',$3) v",[live.id,JSON.stringify(expected(live)),JSON.stringify({goalId:syncGoal,unitIndex:0,completed:true})])).rows[0].v;
    await assert.rejects(()=>a.query('select save_activity_v05($1,$2,$3,null,$4::uuid[],$5)',[JSON.stringify(syncActivity),JSON.stringify(syncRelations(3)),source.activity.revision,[],'[]']),e=>e.code==='40001');
    await b.query('commit');
    assert.equal(Number((await a.query('select minimum_target from goals where id=$1',[syncGoal])).rows[0].minimum_target),2,'failed sync rolls back master');
    assert.deepEqual((await a.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[untouched.id])).rows[0].v,untouched,'earlier row update also rolls back');
    await a.query('select save_activity_v05($1,$2,$3,null,$4::uuid[],$5)',[JSON.stringify(syncActivity),JSON.stringify(syncRelations(3)),source.activity.revision,[],'[]']);
    const synced=(await a.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[live.id])).rows[0].v;
    assert.equal(synced.quantity_snapshot[0].target,3);assert.deepEqual(synced.quantity_snapshot[0].checked,[0]);
    await assert.rejects(()=>a.query("select change_daily_plan_v05($1,$2,'quantity',$3)",[live.id,JSON.stringify(expected(concurrent)),JSON.stringify({goalId:syncGoal,unitIndex:1,completed:true})]),e=>e.code==='40001');
    await b.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);assert.equal((await b.query('select id from daily_plan_items where id=$1',[p.id])).rowCount,0);
    await assert.rejects(()=>b.query("select change_daily_plan_v05($1,$2,'quantity',$3)",[quantityPlan.id,JSON.stringify(expected(quantityPlan)),JSON.stringify({goalId:quantityGoal,unitIndex:0,completed:false})]),e=>e.code==='23503');
    await assert.rejects(()=>b.query("select change_daily_plan_v05($1,$2,'time',$3)",[p.id,JSON.stringify(expected(before)),JSON.stringify({plannedTime:null})]),e=>e.code==='23503');
    assert(q.checklist_snapshot===null);
  }finally{await Promise.all(clients.map(c=>c.end()));}
});
