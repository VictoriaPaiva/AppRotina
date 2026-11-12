import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {A,B,authFixture} from '../helpers/account-fixtures.mjs';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
const {planSnapshot}=load('lib/planning/contracts.ts');
const db=new PGlite();
// Preserve PostgreSQL microseconds and civil dates instead of JS Date rounding.
const iso=s=>s.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
const transport={async query(sql,args){const result=await db.query(sql,args);for(const row of result.rows)if(row.activity_id&&row.updated_at){const raw=(await db.query('select planned_date::text d,created_at::text c,updated_at::text u,completed_at::text x from daily_plan_items where id=$1',[row.id])).rows[0];row.planned_date=raw.d;row.created_at=iso(raw.c);row.updated_at=iso(raw.u);row.completed_at=raw.x===null?null:iso(raw.x);}return result;}};
let plans,master;
const migration='20261101000100_day_order_checklists.sql';
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
before(async()=>{await db.exec(authFixture);await db.query('insert into auth.users(id) values($1),($2)',[A,B]);for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));await user();
  const client=pgliteClient(transport,['areas','activities','daily_plan_items','activity_subitems']);plans=load('lib/planning/repository.ts').createPlanRepository(client,A);master=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository(client);
});
after(()=>db.close());
async function activity({checks=false,tree=null}={}){
  const area=randomUUID(),id=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
  const definition=checks?Array.from({length:4},(_,i)=>({id:randomUUID(),label:'Item '+(i+1)})):[];
  const relations={}; // Meta / Checklist items are sufficient; no numeric goal.
  const saved=(await db.query('select save_activity_v05($1,$2,null,$3,$4::uuid[],$5) v',[JSON.stringify({id,name:'Activity',area_id:area,type:checks?'checklistGoal':'variableActivity',duration_mode:'fixed',duration_minutes:45}),JSON.stringify(relations),tree?JSON.stringify(tree):null,[],JSON.stringify(definition)])).rows[0].v;
  return {id,revision:saved.activity.revision,definition,tree};
}
const create=(a,date,time=null)=>plans.create({id:randomUUID(),activityId:a.id,plannedDate:date,plannedTime:time,...(a.tree?{sourceRevision:a.revision}:{})});
const time=(p,value)=>plans.setTime({id:p.id,expected:planSnapshot(p),plannedTime:value});
const check=(p,id,completed=true)=>plans.completeChecklist({id:p.id,expected:planSnapshot(p),checklistItemId:id,completed});
const done=(p,completed=true)=>plans.setCompleted({id:p.id,expected:planSnapshot(p),completed});
const order=items=>({plannedDate:items[0].plannedDate,items:items.map(n=>({id:n.id,expected:planSnapshot(n)}))});

test('chronological order always wins; remove/add time, timed ties, three untimed positions and day independence persist',async()=>{
  const date='2026-11-01',a=await activity(),b=await activity(),c=await activity(),d=await activity();
  await create(a,date,'14:30');await create(b,date,'08:00');await create(c,date,'10:30');await create(d,date);
  let rows=await plans.listByDate(date);assert.deepEqual(rows.map(n=>n.activityId),[b.id,c.id,a.id,d.id]);assert.deepEqual(rows.map(n=>n.plannedTime),['08:00','10:30','14:30',null]);
  const tomorrow=await create(a,'2026-11-02','18:30');
  await assert.rejects(()=>plans.reorder(order([rows[0],rows[3],rows[1],rows[2]])),e=>e.kind==='Validation');
  assert.deepEqual(await plans.listByDate(date),rows,'a forbidden timed reorder must not write any row');
  await time(rows[2],'07:00');rows=await plans.listByDate(date);assert.deepEqual(rows.map(n=>n.activityId),[a.id,b.id,c.id,d.id]);
  await time(rows[2],null);rows=await plans.listByDate(date);assert.deepEqual(rows.map(n=>n.activityId),[a.id,b.id,d.id,c.id]);
  await time(rows[2],'09:00');rows=await plans.listByDate(date);assert.deepEqual(rows.map(n=>n.activityId),[a.id,b.id,d.id,c.id]);assert.equal(rows[2].plannedTime,'09:00');
  const extra=await activity(),extra2=await activity();await create(extra,date);await create(extra2,date);rows=await plans.listByDate(date);
  const timed=rows.slice(0,3),untimed=rows.slice(3);
  await plans.reorder(order([...timed,untimed[2],untimed[0],untimed[1]]));rows=await plans.listByDate(date);
  assert.deepEqual(rows.slice(3).map(n=>n.activityId),[extra2.id,c.id,extra.id]);assert(rows.every(n=>!n.manualOrder));
  await time(rows[1],'06:00');rows=await plans.listByDate(date);assert.equal(rows[0].activityId,b.id);
  assert.deepEqual(rows.slice(3).map(n=>n.activityId),[extra2.id,c.id,extra.id]);
  await time(rows[2],'06:00');rows=await plans.listByDate(date);assert.deepEqual(rows.slice(0,2).map(n=>n.activityId),[b.id,d.id]);
  assert.deepEqual(await plans.listByDate(date),rows);
  assert.deepEqual(await plans.listByDate('2026-11-02'),[tomorrow]);
  assert.equal((await master.getActivity(a.id)).bundle.activity.duration.minutes,45);
  const auto='2026-11-03';await create(a,auto,'14:30');await create(b,auto,'08:00');let automated=await plans.listByDate(auto);
  await time(automated[1],'07:00');automated=await plans.listByDate(auto);assert.equal(automated[0].activityId,a.id);
});

