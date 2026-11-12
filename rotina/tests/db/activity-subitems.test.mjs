import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
import {A,B,authFixture} from '../helpers/account-fixtures.mjs';
const db=new PGlite();
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const node=(name,minutes,parentId=null)=>({id:randomUUID(),parentId,name,durationMinutes:minutes,sortOrder:0,active:true,defaultSelected:true});
async function activity(mode='all'){
  const area=randomUUID(),id=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
  const sala=node('Sala',1),kitchen=node('Cozinha',1),bath=node('Banheiro',30);
  const items=[sala,kitchen,bath,node('Pano',15,sala.id),node('Sofá',15,sala.id),node('Armário',15,sala.id),node('Louça',20,kitchen.id),node('Organizar',30,kitchen.id)];
  const tree={mode,items};
  const result=(await db.query("select save_activity_with_subitems($1,'{}',null,$2) v",[JSON.stringify({id,name:'Faxina',area_id:area,type:'variableActivity'}),JSON.stringify(tree)])).rows[0].v;
  return {id,tree,revision:result.activity.revision};
}
const expected=p=>({updatedAt:p.updated_at,completedAt:p.completed_at,plannedDate:p.planned_date});
const configuration=p=>p.subitem_snapshot.map(n=>({id:n.id,selected:n.selected,overrideMinutes:n.overrideMinutes}));
async function plan(a,date='2026-11-01',config=null){return (await db.query('select create_plan_with_subitems($1,$2,$3,$4,$5) v',[randomUUID(),a.id,date,a.revision,config===null?null:JSON.stringify(config)])).rows[0].v;}
async function configure(p,config){return (await db.query('select change_plan_subitems($1,$2,$3) v',[p.id,JSON.stringify(expected(p)),JSON.stringify(config)])).rows[0].v;}
async function complete(p,id,done){return (await db.query('select change_plan_subitems($1,$2,null,$3,$4) v',[p.id,JSON.stringify(expected(p)),id,done])).rows[0].v;}
before(async()=>{await db.exec(authFixture);await db.query('insert into auth.users(id) values($1),($2)',[A,B]);for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));await user();});
after(()=>db.close());

test('existing Activity edit matrix: actual draft/build -> write boundary -> repository -> SQL',async()=>{
  const master=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository(pgliteClient(db,['activities','activity_subitems','areas']));
  const {createDraft,buildBundle}=load('lib/banco-mestre/editor.ts');
  const {saveBancoMestreActivity}=load('lib/banco-mestre/data/write-model.ts');
  for(const mode of ['legacy','all','none','custom']){
    const a=await activity(mode==='legacy'?'all':mode);
    if(mode==='legacy'){
      await db.query('select delete_activity_subitem_branches($1,$2,$3::uuid[])',[a.id,a.revision,a.tree.items.map(n=>n.id)]);
    }
    let saved=await master.getActivity(a.id);
    const edit=async mutate=>{
      const prior=saved,draft=createDraft(prior.bundle),tree=structuredClone(prior.bundle.subitems??{mode:'all',items:[]});
      const deleted=[];mutate(draft,tree,deleted);
      const built=buildBundle(draft,[{id:prior.bundle.activity.areaId,name:'Area',active:true}],a.id,new Date().toISOString(),prior.bundle.activity);
      assert.equal(built.ok,true,`${mode}: local draft validation`);
      if(prior.bundle.subitems||tree.items.length||tree.mode!=='all')built.bundle.subitems=tree;
      const result=await saveBancoMestreActivity(async()=>master,{mode:'edit',bundle:built.bundle,expectedRevision:prior.revision,...(deleted.length?{deletedSubitemIds:deleted}:{})});
      assert.equal(result.ok,true,`${mode}: ${JSON.stringify(result)}`);
      saved=await master.getActivity(a.id);assert(saved.revision>prior.revision);
      return {prior,result};
    };
    await edit(draft=>{draft.name='Edited mother';draft.description='Edited description';});
    if(mode==='legacy'){await edit(draft=>{draft.durationMode='fixed';draft.hours='1';draft.minutes='5';});assert.equal(saved.bundle.activity.duration.minutes,65);continue;}
    await edit((_draft,tree)=>{const leaf=tree.items.find(n=>!tree.items.some(c=>c.parentId===n.id));leaf.name='Edited leaf';leaf.durationMinutes=19;});
    const added=node('Added leaf',9,a.tree.items[0].id);
    await edit((_draft,tree)=>{tree.items.push(added);});
    if(mode==='custom')await edit((_draft,tree)=>{tree.items.find(n=>n.id===added.id).defaultSelected=false;});
    await edit((_draft,tree,deleted)=>{tree.items=tree.items.filter(n=>n.id!==added.id);deleted.push(added.id);});
    await edit((_draft,tree,deleted)=>{const ids=load('lib/activities/subitems.ts').branchIds(tree.items,tree.items[0].id);deleted.push(...ids);tree.items=tree.items.filter(n=>!ids.has(n.id));});
  }
});

