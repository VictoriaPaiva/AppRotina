import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authFixture} from '../helpers/account-fixtures.mjs';
const migration='20261101000400_goal_tracking_modes.sql';
const signatures=['public.save_activity_aggregate(jsonb,jsonb,integer)','routine_private.guard_daily_plan_item()'];
const catalog=async db=>(await db.query(`select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text,p.prosecdef,p.proconfig,p.provolatile,p.proparallel from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','routine_private') order by n.nspname,p.proname,p.oid::regprocedure::text`)).rows;
test('00400: explicit definitions match original Development chain, including ACLs and downstream patches; formatting independent',async()=>{
 const original=new PGlite(),fixed=new PGlite();
 try {
  const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const db of [original,fixed]){
   await db.exec(authFixture);
   for(const f of files.filter(f=>f<migration))await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  }
  // Semantically identical to Production's reported contract, with CRLF/tabs
  // and whitespace around assignments/commas that defeated the old replacements.
  for(const signature of signatures){
   const definition=(await fixed.query('select pg_get_functiondef($1::regprocedure) d',[signature])).rows[0].d;
   const varied=definition.replaceAll('\n','\r\n').replaceAll('      select','\tselect').replaceAll(':=',' := ').replaceAll(',ideal_duration_minutes',', ideal_duration_minutes');
   await fixed.exec(varied);
  }
  await assert.rejects(fixed.exec('begin;'+await readFile('tests/fixtures/goal-tracking-modes-original.sql','utf8')+';commit;'),/Unexpected snapshot contract/);
  await fixed.exec('rollback');
  await original.exec(await readFile('tests/fixtures/goal-tracking-modes-original.sql','utf8'));
  await fixed.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  assert.deepEqual(await catalog(fixed),await catalog(original));
  for(const f of files.filter(f=>f>migration)){
   const sql=await readFile('supabase/migrations/'+f,'utf8');
   await original.exec(sql);await fixed.exec(sql);
   assert.deepEqual(await catalog(fixed),await catalog(original),f);
  }
 }finally {await original.close();await fixed.close();}
});
