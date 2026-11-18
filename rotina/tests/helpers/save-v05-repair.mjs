import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {authFixture,A} from './account-fixtures.mjs';

export const repairMigration='20261118000100_restore_save_activity_v05_snapshots.sql';
const originalMigration='20261102000200_sync_open_goal_occurrences.sql';
const signature='public.save_activity_v05(jsonb,jsonb,integer,jsonb,uuid[],jsonb)';
const catalog=async db=>(await db.query(`select n.nspname,p.oid::regprocedure::text signature,
 p.prosecdef,p.proconfig,p.proacl::text,pg_get_userbyid(p.proowner) owner,
 pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','routine_private') and p.prokind='f'
 order by n.nspname,p.oid::regprocedure::text`)).rows;

export async function installSaveV05Repair(db,{broken=true}={}) {
  await db.exec(authFixture);
  for(const file of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')&&n<originalMigration).sort())
    await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  if(broken) {
    const definition=(await db.query('select pg_get_functiondef($1::regprocedure) d',[signature])).rows[0].d;
    // Reproduce only: the production repair itself never transforms stored source.
    await db.exec(definition.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
  }
  await db.exec(await readFile('supabase/migrations/'+originalMigration,'utf8'));
  const partial=(await db.query('select prosrc from pg_proc where oid=$1::regprocedure',[signature])).rows[0].prosrc;
  assert(partial.includes('old_def jsonb;'));
  assert(partial.includes('into new_def'));
  assert.equal(partial.includes('into old_def'),!broken);
  assert.equal(partial.includes('into tokens'),!broken);

  await db.query('insert into auth.users(id) values($1)',[A]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
  await db.exec('set role authenticated');
  const area=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Regression area')",[area,A]);
  const save=(activity,relations={},checks=[],revision=null)=>db.query(
    'select save_activity_v05($1,$2,$3,null,$4::uuid[],$5) v',
    [JSON.stringify(activity),JSON.stringify(relations),revision,[],JSON.stringify(checks)]
  );
  if(broken) {
    for(const mode of ['quantity','checklist']) {
      const id=randomUUID();
      const activity={id,area_id:area,name:'Beber água',type:'checklistGoal',duration_mode:'unknown',goal_tracking_mode:mode};
      const relations=mode==='quantity'?{goals:[{id:randomUUID(),metric:'count',unit:'execution',minimum_target:3,period:'day',starts_on:'2026-01-01'}]}:{};
      const checks=mode==='checklist'?[{id:randomUUID(),label:'Garrafa 1'},{id:randomUUID(),label:'Garrafa 2'},{id:randomUUID(),label:'Garrafa 3'}]:[];
      await assert.rejects(()=>save(activity,relations,checks),e=>e.code==='23514'&&e.message.includes('Invalid plan snapshots'));
      assert.equal((await db.query('select count(*)::int n from activities where id=$1',[id])).rows[0].n,0,'failed save rolls back the Activity');
    }
  }
  await db.exec('reset role');
  const before=await catalog(db);
  await db.exec(await readFile('supabase/migrations/'+repairMigration,'utf8'));
  const after=await catalog(db);
  const metadata=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='definition')));
  assert.deepEqual(metadata(after),metadata(before),'preserve signatures, owner, ACLs, security and settings');
  const isSave=row=>row.signature.startsWith('save_activity_v05(');
  assert.deepEqual(after.filter(row=>!isSave(row)),before.filter(row=>!isSave(row)),'only save_activity_v05 changes');
  return {area,save,catalog:after};
}

