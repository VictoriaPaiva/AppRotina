import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';

const db=new PGlite();
const installer='progress_preflight_installer';
const executor='routine_progress_executor';
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
let candidate;
async function rows(sql,args=[]){return (await db.query(sql,args)).rows;}
async function installRole(){await db.exec(`reset role;set role ${installer}`);}
before(async()=>{
 await db.exec(`create role authenticated nologin;create role anon nologin;create role authenticator nologin;
 create role managed_auth_owner nologin;
 create role ${installer} nologin nosuperuser nobypassrls noinherit createrole;
 alter schema public owner to ${installer};
 create schema auth authorization managed_auth_owner;
 create table auth.users(id uuid primary key);
 alter table auth.users owner to managed_auth_owner;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 alter function auth.uid() owner to managed_auth_owner;
 revoke all on function auth.uid() from public;
 grant usage on schema auth to ${installer} with grant option;
 grant execute on function auth.uid() to ${installer} with grant option;
 grant references,trigger on auth.users to ${installer};
 grant usage on schema auth to authenticated,anon;
 grant execute on function auth.uid() to authenticated,anon;
 insert into auth.users values('${A}'),('${B}');`);
 const name=(await rows('select current_database() name'))[0].name;
 await db.exec(`grant create on database "${name.replaceAll('"','""')}" to ${installer}`);
 await installRole();
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.exec(`insert into public.areas(id,user_id,name) values('00000000-0000-4000-8000-000000000011','${A}','Preflight area');
 select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;
 select public.save_activity_aggregate(
 '{"id":"00000000-0000-4000-8000-000000000012","area_id":"00000000-0000-4000-8000-000000000011","name":"Preflight baseline","type":"variableActivity"}'::jsonb,
 '{"goals":[{"metric":"count","unit":"execution","minimum_target":1,"period":"day","starts_on":"2026-01-01"}]}'::jsonb,null);`);
 await installRole();
 await db.exec(`insert into public.areas(id,user_id,name) values('00000000-0000-4000-8000-000000000021','${B}','Other preflight area');
 select set_config('request.jwt.claim.sub','${B}',false);set role authenticated;
 select public.save_activity_aggregate(
 '{"id":"00000000-0000-4000-8000-000000000022","area_id":"00000000-0000-4000-8000-000000000021","name":"Other baseline","type":"variableActivity"}'::jsonb,
 '{"goals":[{"metric":"count","unit":"execution","minimum_target":1,"period":"day","starts_on":"2026-01-01"}]}'::jsonb,null);`);
 await installRole();await db.query("select set_config('request.jwt.claim.sub','',false)");
 candidate=await readFile('supabase/candidates/20261021000100_progress_history_candidate.sql','utf8');
});
after(async()=>{await db.exec('rollback;reset role');await db.close();});

test('preflight installer owns domain but is neither superuser nor BYPASSRLS',async()=>{
 const r=(await rows('select current_user u,rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname=current_user'))[0];
 assert.deepEqual(r,{u:installer,rolsuper:false,rolbypassrls:false,rolcreaterole:true});
 assert.equal((await rows("select pg_get_userbyid(relowner) owner from pg_class where oid='public.activities'::regclass"))[0].owner,installer);
});

test('plain candidate ownership transfer requires temporary SET membership and schema CREATE',async()=>{
 // Remove the narrowly scoped deployment fix to reproduce the former failure.
 const raw=candidate.replace(/-- PREFLIGHT TEMPORARY PRIVILEGES BEGIN[\s\S]*?-- PREFLIGHT TEMPORARY PRIVILEGES END/g,'')
  .replace(/-- PREFLIGHT CLEANUP BEGIN[\s\S]*?-- PREFLIGHT CLEANUP END/g,'');
 await assert.rejects(()=>db.exec(raw),e=>e.code==='42501');
 await db.exec('rollback');
 assert.equal((await rows('select 1 from pg_roles where rolname=$1',[executor])).length,0);
});

test('non-superuser can create flags but OWNER TO needs both independent privileges',async()=>{
 await db.exec(`begin;create role ${executor} nologin nosuperuser nobypassrls noinherit;
 create function public.preflight_owner_probe() returns integer language sql as $$select 1$$;`);
 await db.exec('savepoint missing_member');
 await assert.rejects(()=>db.exec(`alter function public.preflight_owner_probe() owner to ${executor}`),e=>e.code==='42501');
 await db.exec('rollback to missing_member');
 await db.exec(`grant ${executor} to ${installer} with inherit false,set true`);
 await db.exec('savepoint missing_create');
 await assert.rejects(()=>db.exec(`alter function public.preflight_owner_probe() owner to ${executor}`),e=>e.code==='42501');
 await db.exec('rollback to missing_create');
 await db.exec(`grant create on schema public to ${executor};alter function public.preflight_owner_probe() owner to ${executor};rollback`);
});