test('checklist four items, independent days, partial/all/reopen/bulk, frozen definition and refreshed checks',async()=>{
  const a=await activity({checks:true});let p=await create(a,'2026-10-04','20:30');const q=await create(a,'2026-10-05');
  assert.equal(p.checklist.length,4);assert(p.checklist.every(n=>n.completedAt===null));
  p=await check(p,a.definition[0].id);assert.equal(p.completedAt,null);assert.equal(p.checklist.filter(n=>n.completedAt).length,1);
  for(const n of a.definition.slice(1))p=await check(p,n.id);assert(p.completedAt);
  p=await check(p,a.definition[1].id,false);assert.equal(p.completedAt,null);
  p=await done(p);assert(p.checklist.every(n=>n.completedAt));p=await done(p,false);assert(p.checklist.every(n=>n.completedAt===null));
  p=await check(p,a.definition[0].id);assert.deepEqual((await plans.listByDate(p.plannedDate))[0],p);
  const prior=await master.getActivity(a.id);const changed=await master.saveActivity({...prior.bundle,checklistItems:[{id:randomUUID(),label:'New template'}]},prior.revision);
  assert.deepEqual((await plans.listByDate(p.plannedDate))[0],p);assert.deepEqual((await plans.listByDate(q.plannedDate))[0],q);
  const future=await create({...a,revision:changed.revision},'2026-11-06');assert.deepEqual(future.checklist.map(n=>n.label),['New template']);
  assert.equal(future.checklist[0].completedAt,null);assert.equal(future.plannedDurationMinutes,undefined,'checklist does not derive duration');
});

test('checklist end-to-end: write boundary -> template -> planning snapshot -> Hoje server reader -> four real checks and durable progress',async()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{withStubs}=require('../helpers/load-with-stubs.cjs');
  const a=await activity({checks:true}),before=await master.getActivity(a.id);
  const labels=['Escovar dentes','Skincare','Separar roupa','Preparar mochila'];
  const definition=before.bundle.checklistItems.map((n,i)=>({...n,label:labels[i]}));
  const saved=await load('lib/banco-mestre/data/write-model.ts').saveBancoMestreActivity(async()=>master,{mode:'edit',bundle:{...before.bundle,checklistItems:definition},expectedRevision:before.revision});
  assert(saved.ok);assert.deepEqual((await master.getActivity(a.id)).bundle.checklistItems,definition);
  let p=await create(a,'2026-10-20','20:30');const q=await create(a,'2026-10-21');
  assert.deepEqual(p.checklist.map(n=>n.label),labels);
  const {PlanChecklist}=withStubs('components/planning/PlanChecklist.tsx');
  let writes=0;
  const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',{
    'next/navigation':{useRouter:()=>({push(){},refresh(){}})},'next/link':{default:'a'},
    '@/components/ui/button':{Button:({asChild,children,...props})=>asChild?children:React.createElement('button',props,children)},
    '@/components/ui/card':{Card:'div',CardContent:'div'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/app/planejamento/actions':Object.fromEntries(['createDailyPlan','setDailyPlanCompleted','rescheduleDailyPlan','configureDailyPlanSubitems','completeDailyPlanSubitem','setDailyPlanTime','completeDailyPlanChecklist','reorderDailyPlan'].map(name=>[name,()=>{writes++;throw Error('No write during render');}])),
    '@/lib/planning/contracts':load('lib/planning/contracts.ts'),'@/lib/planning/dates':load('lib/planning/dates.ts'),
    './PlanChecklist':{PlanChecklist},
  });
  const {readPlanPage}=withStubs('lib/planning/server.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:A}},error:null})}})},
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>master},
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/data/validation':load('lib/banco-mestre/data/validation.ts'),
    './repository':{createPlanRepository:()=>({...plans,listPending:async()=>[]})},
    './dates':{...load('lib/planning/dates.ts'),planToday:()=>p.plannedDate},
  });
  const {PlanPageContent}=withStubs('components/planning/PlanPageContent.tsx',{'@/lib/planning/server':{readPlanPage},'./PlanningBoard':{PlanningBoard}});
  const html=async()=>renderToStaticMarkup(await PlanPageContent({todayMode:true}));
  assert.equal(((await html()).match(/type="checkbox"/g)||[]).length,4);
  p=await check(p,definition[0].id);assert((await html()).includes('1 de 4 concluídos'));
  assert.deepEqual((await plans.listByDate(p.plannedDate))[0],p,'refresh keeps the first check');
  for(const n of definition.slice(1))p=await check(p,n.id);assert(p.completedAt);assert((await html()).includes('4 de 4 concluídos'));
  p=await check(p,definition[1].id,false);assert.equal(p.completedAt,null);assert((await html()).includes('3 de 4 concluídos'));
  p=await done(p);assert(p.checklist.every(n=>n.completedAt));
  const current=await master.getActivity(a.id);await master.saveActivity({...current.bundle,checklistItems:[{id:randomUUID(),label:'Future only'}]},current.revision);
  const oldHtml=await html();assert(oldHtml.includes('Preparar mochila'));assert(!oldHtml.includes('Future only'));assert.equal(writes,0);
  assert.deepEqual((await plans.listByDate(q.plannedDate))[0],q);assert(q.checklist.every(n=>!n.completedAt));
  const fresh=await create(a,'2026-11-22');assert.deepEqual(fresh.checklist.map(n=>n.label),['Future only']);
});