export async function verifySaveV05Repair(db,{area,save}) {
  // Instrument only the disposable database. Retain and call the real sync;
  // capture its actual arguments so a skipped creation sync cannot mask NULL.
  await db.exec(`
    create table public.regression_sync_calls(call_order bigint generated always as identity,activity_id uuid,expected jsonb not null);
    alter function public.sync_open_activity_plans(uuid,integer,jsonb) rename to regression_real_sync;
    create function public.sync_open_activity_plans(p_activity_id uuid,p_expected_revision integer,p_expected_plans jsonb)
    returns void language plpgsql security definer set search_path=pg_catalog,public as $$
    begin
      if p_expected_plans is null then raise exception 'Regression: NULL sync tokens';end if;
      insert into public.regression_sync_calls(activity_id,expected) values(p_activity_id,p_expected_plans);
      perform public.regression_real_sync(p_activity_id,p_expected_revision,p_expected_plans);
    end $$;
    revoke all on function public.sync_open_activity_plans(uuid,integer,jsonb) from public,anon;
    grant execute on function public.sync_open_activity_plans(uuid,integer,jsonb) to authenticated;
  `);
  await db.exec('set role authenticated');
  const today=(await db.query("select (transaction_timestamp() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
  const quantity={id:randomUUID(),area_id:area,name:'Beber água',type:'checklistGoal',duration_mode:'unknown',goal_tracking_mode:'quantity'};
  const goal={id:randomUUID(),metric:'count',unit:'execution',minimum_target:3,period:'day',starts_on:'2026-01-01'};
  let saved=(await save(quantity,{goals:[goal]})).rows[0].v;
  const checklist={...quantity,id:randomUUID(),name:'Three bottles',goal_tracking_mode:'checklist'};
  const checks=[1,2,3].map(i=>({id:randomUUID(),label:'Garrafa '+i}));
  const checked=(await save(checklist,{},checks)).rows[0].v;
  assert.equal(checked.activity.checklist_items.length,3);
  assert.equal(Number(saved.goals[0].minimum_target),3);

  const plan=async(id,offset=0)=>(await db.query('select create_daily_plan_v05($1,$2,$3::date+$4::integer,null,null,null) v',[randomUUID(),id,today,offset])).rows[0].v;
  const expected=p=>({updatedAt:p.updated_at,completedAt:p.completed_at,plannedDate:p.planned_date});
  let q=await plan(quantity.id),c=await plan(checklist.id);
  q=(await db.query("select change_daily_plan_v05($1,$2,'quantity',$3) v",[q.id,JSON.stringify(expected(q)),JSON.stringify({goalId:goal.id,unitIndex:0,completed:true})])).rows[0].v;
  c=(await db.query("select change_daily_plan_v05($1,$2,'check',$3) v",[c.id,JSON.stringify(expected(c)),JSON.stringify({id:checks[0].id,completed:true})])).rows[0].v;
  const future=await plan(quantity.id,1),past=await plan(quantity.id,-1);
  const toClose=await plan(quantity.id,2);
  const closed=(await db.query('update daily_plan_items p set completed_at=clock_timestamp() where id=$1 returning to_jsonb(p) v',[toClose.id])).rows[0].v;
  const priorToken=q.updated_at;
  saved=(await save(quantity,{goals:[{...goal,minimum_target:4}]},[],saved.activity.revision)).rows[0].v;
  const readPlan=async id=>(await db.query('select to_jsonb(p) v from daily_plan_items p where id=$1',[id])).rows[0].v;
  q=await readPlan(q.id);assert.equal(Number(q.quantity_snapshot[0].target),4);
  assert.deepEqual(q.quantity_snapshot[0].checked,[0]);assert.equal(Number(q.quantity_snapshot[0].completed),1);
  assert.notEqual(q.updated_at,priorToken);
  assert.equal(Number((await readPlan(future.id)).quantity_snapshot[0].target),4);
  assert.deepEqual(await readPlan(past.id),past,'past snapshots remain frozen');
  assert.deepEqual(await readPlan(closed.id),closed,'completed snapshots remain frozen');
  const renamed=[{...checks[0],label:'Garrafa 1 editada'},checks[1],checks[2],{id:randomUUID(),label:'Garrafa 4'}];
  await save(checklist,{},renamed,checked.activity.revision);
  c=await readPlan(c.id);assert.equal(c.checklist_snapshot.length,4);
  assert(c.checklist_snapshot[0].completedAt);assert.equal(c.checklist_snapshot[0].label,'Garrafa 1 editada');
  // Description does not enter the definition fingerprint and must not sync.
  await save({...quantity,description:'Only description'}, {goals:[{...goal,minimum_target:4}]},[],saved.activity.revision);
  assert.deepEqual(await readPlan(q.id),q);
  await assert.rejects(()=>save(quantity,{goals:[goal]},[],1),e=>e.code==='PT409');

  await db.exec('reset role');
  const calls=(await db.query('select activity_id,expected from regression_sync_calls order by call_order')).rows;
  assert.equal(calls.length,4,'two creations and two definition edits; no description/stale sync');
  assert.deepEqual(calls.slice(0,2).map(row=>row.expected),[{},{}]);
  assert.equal((await db.query('select $1::timestamptz=$2::timestamptz same',[calls[2].expected[q.id],priorToken])).rows[0].same,true,'capture exact CAS timestamp before save/sync');
  assert.deepEqual(Object.keys(calls[2].expected).sort(),[q.id,future.id].sort(),'only open today/future plans are captured');
  assert.equal((await db.query('select $1::timestamptz=$2::timestamptz same',[calls[2].expected[future.id],future.updated_at])).rows[0].same,true);
  assert.equal(Object.keys(calls[3].expected)[0],c.id);
}