async function removePersisted(a,ids,tree={...a.tree,items:a.tree.items.filter(n=>!ids.includes(n.id))},revision=a.revision){
  const areaId=(await db.query('select area_id from activities where id=$1',[a.id])).rows[0]?.area_id;
  return (await db.query("select save_activity_with_subitem_deletions($1,'{}',$2,$3,$4::uuid[]) v",[
    JSON.stringify({id:a.id,name:'Faxina',type:'variableActivity',area_id:areaId}),revision,JSON.stringify(tree),ids,
  ])).rows[0].v;
}

test('delete persisted leaf via repository: derived 125→110, sibling order/custom defaults and old plan stay intact',async()=>{
  const a=await activity('custom'),p=await plan(a),master=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository(pgliteClient(db,['activities','activity_subitems','areas']));
  const saved=await master.getActivity(a.id),leaf=a.tree.items[4],old=structuredClone(p);
  const next={...saved.bundle,subitems:{...a.tree,items:a.tree.items.filter(n=>n.id!==leaf.id)}};
  const result=await master.saveActivity(next,saved.revision,[leaf.id]);
  assert.equal(result.bundle.activity.duration.minutes,110);assert(result.revision>saved.revision);
  assert.equal(result.bundle.subitems.mode,'custom');
  assert.deepEqual(result.bundle.subitems.items.map(n=>n.id).sort(),next.subitems.items.map(n=>n.id).sort());
  for(const n of next.subitems.items){const persisted=result.bundle.subitems.items.find(x=>x.id===n.id);assert.equal(persisted.sortOrder,n.sortOrder);assert.equal(persisted.defaultSelected,n.defaultSelected);}
  assert.equal((await db.query('select count(*) n from activity_subitems where id=$1',[leaf.id])).rows[0].n,0);
  assert.deepEqual((await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[p.id])).rows[0].v,old);
  const fresh=await plan({...a,revision:result.revision},'2026-11-05');assert.equal(fresh.planned_duration_minutes,110);assert(!fresh.subitem_snapshot.some(n=>n.id===leaf.id));
  const done=await complete(p,leaf.id,true);assert(done.subitem_snapshot.find(n=>n.id===leaf.id).completedAt);
  await assert.rejects(()=>master.saveActivity(next,saved.revision,[leaf.id]),e=>e.kind==='Conflict');
});