test('checklist and hierarchical selected subitems remain separate; mother requires both and bulk conclusion synchronizes both',async()=>{
  const root=randomUUID(),leaf=randomUUID(),tree={mode:'all',items:[{id:root,parentId:null,name:'Group',durationMinutes:1,sortOrder:0,active:true,defaultSelected:true},{id:leaf,parentId:root,name:'Leaf',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true}]};
  const a=await activity({checks:true,tree});let p=await create(a,'2026-11-07','08:00');
  for(const n of a.definition)p=await check(p,n.id);assert.equal(p.completedAt,null,'subitems still pending');
  p=await plans.completeSubitem({id:p.id,expected:planSnapshot(p),subitemId:leaf,completed:true});assert(p.completedAt);
  p=await check(p,a.definition[0].id,false);assert.equal(p.completedAt,null);assert(p.subitems.find(n=>n.id===leaf).completedAt);
  p=await done(p);assert(p.completedAt);assert(p.checklist.every(n=>n.completedAt));assert(p.subitems.every(n=>n.completedAt));
  p=await plans.completeSubitem({id:p.id,expected:planSnapshot(p),subitemId:leaf,completed:false});assert.equal(p.completedAt,null);assert(p.checklist.every(n=>n.completedAt));
  assert.equal(p.plannedDurationMinutes,15);const old=structuredClone(p);
  const saved=await master.getActivity(a.id);await master.saveActivity({...saved.bundle,subitems:{mode:'all',items:[]}},saved.revision,[root,leaf]);
  assert.deepEqual((await plans.listByDate(p.plannedDate))[0],old);
});

test('stale time/check/order, same-account cross-day, cross-user, column grants, invalid data and aggregate rollback',async()=>{
  const grants=(await db.query("select proname,prosecdef,has_function_privilege('authenticated',oid,'execute') own,has_function_privilege('anon',oid,'execute') anon,(select count(*) from aclexplode(coalesce(proacl,acldefault('f',proowner))) where grantee=0 and privilege_type='EXECUTE')::int pub from pg_proc where pronamespace='public'::regnamespace and proname in ('save_activity_checklist','save_activity_v05','create_daily_plan_v05','change_daily_plan_v05','reorder_plan_day')")).rows;
  assert.equal(grants.length,5);assert(grants.every(n=>n.own&&!n.anon&&!n.pub));assert(grants.every(n=>n.prosecdef===(n.proname!=='save_activity_v05')));
  const a=await activity({checks:true});const p=await create(a,'2026-11-08'),q=await create(a,'2026-11-09');
  const changed=await time(p,'14:30');await assert.rejects(()=>time(p,'08:00'),e=>e.kind==='Conflict');
  await assert.rejects(()=>check(p,a.definition[0].id),e=>e.kind==='Conflict');
  await assert.rejects(()=>plans.reorder(order([p])),e=>e.kind==='Conflict');
  await assert.rejects(()=>plans.reorder({plannedDate:p.plannedDate,items:[{id:q.id,expected:planSnapshot(q)}]}),e=>e.kind==='Validation');
  for(const value of ['24:00','8:00','12:30:01','invalid'])await assert.rejects(()=>time(changed,value),e=>e.kind==='Validation');
  await assert.rejects(()=>db.query('update daily_plan_items set planned_time=$1 where id=$2',['10:00',p.id]),e=>e.code==='42501');
  await assert.rejects(()=>db.query("update daily_plan_items set checklist_snapshot='[]' where id=$1",[p.id]),e=>e.code==='42501');
  const saved=await master.getActivity(a.id);const args=load('lib/banco-mestre/data/mapper.ts').aggregateToRpc({...saved.bundle,activity:{...saved.bundle.activity,name:'Must rollback'}},saved.revision);
  await assert.rejects(()=>db.query('select save_activity_v05($1,$2,$3,null,$4::uuid[],$5)',[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations),saved.revision,[],JSON.stringify([{id:randomUUID(),label:''}])]),e=>e.code==='23514');
  assert.deepEqual(await master.getActivity(a.id),saved);
  const duplicate=randomUUID();
  await assert.rejects(()=>db.query('select save_activity_checklist($1,$2,$3)',[a.id,saved.revision,JSON.stringify([{id:duplicate,label:'A'},{id:duplicate.toUpperCase(),label:'B'}])]),e=>e.code==='23514');
  await db.query('select save_activity_checklist($1,$2,$3)',[a.id,saved.revision,JSON.stringify(a.definition.map(n=>({...n,id:n.id.toUpperCase()})))]);
  assert.deepEqual(await master.getActivity(a.id),saved,'canonical casing must not create a different ID or a needless revision');
  await user(B);const foreign=load('lib/planning/repository.ts').createPlanRepository(pgliteClient(db,['daily_plan_items']),B);
  assert.deepEqual(await foreign.listByDate(p.plannedDate),[]);
  await assert.rejects(()=>foreign.setTime({id:p.id,expected:planSnapshot(changed),plannedTime:'10:00'}),e=>e.kind==='NotFound');
  await assert.rejects(()=>foreign.completeChecklist({id:p.id,expected:planSnapshot(changed),checklistItemId:a.definition[0].id,completed:true}),e=>e.kind==='NotFound');
  await assert.rejects(()=>foreign.reorder(order([changed])),e=>['Conflict','NotFound'].includes(e.kind));await user();
  assert.deepEqual((await plans.listByDate(p.plannedDate))[0],changed);
});

