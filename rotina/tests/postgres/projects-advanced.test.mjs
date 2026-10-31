// Independent sessions on a disposable loopback cluster only; never reads a remote URL.
import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const port=Number(process.env.ROTINA_PG_PORT),data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data||!resolve(data).startsWith(resolve('node_modules/.cache/rotina-pg-concurrency')))throw Error('Use the disposable localhost runner.');
test('V0.3 PostgreSQL: concurrent child creation and exact-snapshot edits preserve hierarchy and completion',async()=>{
  const clients=Array.from({length:3},()=>new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000}));
  const [admin,a,b]=clients;
  await Promise.all(clients.map(c=>c.connect()));
  try {
    const info=(await admin.query("select current_setting('data_directory') d,current_setting('listen_addresses') h,current_setting('server_version_num') v")).rows[0];
    assert.equal(await realpath(info.d),await realpath(data));assert.equal(info.h,'127.0.0.1');assert.equal(Math.floor(Number(info.v)/10000),17);
    const owner=randomUUID(),project=randomUUID(),root=randomUUID();
    await admin.query(`create role authenticated nologin;create role anon nologin;create schema auth;create schema routine_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    await admin.query('insert into auth.users values($1)',[owner]);
    for(const file of ['20261027000100_projects.sql','20261031000100_projects_advanced.sql'])await admin.query(await readFile('supabase/migrations/'+file,'utf8'));
    await admin.query("insert into projects(id,user_id,title) values($1,$2,'Concurrent')",[project,owner]);
    await admin.query("insert into project_tasks(id,user_id,project_id,title) values($1,$2,$3,'Root')",[root,owner,project]);
    for(const client of [a,b]) {await client.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await client.query('set role authenticated');}
    const children=await Promise.all([a,b].map(client=>client.query("insert into project_tasks(id,user_id,project_id,parent_task_id,title,progress_stage) values($1,$2,$3,$4,'Child','in_progress') returning id,updated_at::text snapshot",[randomUUID(),owner,project,root])));
    assert.equal((await a.query('select id from project_tasks where parent_task_id=$1',[root])).rows.length,2);
    const leaf=children[0].rows[0];
    const updated=await Promise.all([a,b].map(client=>client.query("update project_tasks set progress_stage='completed' where id=$1 and updated_at=$2 returning id",[leaf.id,leaf.snapshot])));
    assert.deepEqual(updated.map(r=>r.rowCount).sort(),[0,1]);
    const state=(await a.query('select progress_stage,completed_at from project_tasks where id=$1',[leaf.id])).rows[0];assert.equal(state.progress_stage,'completed');assert(state.completed_at);
    await assert.rejects(()=>a.query("update project_tasks set progress_stage='completed' where id=$1",[root]),e=>e.code==='23514');
    await assert.rejects(()=>b.query('update project_tasks set parent_task_id=$1 where id=$2',[leaf.id,root]),e=>e.code==='42501');
    await assert.rejects(()=>admin.query('update project_tasks set parent_task_id=$1 where id=$2',[leaf.id,root]),e=>e.code==='23514');
  } finally {await Promise.all(clients.map(c=>c.end()));}
});