test('delete multilevel branch removes descendants only; all definitions can be removed without stale derived duration',async()=>{
  const a=await activity(),grand=node('Neto',8,a.tree.items[3].id);a.tree.items.push(grand);
  await db.query('select save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(a.tree)]);a.revision++;
  const p=await plan(a),sub=load('lib/activities/subitems.ts'),ids=[...sub.branchIds(a.tree.items,a.tree.items[0].id)];
  const saved=await removePersisted(a,ids);assert.equal(saved.activity.duration_minutes,80);assert.equal(saved.subitem_tree.items.length,4);
  assert(!saved.subitem_tree.items.some(n=>ids.includes(n.id)));
  const fresh=await plan({...a,revision:saved.activity.revision},'2026-11-06');assert.equal(fresh.planned_duration_minutes,80);
  const all=saved.subitem_tree.items.map(n=>n.id);
  const empty=await removePersisted({...a,tree:saved.subitem_tree,revision:saved.activity.revision},all);
  assert.equal(empty.activity.duration_mode,'unknown');assert.equal(empty.activity.duration_minutes,null);
  assert.equal((await db.query('select count(*) n from activity_subitems where root_activity_id=$1',[a.id])).rows[0].n,0);
  assert.deepEqual((await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[p.id])).rows[0].v,p);
});