test('migration backfills order by created_at/id, preserving legacy audit/completion and not inventing checklist checks',async()=>{
  const old=new PGlite();try{
    await old.exec(authFixture);await old.query('insert into auth.users(id) values($1)',[A]);
    for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')&&n<migration).sort())await old.exec(await readFile('supabase/migrations/'+f,'utf8'));
    await old.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await old.exec('set role authenticated');
    const area=randomUUID();await old.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
    for(let i=0;i<3;i++){const id=randomUUID();await old.query("select save_activity_aggregate($1,'{}',null)",[JSON.stringify({id,area_id:area,name:'Legacy '+i,type:'variableActivity'})]);await old.query("insert into daily_plan_items(user_id,activity_id,planned_date) values($1,$2,'2026-11-10')",[A,id]);}
    const prior=(await old.query('select id,created_at::text,updated_at::text,completed_at::text from daily_plan_items order by created_at,id')).rows;
    await old.exec('reset role');await old.exec(await readFile('supabase/migrations/'+migration,'utf8'));
    const after=(await old.query('select id,created_at::text,updated_at::text,completed_at::text from daily_plan_items order by sort_order')).rows;assert.deepEqual(after,prior);
    const added=(await old.query('select planned_time,sort_order,checklist_snapshot,activity_type_snapshot from daily_plan_items order by sort_order')).rows;
    assert.deepEqual(added.map(n=>n.sort_order),[0,1,2]);assert(added.every(n=>n.planned_time===null&&n.checklist_snapshot===null&&n.activity_type_snapshot===null));
  }finally{await old.close();}
});

test('chronology migration upgrades an existing manual day without changing checklist history and invalidates old CAS',async()=>{
  const prior=new PGlite();try{
    await prior.exec(authFixture);await prior.query('insert into auth.users(id) values($1)',[A]);
    const correction='20261101000200_chronological_day_order.sql';
    for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')&&n<correction).sort())await prior.exec(await readFile('supabase/migrations/'+f,'utf8'));
    await prior.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await prior.exec('set role authenticated');
    const area=randomUUID(),activityIds=[randomUUID(),randomUUID(),randomUUID()];await prior.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
    const records=[];
    for(let i=0;i<3;i++){
      const checklist=i===0,items=checklist?[{id:randomUUID(),label:'Historical check'}]:[];
      await prior.query('select save_activity_v05($1,$2,null,null,$3::uuid[],$4)',[JSON.stringify({id:activityIds[i],area_id:area,name:'Template '+i,type:checklist?'checklistGoal':'variableActivity'}),JSON.stringify(checklist?{goals:[{metric:'count',unit:'execution',minimum_target:1,period:'day',starts_on:'2026-11-01'}]}:{}),[],JSON.stringify(items)]);
      records.push((await prior.query("select create_daily_plan_v05($1,$2,'2026-11-25',$3,null,null) v",[randomUUID(),activityIds[i],['14:00','08:00',null][i]])).rows[0].v);
    }
    const current=(await prior.query('select to_jsonb(d) v from daily_plan_items d order by sort_order')).rows.map(r=>r.v);
    const desired=records.map(n=>current.find(x=>x.id===n.id));
    await prior.query("select reorder_plan_day('2026-11-25',$1)",[JSON.stringify(desired.map(n=>({id:n.id,expected:planSnapshot({updatedAt:n.updated_at,completedAt:n.completed_at,plannedDate:n.planned_date})}))) ]);
    await prior.query('update daily_plan_items set completed_at=now() where id=$1',[records[0].id]);
    const before=(await prior.query('select to_jsonb(d) v from daily_plan_items d order by sort_order')).rows.map(r=>r.v);
    await prior.exec('reset role');await prior.exec(await readFile('supabase/migrations/'+correction,'utf8'));await prior.exec('set role authenticated');
    const after=(await prior.query('select to_jsonb(d) v from daily_plan_items d order by sort_order')).rows.map(r=>r.v);
    assert.deepEqual(after.map(n=>n.activity_id),[activityIds[1],activityIds[0],activityIds[2]]);assert(after.every(n=>!n.manual_order));
    for(const old of before){const next=after.find(n=>n.id===old.id);for(const field of ['checklist_snapshot','subitem_snapshot','completed_at','created_at','activity_name_snapshot','planned_duration_minutes'])assert.deepEqual(next[field],old[field]);assert.notEqual(next.updated_at,old.updated_at);}
    const stale=before[0];await assert.rejects(()=>prior.query("select change_daily_plan_v05($1,$2,'time',$3)",[stale.id,JSON.stringify({updatedAt:stale.updated_at,completedAt:stale.completed_at,plannedDate:stale.planned_date}),JSON.stringify({plannedTime:'07:00'})]),e=>e.code==='40001');
  }finally{await prior.close();}
});

