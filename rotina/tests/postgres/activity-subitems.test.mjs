import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {authFixture,A,B} from '../helpers/account-fixtures.mjs';
const port=Number(process.env.ROTINA_PG_PORT),data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data||!resolve(data).startsWith(resolve('node_modules/.cache/rotina-pg-concurrency')))throw Error('Use disposable localhost runner.');
test('V0.4 PostgreSQL sessions serialize template/occurrence CAS, retain frozen independent plans and preserve RLS',async()=>{
  const clients=Array.from({length:3},()=>new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000}));
  const [admin,a,b]=clients;await Promise.all(clients.map(c=>c.connect()));
  try{
    const info=(await admin.query("select current_setting('data_directory') d,current_setting('listen_addresses') h,current_setting('server_version_num') v")).rows[0];
    assert.equal(await realpath(info.d),await realpath(data));assert.equal(info.h,'127.0.0.1');assert.equal(Math.floor(Number(info.v)/10000),17);
    await admin.query(authFixture);await admin.query('insert into auth.users(id) values($1),($2)',[A,B]);
    for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await admin.query(await readFile('supabase/migrations/'+f,'utf8'));
    for(const client of clients){await client.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);if(client!==admin)await client.query('set role authenticated');}
    const area=randomUUID(),root=randomUUID();await a.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
    const tree={mode:'all',items:['One','Two'].map(name=>({id:randomUUID(),parentId:null,name,durationMinutes:15,sortOrder:0,active:true,defaultSelected:true}))};
    const aggregate=(await a.query("select save_activity_with_subitems($1,'{}',null,$2) v",[JSON.stringify({id:root,name:'Root',type:'variableActivity',area_id:area}),JSON.stringify(tree)])).rows[0].v;
    const plans=await Promise.all([a,b].map((client,i)=>client.query('select create_plan_with_subitems($1,$2,$3,$4,$5) v',[randomUUID(),root,'2026-11-0'+(i+1),aggregate.activity.revision,i===0?null:JSON.stringify(tree.items.map((n,j)=>({id:n.id,selected:j===0,overrideMinutes:null})))])));
    const [p,q]=plans.map(r=>r.rows[0].v);assert.equal(p.planned_duration_minutes,30);assert.equal(q.planned_duration_minutes,15);
    const edits=await Promise.allSettled([a,b].map((client,i)=>client.query('select save_activity_subitems($1,$2,$3)',[root,aggregate.activity.revision,JSON.stringify({...tree,items:tree.items.map(n=>({...n,name:'Edit '+i}))})])));
    assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);assert.equal(edits.find(r=>r.status==='rejected').reason.code,'40001');
    const expected={updatedAt:p.updated_at,completedAt:p.completed_at,plannedDate:p.planned_date};
    const completions=await Promise.allSettled([a,b].map((client,i)=>client.query('select change_plan_subitems($1,$2,null,$3,true) v',[p.id,JSON.stringify(expected),tree.items[i].id])));
    assert.equal(completions.filter(r=>r.status==='fulfilled').length,1);assert.equal(completions.find(r=>r.status==='rejected').reason.code,'40001');
    const partial=completions.find(r=>r.status==='fulfilled').value.rows[0].v;assert.equal(partial.completed_at,null);assert.equal(partial.subitem_snapshot.filter(n=>n.completedAt).length,1);
    const completed=(await a.query('update daily_plan_items set completed_at=now() where id=$1 returning to_jsonb(daily_plan_items) v',[p.id])).rows[0].v;
    assert(completed.completed_at);assert(completed.subitem_snapshot.every(n=>n.completedAt));
    const frozen=(await a.query('select subitem_snapshot from daily_plan_items where id=$1',[q.id])).rows[0].subitem_snapshot;
    assert.deepEqual(frozen,q.subitem_snapshot);assert(frozen.some(n=>n.name==='One'));
    const current=(await a.query('select get_activity_aggregate($1) v',[root])).rows[0].v;
    const removals=await Promise.allSettled([a,b].map((client,i)=>client.query("select save_activity_with_subitem_deletions($1,'{}',$2,$3,$4::uuid[]) v",[
      JSON.stringify({id:root,name:'Root',type:'variableActivity',area_id:area}),current.activity.revision,
      JSON.stringify({...current.subitem_tree,items:current.subitem_tree.items.filter(n=>n.id!==tree.items[i].id)}),[tree.items[i].id],
    ])));
    assert.equal(removals.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(removals.find(r=>r.status==='rejected').reason.code,'40001');
    const removed=removals.find(r=>r.status==='fulfilled').value.rows[0].v;
    assert.equal(removed.activity.duration_minutes,15);assert.equal(removed.subitem_tree.items.length,1);
    assert.deepEqual((await a.query('select to_jsonb(d) v from daily_plan_items d where id=$1',[q.id])).rows[0].v,q);
    const historical=(await a.query('select change_plan_subitems($1,$2,null,$3,true) v',[q.id,JSON.stringify({updatedAt:q.updated_at,completedAt:q.completed_at,plannedDate:q.planned_date}),tree.items[0].id])).rows[0].v;
    assert(historical.completed_at,'old snapshot remains executable after deleting its definition');
    assert.equal((await a.query("select has_schema_privilege('authenticated','routine_private','USAGE') v")).rows[0].v,false);
    await b.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);assert.equal((await b.query('select id from activity_subitems where root_activity_id=$1',[root])).rowCount,0);
    await assert.rejects(()=>b.query('select change_plan_subitems($1,$2,null,$3,true)',[p.id,JSON.stringify(expected),tree.items[0].id]),e=>e.code==='23503');
  }finally{await Promise.all(clients.map(c=>c.end()));}
});