test('delete admission: owner-only, cross-tree denial, explicit full branch, stale CAS and rollback preserve definitions',async()=>{
  const grants=(await db.query("select proname,prosecdef,proconfig,has_function_privilege('authenticated',oid,'execute') own,has_function_privilege('anon',oid,'execute') anon from pg_proc where pronamespace='public'::regnamespace and proname in ('delete_activity_subitem_branches','save_activity_with_subitem_deletions') order by proname")).rows;
  assert.equal(grants.length,2);assert(grants.every(n=>n.own&&!n.anon&&n.proconfig.includes('search_path=pg_catalog, public')));
  assert.equal(grants[0].prosecdef,true);assert.equal(grants[1].prosecdef,false);
  const a=await activity(),other=await activity(),leaf=a.tree.items[3],parent=a.tree.items[0];
  const read=async()=>(await db.query('select get_activity_aggregate($1) v',[a.id])).rows[0].v;
  const before=await read();
  await assert.rejects(()=>removePersisted(a,[other.tree.items[0].id]),e=>e.code==='23503');
  await assert.rejects(()=>removePersisted(a,[parent.id]),e=>e.code==='23514');
  await assert.rejects(()=>removePersisted(a,[leaf.id],a.tree),e=>e.code==='23514');
  await assert.rejects(()=>removePersisted(a,[leaf.id],undefined,a.revision+1),e=>e.code==='40001');
  const invalid={...a.tree,items:a.tree.items.filter(n=>n.id!==leaf.id).map(n=>n.id===parent.id?{...n,name:''}:n)};
  await assert.rejects(()=>removePersisted(a,[leaf.id],invalid),e=>e.code==='23514');
  assert.deepEqual(await read(),before,'invalid save must roll back deletion, duration, revision and timestamps');
  await user(B);
  await assert.rejects(()=>removePersisted(a,[leaf.id]),e=>e.code==='23503');
  await assert.rejects(()=>db.query('select delete_activity_subitem_branches($1,$2,$3::uuid[])',[a.id,a.revision,[leaf.id]]),e=>e.code==='23503');
  await user();assert.deepEqual(await read(),before);
  await assert.rejects(()=>db.query('delete from activity_subitems where id=$1',[leaf.id]),e=>e.code==='42501');
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>db.query('select delete_activity_subitem_branches($1,$2,$3::uuid[])',[a.id,a.revision,[leaf.id]]),e=>e.code==='42501');
  await assert.rejects(()=>db.query("select save_activity_with_subitem_deletions('{}','{}',1,'{}',$1::uuid[])",[[leaf.id]]),e=>e.code==='42501');
  await user();
});
test('Faxina snapshot totals 125 / 95 / 45, group override 30 and occurrence independence',async()=>{
  const a=await activity(),p=await plan(a),b=await plan(a,'2026-11-03');assert.equal(p.planned_duration_minutes,125);
  assert.equal((await db.query('select duration_minutes from activities where id=$1',[a.id])).rows[0].duration_minutes,125);
  const bath=a.tree.items.find(n=>n.name==='Banheiro'),sala=a.tree.items.find(n=>n.name==='Sala');
  const withoutBath=configuration(p).map(n=>n.id===bath.id?{...n,selected:false}:n);
  const changed=await configure(p,withoutBath);assert.equal(changed.planned_duration_minutes,95);
  const onlySala=configuration(changed).map(n=>({...n,selected:n.id===sala.id||a.tree.items.find(i=>i.id===n.id).parentId===sala.id}));
  const single=await configure(changed,onlySala);assert.equal(single.planned_duration_minutes,45);
  const override=await configure(single,configuration(single).map(n=>n.id===sala.id?{...n,overrideMinutes:30}:n));assert.equal(override.planned_duration_minutes,30);
  assert.equal((await db.query('select planned_duration_minutes from daily_plan_items where id=$1',[b.id])).rows[0].planned_duration_minutes,125);
  assert.equal((await db.query('select duration_minutes from activity_subitems where id=$1',[sala.id])).rows[0].duration_minutes,1);
  await assert.rejects(()=>configure(p,withoutBath),e=>e.code==='40001');
});
test('all/none/custom and inactive ancestor exclude descendants only in new snapshots; history frozen',async()=>{
  const none=await activity('none'),np=await plan(none);assert.equal(np.planned_duration_minutes,0);assert(np.subitem_snapshot.every(n=>!n.selected));
  const a=await activity('custom');a.tree.items.forEach(n=>{n.defaultSelected=n.name==='Banheiro';});
  await db.query('select public.save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(a.tree)]);a.revision++;
  const p=await plan(a);assert.equal(p.planned_duration_minutes,30);
  const original=structuredClone(p.subitem_snapshot);
  a.tree.items.forEach(n=>{if(n.name==='Banheiro'){n.name='Renamed';n.active=false;n.durationMinutes=99;}if(n.name==='Sala')n.active=false;});
  await db.query('select public.save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(a.tree)]);a.revision++;
  const next=await plan(a,'2026-11-04');assert(!next.subitem_snapshot.some(n=>n.name==='Pano'||n.name==='Renamed'));
  assert.deepEqual((await db.query('select subitem_snapshot from daily_plan_items where id=$1',[p.id])).rows[0].subitem_snapshot,original);
  await assert.rejects(()=>plan({...a,revision:a.revision-1},'2026-11-05'),e=>e.code==='40001');
});
test('completion leaves, partial parent, completing group, reopening and direct mother complete synchronize atomically',async()=>{
  const a=await activity(),initial=await plan(a),sala=a.tree.items.find(n=>n.name==='Sala'),pano=a.tree.items.find(n=>n.name==='Pano');
  let p=await complete(initial,pano.id,true);assert.equal(p.completed_at,null);assert.equal(p.subitem_snapshot.find(n=>n.id===sala.id).completedAt,null);
  p=await complete(p,sala.id,true);assert(p.subitem_snapshot.find(n=>n.id===sala.id).completedAt);assert.equal(p.completed_at,null);
  await db.query('update daily_plan_items set completed_at=now() where id=$1',[p.id]);
  p=(await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[p.id])).rows[0].v;
  assert(p.completed_at);assert(p.subitem_snapshot.filter(n=>n.selected).every(n=>n.completedAt));
  p=await complete(p,pano.id,false);assert.equal(p.completed_at,null);assert.equal(p.subitem_snapshot.find(n=>n.id===sala.id).completedAt,null);
  await db.query('update daily_plan_items set completed_at=now() where id=$1',[p.id]);
  await db.query('update daily_plan_items set completed_at=null where id=$1',[p.id]);
  p=(await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[p.id])).rows[0].v;assert(p.subitem_snapshot.every(n=>n.completedAt===null));
  const config=configuration(p).map(n=>({...n,selected:n.id===pano.id}));p=await configure(p,config);p=await complete(p,pano.id,true);assert(p.completed_at);
});
test('ownership, direct grants, cross-tree snapshots, immutable parents/cycles and failed aggregate rollback',async()=>{
  const a=await activity(),b=await activity(),p=await plan(a);
  await assert.rejects(()=>configure(p,configuration(p).map((n,i)=>i===0?{...n,id:b.tree.items[0].id}:n)),e=>e.code==='23514');
  await assert.rejects(()=>db.query('update daily_plan_items set subitem_snapshot=$1 where id=$2',[JSON.stringify([]),p.id]),e=>e.code==='42501');
  await assert.rejects(()=>db.query('delete from activity_subitems where root_activity_id=$1',[a.id]),e=>e.code==='42501');
  const bad=structuredClone(a.tree);bad.items[0].parentId=bad.items.at(-1).id;
  await assert.rejects(()=>db.query('select public.save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(bad)]),e=>e.code==='23514');
  const before=(await db.query('select revision,name from activities where id=$1',[a.id])).rows[0];
  const areaId=(await db.query('select area_id from activities where id=$1',[a.id])).rows[0].area_id;
  await assert.rejects(()=>db.query("select save_activity_with_subitems($1,'{}',$2,$3)",[JSON.stringify({id:a.id,name:'Must rollback',type:'variableActivity',area_id:areaId}),a.revision,JSON.stringify(bad)]));
  assert.deepEqual((await db.query('select revision,name from activities where id=$1',[a.id])).rows[0],before);
  const x=randomUUID(),y=randomUUID(),cycle={mode:'all',items:[{...node('X',1),id:x,parentId:y},{...node('Y',1),id:y,parentId:x},...a.tree.items]};
  await assert.rejects(()=>db.query('select public.save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(cycle)]),e=>e.code==='23514');
  await user(B);assert.equal((await db.query('select * from activity_subitems where root_activity_id=$1',[a.id])).rows.length,0);
  await assert.rejects(()=>plan(a,'2026-11-07'),e=>e.code==='23503');await assert.rejects(()=>complete(p,a.tree.items[0].id,true),e=>e.code==='23503');
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from activity_subitems'),e=>e.code==='42501');await user();
});

test('repositories round-trip aggregate/tree and occurrence RPCs; old plans survive root deactivation',async()=>{
  const iso=s=>s.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
  const transport={async query(sql,args){const result=await db.query(sql,args);for(const row of result.rows)if(row.activity_id&&row.updated_at){const raw=(await db.query('select planned_date::text d,created_at::text c,updated_at::text u,completed_at::text x from daily_plan_items where id=$1',[row.id])).rows[0];row.planned_date=raw.d;row.created_at=iso(raw.c);row.updated_at=iso(raw.u);row.completed_at=raw.x===null?null:iso(raw.x);}return result;}};
  const client=pgliteClient(transport,['activity_subitems','activities','daily_plan_items','areas']);
  const master=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository(client);
  const plans=load('lib/planning/repository.ts').createPlanRepository(client,A),{planSnapshot}=load('lib/planning/contracts.ts'),domain=load('lib/activities/subitems.ts');
  const a=await activity(),before=await master.getActivity(a.id);assert.equal(before.bundle.subitems.items.length,8);
  before.bundle.activity.name='Saved hierarchy';const saved=await master.saveActivity(before.bundle,before.revision);assert(saved.revision>before.revision);assert.deepEqual(await master.getActivity(a.id),saved);
  assert((await master.listSubitems()).some(n=>n.rootActivityId===a.id));
  let p=await plans.create({id:randomUUID(),activityId:a.id,plannedDate:'2026-11-10',sourceRevision:saved.revision,configuration:domain.selectionPayload(domain.initialSelection(saved.bundle.subitems))});
  assert.equal(p.plannedDurationMinutes,125);assert.equal(p.activityNameSnapshot,'Saved hierarchy');
  const ids=domain.branchIds(a.tree.items,a.tree.items[0].id);
  p=await plans.configureSubitems({id:p.id,expected:planSnapshot(p),configuration:domain.selectionPayload(p.subitems).map(n=>({...n,selected:ids.has(n.id)}))});assert.equal(p.plannedDurationMinutes,45);
  p=await plans.completeSubitem({id:p.id,expected:planSnapshot(p),subitemId:a.tree.items[3].id,completed:true});assert.equal(p.completedAt,null);
  p=await plans.setCompleted({id:p.id,expected:planSnapshot(p),completed:true});assert(p.completedAt);assert(p.subitems.filter(n=>n.selected).every(n=>n.completedAt));
  p=await plans.setCompleted({id:p.id,expected:planSnapshot(p),completed:false});const frozen=structuredClone(p.subitems);
  p=await plans.reschedule({id:p.id,expected:planSnapshot(p),plannedDate:'2026-11-11'});assert.deepEqual(p.subitems,frozen);
  saved.bundle.activity.status='inactive';await master.saveActivity(saved.bundle,saved.revision);
  await assert.rejects(()=>plans.create({id:randomUUID(),activityId:a.id,plannedDate:'2026-11-12',sourceRevision:saved.revision}),e=>e.kind==='NotFound');
  p=await plans.setCompleted({id:p.id,expected:planSnapshot(p),completed:true});assert(p.completedAt);
});

test('grandchildren and deeper descendants derive without duplication; same-user cross-tree parent and invalid overrides denied',async()=>{
  const a=await activity(),surface=node('Surface',1,a.tree.items[3].id),leaf=node('Finish',5,surface.id);
  a.tree.items.push(surface,leaf);
  await db.query('select save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(a.tree)]);a.revision++;
  let p=await plan(a);assert.equal(p.planned_duration_minutes,115);
  p=await complete(p,leaf.id,true);assert(p.subitem_snapshot.find(n=>n.id===surface.id).completedAt);assert(p.subitem_snapshot.find(n=>n.id===a.tree.items[3].id).completedAt);
  for(const override of [0,-1,1.5])await assert.rejects(()=>configure(p,configuration(p).map(n=>n.id===leaf.id?{...n,overrideMinutes:override}:n)),e=>['23514','22003','22023'].includes(e.code));
  const other=await activity(),cross=structuredClone(a.tree);cross.items.push(node('Cross',1,other.tree.items[0].id));
  await assert.rejects(()=>db.query('select save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(cross)]),e=>e.code==='23514');
});

test('groups with only inactive leaves do not become fake selectable leaves; old snapshots remain executable',async()=>{
  const a=await activity(),old=await plan(a);
  a.tree.items.forEach(n=>{if(!a.tree.items.some(c=>c.parentId===n.id))n.active=false;});
  await db.query('select save_activity_subitems($1,$2,$3)',[a.id,a.revision,JSON.stringify(a.tree)]);a.revision++;
  const root=(await db.query('select duration_mode,duration_minutes from activities where id=$1',[a.id])).rows[0];assert.equal(root.duration_mode,'unknown');assert.equal(root.duration_minutes,null);
  await assert.rejects(()=>plan(a,'2026-11-08'),e=>e.code==='23514');
  const oldLeaf=old.subitem_snapshot.find(n=>n.name==='Pano');const done=await complete(old,oldLeaf.id,true);assert(done.subitem_snapshot.find(n=>n.id===oldLeaf.id).completedAt);
});

test('legacy/direct aggregate duration writes cannot override a parent derived duration',async()=>{
  const a=await activity();await db.query("update activities set duration_mode='fixed',duration_minutes=999 where id=$1",[a.id]);
  const root=(await db.query('select duration_mode,duration_minutes from activities where id=$1',[a.id])).rows[0];assert.deepEqual(root,{duration_mode:'fixed',duration_minutes:125});
});