test('quantity and checklist modes reuse definitions, preserve inactive values and freeze execution per occurrence',async()=>{
 const a=await activity({checks:true});let current=await master.getActivity(a.id);
 const goal={id:randomUUID(),activityId:a.id,enabled:true,metric:'quantity',unit:'copos',minimumTarget:8,period:'day',startsOn:'2026-11-01'};
 current=await master.saveActivity({...current.bundle,goals:[goal],trackingMode:'quantity'},current.revision);
 assert.equal(current.bundle.trackingMode,'quantity');assert.equal(current.bundle.goals[0].minimumTarget,8);assert.deepEqual(current.bundle.checklistItems,a.definition);
 const old=await create(a,'2026-10-01');assert.equal(old.checklist,undefined);
 const revision=current.revision;current=await master.saveActivity({...current.bundle,trackingMode:'checklist'},revision);
 const next=await create(a,'2026-10-02');assert.equal(next.checklist.length,4);assert.equal((await plans.listByDate('2026-10-01'))[0].checklist,undefined);
 assert.equal(current.bundle.goals[0].minimumTarget,8);
 await assert.rejects(()=>master.saveActivity({...current.bundle,trackingMode:'quantity'},revision),e=>e.kind==='Conflict');
 await user(B);await assert.rejects(()=>master.saveActivity({...current.bundle,trackingMode:'quantity'},current.revision));await user();
 const before=await master.getActivity(a.id);await assert.rejects(()=>db.query("select save_activity_v05($1,$2,$3,null,$4::uuid[],$5)",[JSON.stringify({id:a.id,area_id:before.bundle.activity.areaId,name:'Must rollback',type:'checklistGoal',goal_tracking_mode:'invalid'}),JSON.stringify({goals:[]}),before.revision,[],JSON.stringify(a.definition)]));
 assert.deepEqual(await master.getActivity(a.id),before);
 current=await master.saveActivity({...before.bundle,trackingMode:'quantity'},before.revision);
 assert.deepEqual(current.bundle.checklistItems,a.definition);assert.equal((await plans.listByDate('2026-10-02'))[0].checklist.length,4);
 for(const [period,minimumTarget] of [['week',3],['day',8],['month',2]]){current=await master.saveActivity({...current.bundle,goals:[{...current.bundle.goals[0],period,minimumTarget}]},current.revision);const refreshed=await master.getActivity(a.id);assert.equal(refreshed.bundle.goals[0].period,period);assert.equal(refreshed.bundle.goals[0].minimumTarget,minimumTarget);}
});

