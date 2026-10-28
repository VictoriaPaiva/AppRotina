import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {A,B,OWNER_TABLES,authFixture,seedAccount,snapshot} from '../helpers/account-fixtures.mjs';
const db=new PGlite();
before(async()=>{
  await db.exec(authFixture);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await seedAccount(db,A);await seedAccount(db,B);
});
after(()=>db.close());
test('all 16 tables have data and owner CASCADE; restricted and circular FKs are deliberately present',async()=>{
  for(const table of OWNER_TABLES)assert((await db.query('select count(*)::int n from '+table+' where user_id=$1',[A])).rows[0].n>0,table);
  const fks=(await db.query("select confdeltype from pg_constraint where contype='f' and confrelid='auth.users'::regclass and connamespace='public'::regnamespace")).rows;
  assert.equal(fks.length,16);assert(fks.every(f=>f.confdeltype==='c'));
  assert.equal((await db.query("select count(*)::int n from pg_constraint where contype='f' and confdeltype='r' and connamespace='public'::regnamespace")).rows[0].n,3);
});
test('any cascade failure atomically rolls back Auth, sessions, tokens and every functional row',async()=>{
  const a=await snapshot(db,A),b=await snapshot(db,B);
  await db.exec("create function public.reject_test_deletion() returns trigger language plpgsql as $$begin raise exception 'injected';end$$;create trigger reject_test_deletion before delete on ideas for each row execute function public.reject_test_deletion()");
  try {await assert.rejects(()=>db.query('delete from auth.users where id=$1',[A]),/injected/);assert.deepEqual(await snapshot(db,A),a);assert.deepEqual(await snapshot(db,B),b);}
  finally {await db.exec('drop trigger reject_test_deletion on ideas;drop function public.reject_test_deletion()');}
});
test('ordinary A cannot delete Auth A/B or call an arbitrary-target deletion function',async()=>{
  await db.exec('set role authenticated');
  try {await assert.rejects(()=>db.query('delete from auth.users where id=$1',[B]),e=>e.code==='42501');}
  finally {await db.exec('reset role');}
  assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname in ('delete_account','delete_user')")).rows[0].n,0);
  assert.equal((await db.query("select has_function_privilege('authenticated','routine_private.before_account_delete()','EXECUTE') allowed")).rows[0].allowed,false);
});
test('an unreviewed future owner table blocks deletion without changing either account',async()=>{
  const a=await snapshot(db,A),b=await snapshot(db,B);
  await db.exec('create table public.future_test_data(user_id uuid)');
  try {await assert.rejects(()=>db.query('delete from auth.users where id=$1',[A]),e=>e.code==='23503');assert.deepEqual(await snapshot(db,A),a);assert.deepEqual(await snapshot(db,B),b);}
  finally {await db.exec('drop table public.future_test_data');}
});
test('hard Auth deletion cascades all 16 tables and sessions/tokens; B byte-equivalent; no schema change; retry safe',async()=>{
  const b=await snapshot(db,B),schema=(await db.query("select oid,pg_get_constraintdef(oid) d from pg_constraint order by oid")).rows;
  await db.query('delete from auth.users where id=$1',[A]);
  const a=await snapshot(db,A);for(const [table,rows] of Object.entries(a))assert.deepEqual(rows,[],table);
  assert.deepEqual(await snapshot(db,B),b);assert.deepEqual((await db.query("select oid,pg_get_constraintdef(oid) d from pg_constraint order by oid")).rows,schema);
  assert.deepEqual((await db.query('delete from auth.users where id=$1 returning id',[A])).rows,[]);
  // An issued JWT subject alone cannot recreate data: every owned row still needs a live Auth FK.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
  try {await assert.rejects(()=>db.query("insert into areas(user_id,name) values($1,'Stale JWT')",[A]),e=>e.code==='23503');assert.deepEqual((await db.query('select * from ideas')).rows,[]);}
  finally {await db.exec('reset role');}
});