test('non-delegable managed Auth privileges abort deployment instead of accepting GRANT warnings',async()=>{
 await db.exec(`reset role;begin;
 revoke grant option for usage on schema auth from ${installer};
 revoke grant option for execute on function auth.uid() from ${installer};`);
 await installRole();
 await assert.rejects(()=>db.exec(candidate),e=>e.code==='42501' && e.message==='Required executor schema/function grants unavailable');
 await db.exec('rollback');await installRole();
 assert.equal((await rows('select 1 from pg_roles where rolname=$1',[executor])).length,0);
});

test('corrected full candidate installs under non-superuser and removes deployment privileges',async()=>{
 await db.exec(candidate);
 const role=(await rows('select rolcanlogin,rolsuper,rolbypassrls,rolinherit,rolcreaterole,rolcreatedb from pg_roles where rolname=$1',[executor]))[0];
 assert.deepEqual(role,{rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolinherit:false,rolcreaterole:false,rolcreatedb:false});
 const grants=(await rows("select has_schema_privilege($1,'public','CREATE') pub,has_schema_privilege($1,'routine_private','CREATE') priv,pg_has_role(current_user,$1,'SET') can_set",[executor]))[0];
 assert.deepEqual(grants,{pub:false,priv:false,can_set:false});
 const residual=await rows('select admin_option,inherit_option,set_option from pg_auth_members where roleid=to_regrole($1) and member=to_regrole($2)',[executor,installer]);
 assert.deepEqual(residual,[{admin_option:true,inherit_option:false,set_option:false}]);
 assert.equal((await rows("select count(*)::int n from pg_proc where proowner=(select oid from pg_roles where rolname=$1) and prosecdef",[executor]))[0].n,8);
 await db.exec('reset role');
 assert.equal((await rows("select count(*)::int n from activity_goal_versions where transition='baseline'"))[0].n,2);
 assert.equal((await rows("select count(*)::int n from pg_policy where polname='progress_install_backfill'"))[0].n,0);
 await installRole();
});

test('technical owner receives auth.uid and RLS identity, not owner bypass',async()=>{
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
 await db.exec('set role authenticated');
 await rows("select * from public.set_progress_timezone('UTC',null)");
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);
 await db.exec('set role authenticated');
 assert.equal((await rows('select * from public.get_progress_context()'))[0].configured,false);
 await rows("select * from public.set_progress_timezone('Europe/Lisbon',null)");
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
 await db.exec(`set role ${executor}`);
 assert.equal((await rows('select auth.uid() id'))[0].id,A);
 assert.equal((await rows('select * from user_temporal_preferences')).length,1);
 assert.equal((await rows('show row_security'))[0].row_security,'on');
 const functions=await rows("select proconfig from pg_proc where proowner=(select oid from pg_roles where rolname=$1) and prosecdef",[executor]);
 assert(functions.every(f=>f.proconfig.includes('row_security=on')));
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 await db.exec('set role authenticated');
 await assert.rejects(()=>rows('select * from public.get_progress_context()'),e=>e.code==='42501');
});

test('browser cannot SET technical role or write history; auth privileges must be delegable',async()=>{
 await db.exec('reset role;set role authenticated');
 assert.equal((await rows("select pg_has_role(current_user,$1,'SET') allowed",[executor]))[0].allowed,false);
 await assert.rejects(()=>db.exec('insert into activity_progress_logs default values'),e=>e.code==='42501');
 await installRole();
 await db.exec('begin;revoke execute on function auth.uid() from routine_progress_executor;');
 // A grant is ineffective when installer lacks owner/grant option: do not silently accept warnings.
 await db.exec('reset role;revoke grant option for execute on function auth.uid() from progress_preflight_installer;');
 await installRole();await db.exec('grant execute on function auth.uid() to routine_progress_executor;');
 assert.equal((await rows("select has_function_privilege($1,'auth.uid()','EXECUTE') allowed",[executor]))[0].allowed,false);
 await db.exec('rollback;reset role');
});

test('catalog-only preflight runs read-only and never returns claims/domain rows',async()=>{
 await installRole();
 await db.exec(await readFile('supabase/preflight/progress-role-readonly.sql','utf8'));
 assert.equal((await rows('select current_user u'))[0].u,installer);
});