test('three saved textual checks populate a new occurrence, survive refresh, and never rewrite a pre-definition occurrence',async()=>{
 const a=await activity({checks:true});let bundle=await master.getActivity(a.id);
 bundle=await master.saveActivity({...bundle.bundle,trackingMode:'checklist',checklistItems:[]},bundle.revision);
 const old=await create(a,'2026-10-10');assert.deepEqual(old.checklist,[]);
 const items=['Item A','Item B','Item C'].map(label=>({id:randomUUID(),label}));
 bundle=await master.saveActivity({...bundle.bundle,checklistItems:items},bundle.revision);
 assert.deepEqual((await master.getActivity(a.id)).bundle.checklistItems,items);
 let fresh=await create(a,'2026-10-11','20:30');assert.equal(fresh.goalTrackingModeSnapshot,'checklist');assert.deepEqual(fresh.checklist.map(({id,label})=>({id,label})),items);
 const {withStubs}=require('../helpers/load-with-stubs.cjs'),{renderToStaticMarkup}=require('react-dom/server');
 const {PlanChecklist}=withStubs('components/planning/PlanChecklist.tsx');
 assert.equal((renderToStaticMarkup(PlanChecklist({items:fresh.checklist,onComplete(){}})).match(/type="checkbox"/g)||[]).length,3);
 fresh=await check(fresh,items[0].id);assert.deepEqual((await plans.listByDate(fresh.plannedDate))[0],fresh);
 assert.deepEqual((await plans.listByDate(old.plannedDate))[0],old);
 const other=await create(a,'2026-10-12');assert(other.checklist.every(n=>n.completedAt===null));
 await master.saveActivity({...bundle.bundle,trackingMode:'quantity',goals:[{id:randomUUID(),activityId:a.id,enabled:true,metric:'count',unit:'execution',minimumTarget:3,period:'week',startsOn:'2026-11-01'}]},bundle.revision);
 assert.deepEqual((await plans.listByDate(fresh.plannedDate))[0],fresh);assert.deepEqual((await plans.listByDate(old.plannedDate))[0],old);
});
async function quantityActivity(target=2,period='day',metric='quantity',tree=null){
 const a=await activity({tree}),before=await master.getActivity(a.id),goal={id:randomUUID(),activityId:a.id,metric,unit:metric==='count'?'execution':'garrafas',minimumTarget:target,period,enabled:true,startsOn:'2026-01-01'};
 const saved=await master.saveActivity({...before.bundle,activity:{...before.bundle.activity,type:'checklistGoal',config:{}},trackingMode:'quantity',checklistItems:[],goals:[goal]},before.revision);
 return {...a,revision:saved.revision,goal,bundle:saved};
}
const quantityUnit=(p,g,index,completed=true)=>plans.setQuantity({id:p.id,expected:planSnapshot(p),goalId:g.id,unitIndex:index,completed});
const quantityAmount=(p,g,amount)=>plans.setQuantity({id:p.id,expected:planSnapshot(p),goalId:g.id,amount});
test('daily quantity 2: units, refresh, all/reopen/bulk, distinct dates, stale and owner isolation',async()=>{
 const a=await quantityActivity();let p=await create(a,'2027-01-01','08:00'),other=await create(a,'2027-01-02');
 assert.equal(p.quantity[0].target,2);assert.equal(p.checklist,undefined);assert.equal(p.quantity[0].completed,0);
 const original=p;p=await quantityUnit(p,a.goal,0);assert.equal(p.completedAt,null);assert.equal(p.quantity[0].completed,1);assert.deepEqual((await plans.listByDate(p.plannedDate))[0],p);
 await assert.rejects(()=>quantityUnit(original,a.goal,1),e=>e.kind==='Conflict');
 p=await quantityUnit(p,a.goal,1);assert(p.completedAt);assert.equal(p.quantity[0].completed,2);
 p=await quantityUnit(p,a.goal,0,false);assert.equal(p.completedAt,null);assert.equal(p.quantity[0].completed,1);
 p=await done(p);assert(p.completedAt);assert.equal(p.quantity[0].checked.length,2);
 p=await done(p,false);assert.equal(p.quantity[0].completed,0);assert.equal(p.completedAt,null);
 assert.deepEqual((await plans.listByDate(other.plannedDate))[0],other);
 await assert.rejects(()=>quantityUnit(p,a.goal,2));await assert.rejects(()=>quantityAmount(p,a.goal,1));
 await user(B);await assert.rejects(()=>db.query("select change_daily_plan_v05($1,$2,'quantity',$3)",[p.id,JSON.stringify(planSnapshot(p)),JSON.stringify({goalId:a.goal.id,unitIndex:0,completed:true})]));await user();
 assert.deepEqual((await plans.listByDate(p.plannedDate))[0],p);
});
test('quantity snapshots retain 2 after master becomes 3; weekly/monthly record contributions instead of N daily checks',async()=>{
 const a=await quantityActivity();const old=await create(a,'2026-05-01');
 await master.saveActivity({...a.bundle.bundle,goals:[{...a.goal,minimumTarget:3}]},a.bundle.revision);
 const future=await create(a,'2027-02-02');assert.equal(future.quantity[0].target,3);assert.equal((await plans.listByDate(old.plannedDate))[0].quantity[0].target,2);
 for(const period of ['week','month']){
  const w=await quantityActivity(3,period,'count');let first=await create(w,'2027-03-01'),second=await create(w,'2027-03-02');assert.deepEqual(first.quantity[0].checked,[]);
  first=await done(first);assert.equal(first.quantity[0].completed,1);assert(first.completedAt);
  second=await quantityAmount(second,w.goal,2);assert(second.completedAt);assert.equal(second.quantity[0].completed,2);
  const {quantityTotals}=load('lib/planning/quantity-totals.ts');const rows=[first,second];const views=quantityTotals(rows.map(n=>({...n,name:'Goal',active:true})),rows);assert.equal(views[0].quantityTotals[w.goal.id],3);
  const {withStubs}=require('../helpers/load-with-stubs.cjs');let rangeQueries=0;
  const {readPlanPage}=withStubs('lib/planning/server.ts',{
   '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:A}}})}})},
   '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>master},
   './repository':{createPlanRepository:()=>({...plans,listByRange:async(...args)=>{rangeQueries++;return plans.listByRange(...args);}})},
   '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
   '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
   '@/lib/banco-mestre/data/validation':load('lib/banco-mestre/data/validation.ts'),
   './dates':load('lib/planning/dates.ts'),
  });
  const read=await readPlanPage('2027-03-01');assert.equal(read.status,'ready');assert.equal(read.items.find(n=>n.activityId===w.id).quantityTotals[w.goal.id],3);assert.equal(rangeQueries,1);
  first=await done(first,false);assert.equal(first.quantity[0].completed,0);assert.equal(first.completedAt,null);assert.equal(quantityTotals([{...first,name:'Goal',active:true}],[first,second])[0].quantityTotals[w.goal.id],2);
  await assert.rejects(()=>quantityAmount(first,w.goal,1.5));
 }
});
test('large/fractional daily counters, no active goals, V0.4 conjunction and immutable quantity definition',async()=>{
 for(const target of [25,2.5,9007199254740991]){const a=await quantityActivity(target);let p=await create(a,'2027-04-01');assert.deepEqual(p.quantity[0].checked,[]);p=await quantityAmount(p,a.goal,target/2);assert.equal(p.completedAt,null);p=await quantityAmount(p,a.goal,target);assert(p.completedAt);p=await done(p,false);assert.equal(p.quantity[0].completed,0);p=await done(p);assert.equal(p.quantity[0].completed,target);await assert.rejects(()=>quantityAmount(p,a.goal,-1));}
 const leaf={id:randomUUID(),parentId:null,name:'Leaf',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true};
 const a=await quantityActivity(2,'day','quantity',{mode:'all',items:[leaf]});let p=await create(a,'2027-04-02');p=await quantityUnit(p,a.goal,0);p=await quantityUnit(p,a.goal,1);assert.equal(p.completedAt,null,'selected V0.4 leaf still pending');p=await plans.completeSubitem({id:p.id,expected:planSnapshot(p),subitemId:leaf.id,completed:true});assert(p.completedAt);p=await quantityUnit(p,a.goal,1,false);assert.equal(p.completedAt,null);assert(p.subitems[0].completedAt);
 await db.exec('reset role');await assert.rejects(()=>db.query('update daily_plan_items set quantity_snapshot=$1 where id=$2',[JSON.stringify([{...p.quantity[0],target:3}]),p.id]));await user();assert.deepEqual((await plans.listByDate(p.plannedDate))[0],p);
});

