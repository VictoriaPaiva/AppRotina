import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {authFixture,A,B} from '../helpers/account-fixtures.mjs';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const {load}=createRequire(import.meta.url)('../helpers/load-typescript.cjs');
const {createIdeaRepository}=load('lib/ideas/repository.ts');
const db=new PGlite(),migration='20261118000200_idea_deletion.sql';
const transport={async query(sql,params){
  const result=await db.query(sql,params);
  for(const row of result.rows)if(Object.hasOwn(row,'updated_at')){
    const raw=(await db.query('select created_at::text c,updated_at::text u from ideas where id=$1',[row.id])).rows[0];
    const iso=value=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
    row.created_at=iso(raw.c);row.updated_at=iso(raw.u);
  }
  return result;
}};
const client=pgliteClient(transport,['ideas']),repo=createIdeaRepository(client,A);
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const create=()=>repo.create({id:randomUUID(),title:'Delete me',content:'Permanent content'});
const snapshot=idea=>({id:idea.id,expectedUpdatedAt:idea.updatedAt});
before(async()=>{
  await db.exec(authFixture);await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
});
after(()=>db.close());

test('migration enables only authenticated owner deletion; ideas has no incoming FK/dependent rows',async()=>{
  assert.equal((await db.query("select has_table_privilege('authenticated','public.ideas','DELETE') granted")).rows[0].granted,false);
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const info=(await db.query("select has_table_privilege('authenticated','public.ideas','DELETE') granted,has_table_privilege('anon','public.ideas','DELETE') anon,(select relrowsecurity from pg_class where oid='public.ideas'::regclass) rls,(select count(*)::int from pg_constraint where contype='f' and confrelid='public.ideas'::regclass) dependencies")).rows[0];
  assert.deepEqual(info,{granted:true,anon:false,rls:true,dependencies:0});await user();
});

test('permanent owner deletion, fresh list and missing/repeated deletion results; other ideas and CRUD remain intact',async()=>{
  const idea=await create(),kept=await create();await repo.delete(snapshot(idea));
  await assert.rejects(()=>repo.get(idea.id),e=>e.kind==='NotFound');
  await assert.rejects(()=>repo.delete(snapshot(idea)),e=>e.kind==='NotFound');
  await assert.rejects(()=>repo.delete({id:randomUUID(),expectedUpdatedAt:idea.updatedAt}),e=>e.kind==='NotFound');
  const fresh=createIdeaRepository(client,A);assert(!(await fresh.list()).some(i=>i.id===idea.id));assert.deepEqual(await fresh.get(kept.id),kept);
  const edited=await repo.update({...snapshot(kept),title:'Still editable',content:'Kept'});assert.equal(edited.title,'Still editable');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from ideas where id=$1',[idea.id])).rows[0].n,0);await user();
});

test('RLS rejects foreign deletion even with a spoofed repository owner; anon cannot DELETE',async()=>{
  const idea=await create();await user(B);const b=createIdeaRepository(client,B);
  await assert.rejects(()=>b.delete(snapshot(idea)),e=>e.kind==='NotFound');
  await assert.rejects(()=>repo.delete(snapshot(idea)),e=>e.kind==='NotFound');
  assert.equal((await db.query('delete from ideas where id=$1 returning id',[idea.id])).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('delete from ideas where id=$1',[idea.id]),e=>e.code==='42501');
  await user();assert.deepEqual(await repo.get(idea.id),idea);
});

test('stale delete does not erase a concurrent edit; current CAS can delete; owner injection is rejected',async()=>{
  const idea=await create(),changed=await repo.update({...snapshot(idea),title:'Updated elsewhere',content:'New content'});
  await assert.rejects(()=>repo.delete(snapshot(idea)),e=>e.kind==='Conflict');assert.deepEqual(await repo.get(idea.id),changed);
  await assert.rejects(()=>repo.delete({...snapshot(changed),user_id:B}),e=>e.kind==='Validation');
  await repo.delete(snapshot(changed));await assert.rejects(()=>repo.get(changed.id),e=>e.kind==='NotFound');
});