test('saving master synchronizes open today/future quantity, preserves execution on shrink and freezes past/completed',async()=>{
 const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
 const date=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const a=await quantityActivity();let current=await create(a,today),future=await create(a,date(1)),past=await create(a,date(-1)),closed=await done(await create(a,date(2)));
 current=await quantityUnit(current,a.goal,0);let before=await master.getActivity(a.id);
 before=await master.saveActivity({...before.bundle,goals:[{...a.goal,minimumTarget:3}]},before.revision);
 current=(await plans.listByDate(today)).find(n=>n.activityId===a.id);assert.equal(current.quantity[0].target,3);assert.deepEqual(current.quantity[0].checked,[0]);assert.equal(current.quantity[0].completed,1);
 assert.equal((await plans.listByDate(date(1))).find(n=>n.activityId===a.id).quantity[0].target,3);
 assert.deepEqual((await plans.listByDate(past.plannedDate)).find(n=>n.id===past.id),past);assert.deepEqual((await plans.listByDate(closed.plannedDate)).find(n=>n.id===closed.id),closed);
 current=await quantityUnit(current,a.goal,2);assert.equal(current.completedAt,null);
 before=await master.saveActivity({...before.bundle,goals:[{...a.goal,minimumTarget:2}]},before.revision);
 current=(await plans.listByDate(today)).find(n=>n.id===current.id);assert.equal(current.quantity[0].target,2);assert.equal(current.quantity[0].completed,2);assert.deepEqual(current.quantity[0].checked,[0,2]);assert(current.completedAt);future=(await plans.listByDate(future.plannedDate)).find(n=>n.id===future.id);assert.equal(future.quantity[0].target,2);assert.deepEqual(future.quantity[0].checked,[]);
 current=await quantityUnit(current,a.goal,2,false);assert.equal(current.completedAt,null);assert.equal(current.quantity[0].completed,1);
 const stable=current;await master.saveActivity({...before.bundle,activity:{...before.bundle.activity,description:'Only description'}},before.revision);assert.deepEqual((await plans.listByDate(today)).find(n=>n.id===current.id),stable,'irrelevant edit does not write plans');
});
test('text sync adds/renames/removes by stable ID and archives executed removals without modifying V0.4',async()=>{
 const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
 const leaf={id:randomUUID(),parentId:null,name:'Preserved leaf',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true};const a=await activity({checks:true,tree:{mode:'all',items:[leaf]}});let before=await master.getActivity(a.id);const [A,B]=before.bundle.checklistItems;
 before=await master.saveActivity({...before.bundle,checklistItems:[A,B]},before.revision);
 a.revision=before.revision;let p=await create(a,today);p=await plans.completeSubitem({id:p.id,expected:planSnapshot(p),subitemId:leaf.id,completed:true});const frozenSubitems=p.subitems,frozenDuration=p.plannedDurationMinutes;p=await check(p,A.id);
 const C={id:randomUUID(),label:'C added'};
 before=await master.saveActivity({...before.bundle,checklistItems:[{...A,label:'A renamed'},B,C]},before.revision);
 p=(await plans.listByDate(today)).find(n=>n.activityId===a.id);assert.deepEqual(p.subitems,frozenSubitems);assert.equal(p.plannedDurationMinutes,frozenDuration);assert.equal(p.checklist.length,3);assert.equal(p.checklist[0].label,'A renamed');assert(p.checklist[0].completedAt);assert.equal(p.checklist[2].completedAt,null);
 before=await master.saveActivity({...before.bundle,checklistItems:[C]},before.revision);
 p=(await plans.listByDate(today)).find(n=>n.activityId===a.id);assert.deepEqual(p.checklist.map(n=>n.id),[C.id,A.id]);assert(p.checklist[1].retained);assert(p.checklist[1].completedAt);assert.equal(p.completedAt,null);
 const stale=p;p=await check(p,C.id);assert(p.completedAt);
 await assert.rejects(()=>db.query('select sync_open_activity_plans($1,$2,$3)',[a.id,before.revision,JSON.stringify({[p.id]:stale.updatedAt})]),e=>e.code==='40001');
 const frozen=p;before=await master.saveActivity({...before.bundle,checklistItems:[C,{id:randomUUID(),label:'Later'}]},before.revision);assert.deepEqual((await plans.listByDate(today)).find(n=>n.id===p.id),frozen);
});

test('text A/B -> A/B/C merges open today/future, keeps A checked and freezes past/completed',async()=>{
 const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
 const shift=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const a=await activity({checks:true});let source=await master.getActivity(a.id);const [A,B]=source.bundle.checklistItems,C={id:randomUUID(),label:'New C'};
 source=await master.saveActivity({...source.bundle,checklistItems:[A,B]},source.revision);
 let current=await create(a,today),future=await create(a,shift(1)),past=await create(a,shift(-1)),closed=await done(await create(a,shift(2)));
 current=await check(current,A.id);const completedAt=current.checklist[0].completedAt;
 const saved=await load('lib/banco-mestre/data/write-model.ts').saveBancoMestreActivity(async()=>master,{mode:'edit',bundle:{...source.bundle,checklistItems:[A,B,C]},expectedRevision:source.revision});assert(saved.ok);
 for(let refresh=0;refresh<2;refresh++){
  current=(await plans.listByDate(today)).find(n=>n.id===current.id);future=(await plans.listByDate(future.plannedDate)).find(n=>n.id===future.id);
  assert.deepEqual(current.checklist.map(n=>n.id),[A.id,B.id,C.id]);assert.equal(current.checklist[0].completedAt,completedAt);assert(current.checklist.slice(1).every(n=>n.completedAt===null));assert.equal(current.completedAt,null);
  assert.deepEqual(future.checklist.map(n=>n.id),[A.id,B.id,C.id]);assert(future.checklist.every(n=>n.completedAt===null));
 }
 assert.deepEqual((await plans.listByDate(past.plannedDate)).find(n=>n.id===past.id),past);assert.deepEqual((await plans.listByDate(closed.plannedDate)).find(n=>n.id===closed.id),closed);
});

test('completed backlog remains readable today without a volume limit; reopen returns to pending',async()=>{
 const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
 const yesterday=new Date(today+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);const date=yesterday.toISOString().slice(0,10);
 const ids=[];let reopened;
 for(let i=0;i<20;i++){
  const leaf={id:randomUUID(),parentId:null,name:'Leaf',durationMinutes:5,sortOrder:0,active:true,defaultSelected:true};
  const a=i%4===2?await quantityActivity():await activity({checks:i%4===1,tree:i%4===3?{mode:'all',items:[leaf]}:null});
  const p=await done(await create(a,i<10?date:today));ids.push(p.id);if(i===13)reopened=p;
 }
 for(let refresh=0;refresh<2;refresh++){const done=await plans.listCompletedOn(today);for(const id of ids)assert(done.some(n=>n.id===id));}
 reopened=await done(reopened,false);assert(!(await plans.listCompletedOn(today)).some(n=>n.id===reopened.id));assert((await plans.listByDate(today)).some(n=>n.id===reopened.id&&n.completedAt===null));
 reopened=await done(reopened);assert((await plans.listCompletedOn(today)).some(n=>n.id===reopened.id));
 const old=ids[0];assert(!(await plans.listByDate(today)).some(n=>n.id===old),'the previous reader lost completed backlog');assert(!(await plans.listPending(today)).some(n=>n.id===old));assert((await plans.listCompletedOn(today)).some(n=>n.id===old));
 await user(B);assert.deepEqual(await load('lib/planning/repository.ts').createPlanRepository(pgliteClient(transport,['daily_plan_items']),B).listCompletedOn(today),[]);await user();
});

test('sync preserves counters above reduced targets, archives removed execution and guards mode conversion/owner',async()=>{
 const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
 const a=await quantityActivity(25);let p=await create(a,today);p=await quantityAmount(p,a.goal,3);let source=await master.getActivity(a.id);
 await master.saveActivity({...source.bundle,goals:[{...a.goal,minimumTarget:2}]},source.revision);p=(await plans.listByDate(today)).find(n=>n.id===p.id);assert.equal(p.quantity[0].target,2);assert.equal(p.quantity[0].completed,3);assert(p.completedAt);
 const b=await quantityActivity(3);let q=await create(b,today);q=await quantityUnit(q,b.goal,0);let definition=await master.getActivity(b.id);
 definition=await master.saveActivity({...definition.bundle,goals:[{...b.goal,unit:'copos'}]},definition.revision);q=(await plans.listByDate(today)).find(n=>n.id===q.id);assert.equal(q.quantity[0].unit,'garrafas');assert(q.quantity[0].retained);assert.equal(q.completedAt,null);
 await master.saveActivity({...definition.bundle,goals:[{...b.goal,unit:'copos',enabled:false}]},definition.revision);q=(await plans.listByDate(today)).find(n=>n.id===q.id);assert(q.quantity[0].archived);assert.equal(q.quantity[0].completed,1);assert(q.completedAt);
 const c=await activity({checks:true});let r=await create(c,today);r=await check(r,c.definition[0].id);let root=await master.getActivity(c.id);
 root=await master.saveActivity({...root.bundle,trackingMode:'quantity',goals:[{id:randomUUID(),activityId:c.id,metric:'count',unit:'execution',minimumTarget:2,period:'day',enabled:true,startsOn:'2026-01-01'}]},root.revision);
 r=(await plans.listByDate(today)).find(n=>n.id===r.id);assert.equal(r.goalTrackingModeSnapshot,'checklist');assert(r.checklist[0].completedAt);assert(r.checklist.every(n=>n.retained));assert.equal(r.quantity,undefined);
 const stable=r;await user(B);await assert.rejects(()=>db.query('select sync_open_activity_plans($1,$2,$3)',[c.id,root.revision,JSON.stringify({[r.id]:r.updatedAt})]),e=>e.code==='23503');await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select sync_open_activity_plans($1,$2,$3)',[c.id,root.revision,'{}']),e=>e.code==='42501');await user();assert.deepEqual((await plans.listByDate(today)).find(n=>n.id===r.id),stable);
});
