import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test,before,beforeEach,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
const {createProjectRepository}=load('lib/projects/repository.ts');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
const iso=value=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
const transport={async query(sql,params){
const result=await db.query(sql,params);
for(const row of result.rows) if(Object.hasOwn(row,'updated_at')) {
const table=Object.hasOwn(row,'project_id')?'project_tasks':'projects';
const raw=(await db.query(`select created_at::text c,updated_at::text u from ${table} where id=$1`,[row.id])).rows[0];row.created_at=iso(raw.c);row.updated_at=iso(raw.u);
}
return result;
}};
const client=pgliteClient(transport,['projects','project_tasks']),repo=createProjectRepository(client,A);
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const create=(title='Ideia real',description='Conteúdo\ncom linhas')=>repo.create({id:randomUUID(),title,description});
before(async()=>{
await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;create schema routine_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
await db.exec(await readFile('supabase/migrations/20261027000100_projects.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261031000100_projects_advanced.sql','utf8'));await user();
});
test('tasks create/edit/complete/undo, 0/partial/100 progress, refresh and stale snapshots',async()=>{
const {projectProgress}=load('lib/projects/progress.ts');
const project=await create('Project with tasks','');
assert.deepEqual(projectProgress(await repo.tasks(project.id)),{completed:0,total:0,percentage:0});
const tasks=[];for(let i=0;i<12;i++)tasks.push(await repo.createTask({id:randomUUID(),projectId:project.id,title:'Task '+i}));
assert.equal(projectProgress(await repo.tasks(project.id)).percentage,0);
const first=await repo.updateTask({id:tasks[0].id,projectId:project.id,title:'Edited task',completed:true,expectedUpdatedAt:tasks[0].updatedAt});
assert(first.completedAt);assert(!first.completedAt.startsWith('2000-'));
assert.equal(projectProgress(await repo.tasks(project.id)).percentage,8);
const edited=await repo.updateTask({id:first.id,projectId:project.id,title:'Edited completed task',completed:true,expectedUpdatedAt:first.updatedAt});
assert.equal(edited.completedAt,first.completedAt);
await assert.rejects(()=>repo.updateTask({id:first.id,projectId:project.id,title:'Stale',completed:false,expectedUpdatedAt:first.updatedAt}),e=>e.kind==='Conflict');
for(const task of tasks.slice(1))await repo.updateTask({id:task.id,projectId:project.id,title:task.title,completed:true,expectedUpdatedAt:task.updatedAt});
assert.equal(projectProgress(await repo.tasks(project.id)).percentage,100);
const undone=await repo.updateTask({id:edited.id,projectId:project.id,title:edited.title,completed:false,expectedUpdatedAt:edited.updatedAt});assert.equal(undone.completedAt,null);
const refreshed=await createProjectRepository(client,A).tasks(project.id);assert.equal(refreshed.length,12);assert.equal(projectProgress(refreshed).percentage,92);
const summaries=await repo.taskProgress();assert.equal(summaries.filter(t=>t.projectId===project.id).length,12);
assert.deepEqual(projectProgress(summaries.filter(t=>t.projectId===project.id)),projectProgress(refreshed));
assert(summaries.every(t=>Object.keys(t).sort().join(',')==='completedAt,id,parentTaskId,progressStage,progressWeight,projectId'));
});
test('task RLS, composite FK and grants reject cross-owner reads/writes and project moves',async()=>{
const project=await create('Owner A',''),task=await repo.createTask({id:randomUUID(),projectId:project.id,title:'Private'});
await user(B);const b=createProjectRepository(client,B);
assert.deepEqual(await b.tasks(project.id),[]);
assert.deepEqual(await b.taskProgress(),[]);
assert.deepEqual(await createProjectRepository(client,A).taskProgress(),[]); // RLS still wins over a forged repository owner.
await assert.rejects(()=>b.updateTask({id:task.id,projectId:project.id,title:'Attack',completed:true,expectedUpdatedAt:task.updatedAt}),e=>e.kind==='NotFound');
await assert.rejects(()=>b.createTask({id:randomUUID(),projectId:project.id,title:'Attack'}),e=>e.kind==='NotFound');
await assert.rejects(()=>db.query('insert into project_tasks(user_id,project_id,title) values($1,$2,$3)',[B,project.id,'Cross owner']),e=>e.code==='23503');
await assert.rejects(()=>db.query('insert into project_tasks(user_id,project_id,title) values($1,$2,$3)',[A,project.id,'Spoof']),e=>e.code==='42501');
assert.equal((await db.query('update project_tasks set title=$1 where id=$2 returning id',['Attack',task.id])).rows.length,0);
await user();
for(const sql of ['update project_tasks set project_id=project_id','update project_tasks set user_id=user_id','update project_tasks set updated_at=now()','update project_tasks set created_at=now()','delete from project_tasks'])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
await assert.rejects(()=>db.query('insert into project_tasks(user_id,project_id,title) values($1,$2,$3)',[A,project.id,'  ']),e=>e.code==='23514');
await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec('select * from project_tasks'),e=>e.code==='42501');await user();
});
beforeEach(async()=>{await db.exec('reset role;truncate projects cascade');await user();});
after(async()=>db.close());
test('empty list, create, edit, fresh repository refresh, multiple and long texts persist exact description',async()=>{
assert.deepEqual(await repo.list(),[]);
const text='Texto longo 😀\n'.repeat(3000),project=await create('  Primeira ideia  ',text);assert.equal(project.title,'Primeira ideia');assert.equal(project.description,text);assert.equal(project.createdAt,project.updatedAt);
const changed=await repo.update({id:project.id,title:'Editada',description:text+'Fim',expectedUpdatedAt:project.updatedAt});assert.notEqual(changed.updatedAt,project.updatedAt);assert.equal(changed.createdAt,project.createdAt);
assert.deepEqual(await createProjectRepository(client,A).get(project.id),changed);
await create('Outra','');assert.equal((await repo.list()).length,2);assert.equal((await repo.list())[0].title,'Outra');
await assert.rejects(()=>repo.update({id:project.id,title:'Perdida',description:'',expectedUpdatedAt:project.updatedAt}),e=>e.kind==='Conflict');assert.equal((await repo.get(project.id)).title,'Editada');
await assert.rejects(()=>repo.create({id:project.id,title:'Duplicada',description:''}),e=>e.kind==='Conflict');
});
test('RLS A/B covers repository and direct SQL; owner spoofing/anon and identity/audit writes denied',async()=>{
const project=await create();await user(B);const b=createProjectRepository(client,B);assert.deepEqual(await b.list(),[]);await assert.rejects(()=>b.get(project.id),e=>e.kind==='NotFound');await assert.rejects(()=>b.update({id:project.id,title:'Ataque',description:'',expectedUpdatedAt:project.updatedAt}),e=>e.kind==='NotFound');
assert.equal((await db.query('select id from projects where id=$1',[project.id])).rows.length,0);
assert.equal((await db.query('update projects set title=$1 where id=$2 returning id',['Ataque',project.id])).rows.length,0);
await assert.rejects(()=>db.query('insert into projects(user_id,title) values($1,$2)',[A,'Ataque']),e=>e.code==='42501');
await user();for(const sql of ['update projects set updated_at=now()','update projects set created_at=now()','update projects set user_id=user_id','delete from projects'])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from projects'),e=>e.code==='42501');await assert.rejects(()=>db.query('insert into projects(user_id,title) values($1,$2)',[A,'Anon']),e=>e.code==='42501');await user();
});
test('SQL and repository reject invalid titles/oversized description, accept boundary limits',async()=>{
await create('x'.repeat(200),'😀'.repeat(100000));
for(const [title,description] of [['',''],['   ',''],['x'.repeat(201),''],['ok','x'.repeat(100001)]]) {
await assert.rejects(()=>create(title,description),e=>e.kind==='Validation');
await assert.rejects(()=>db.query('insert into projects(user_id,title,description) values($1,$2,$3)',[A,title,description]),e=>e.code==='23514');
}
});

test('V0.3 manual 0 -> 42 -> 100 persists across repository reload; hybrid never overwrites task stages',async()=>{
  let project=await repo.create({id:randomUUID(),title:'Manual',description:'',progressMode:'manual',manualProgressPercent:0});
  assert.equal((await repo.get(project.id)).manualProgressPercent,0);
  for(const percent of [42,100]) {
    project=await repo.update({id:project.id,title:project.title,description:'',progressMode:'manual',manualProgressPercent:percent,expectedUpdatedAt:project.updatedAt});
    assert.equal((await createProjectRepository(client,A).get(project.id)).manualProgressPercent,percent);
  }
  const leaf=await repo.createTask({id:randomUUID(),projectId:project.id,title:'Partial',progressStage:'in_progress'});
  project=await repo.update({id:project.id,title:project.title,description:'',progressMode:'hybrid',manualProgressPercent:42,expectedUpdatedAt:project.updatedAt});
  assert.equal(project.manualProgressPercent,42);assert.equal(project.progressMode,'hybrid');
  assert.equal((await repo.tasks(project.id))[0].progressStage,leaf.progressStage);
});

test('V0.3 seven stages synchronize completion, keep timestamps, reopen and retain exact conflicts',async()=>{
  const project=await create();let task=await repo.createTask({id:randomUUID(),projectId:project.id,title:'Leaf'});
  for(const stage of ['started','early_progress','in_progress','advanced','finishing','completed','in_progress']) {
    const previous=task;
    task=await repo.updateTask({id:task.id,projectId:project.id,title:task.title,progressStage:stage,progressWeight:3,completed:stage==='completed',expectedUpdatedAt:task.updatedAt});
    assert.equal(task.progressStage,stage);assert.equal(task.completedAt!==null,stage==='completed');assert.equal(task.progressWeight,3);
    await assert.rejects(()=>repo.updateTask({id:task.id,projectId:project.id,title:'Lost',completed:false,expectedUpdatedAt:previous.updatedAt}),e=>e.kind==='Conflict');
  }
  await db.query("update project_tasks set completed_at=now() where id=$1",[task.id]);
  assert.equal((await repo.tasks(project.id))[0].progressStage,'completed');
  await db.query('update project_tasks set completed_at=null where id=$1',[task.id]);
  assert.equal((await repo.tasks(project.id))[0].progressStage,'not_started');
});

test('V0.3 hierarchy enforces project/owner, self-parent, existing parent, immutable edges and derived parent stage',async()=>{
  const project=await create(),other=await create('Other');
  const root=await repo.createTask({id:randomUUID(),projectId:project.id,title:'Root'});
  const child=await repo.createTask({id:randomUUID(),projectId:project.id,parentTaskId:root.id,title:'Child'});
  const grandchild=await repo.createTask({id:randomUUID(),projectId:project.id,parentTaskId:child.id,title:'Grandchild',progressStage:'completed',progressWeight:5});
  assert.equal(grandchild.parentTaskId,child.id);
  const {projectProgress}=load('lib/projects/progress.ts');assert.equal(projectProgress(await repo.tasks(project.id)).percentage,100);
  await assert.rejects(()=>repo.createTask({id:randomUUID(),projectId:other.id,parentTaskId:root.id,title:'Cross project'}),e=>e.kind==='Validation');
  await assert.rejects(()=>repo.updateTask({id:root.id,projectId:project.id,title:root.title,completed:true,expectedUpdatedAt:root.updatedAt}),e=>e.kind==='Validation');
  const renamed=await repo.updateTask({id:root.id,projectId:project.id,title:'New root',completed:false,progressWeight:2,expectedUpdatedAt:root.updatedAt});assert.equal(renamed.title,'New root');
  await assert.rejects(()=>db.query('update project_tasks set parent_task_id=$1 where id=$2',[child.id,root.id]),e=>e.code==='42501');
  const self=randomUUID();await assert.rejects(()=>db.query('insert into project_tasks(id,user_id,project_id,title,parent_task_id) values($1,$2,$3,$4,$1)',[self,A,project.id,'Self']),e=>e.code==='23514');
  await user(B);const b=createProjectRepository(client,B),bp=await b.create({id:randomUUID(),title:'B',description:''});
  await assert.rejects(()=>b.createTask({id:randomUUID(),projectId:bp.id,parentTaskId:root.id,title:'Cross owner'}),e=>e.kind==='Validation');
  assert.deepEqual(await b.tasks(project.id),[]);await user();
  await db.exec('reset role');
  await assert.rejects(()=>db.query('update project_tasks set parent_task_id=$1 where id=$2',[grandchild.id,root.id]),e=>e.code==='23514');
  const x=randomUUID(),y=randomUUID();
  await assert.rejects(()=>db.query('insert into project_tasks(id,user_id,project_id,title,parent_task_id) values($1,$3,$4,$5,$2),($2,$3,$4,$5,$1)',[x,y,A,project.id,'Cycle']),e=>e.code==='23514');
  await user();
});

test('V0.3 SQL constraints reject invalid modes, percentages, stages and weights',async()=>{
  const project=await create();
  for(const [column,value] of [['progress_mode','auto'],['manual_progress_percent',-1],['manual_progress_percent',101]])await assert.rejects(()=>db.query(`update projects set ${column}=$1 where id=$2`,[value,project.id]),e=>e.code==='23514');
  for(const [stage,weight] of [['invalid',1],['started',0],['started',-1]])await assert.rejects(()=>db.query('insert into project_tasks(user_id,project_id,title,progress_stage,progress_weight) values($1,$2,$3,$4,$5)',[A,project.id,'Invalid',stage,weight]),e=>e.code==='23514');
});

test('V0.3 migration upgrades legacy data without changing identities or historical timestamps',async()=>{
  const legacy=new PGlite();
  try {
    await legacy.exec(`create role authenticated nologin;create role anon nologin;create schema auth;create schema routine_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${A}');`);
    await legacy.exec(await readFile('supabase/migrations/20261027000100_projects.sql','utf8'));
    const p=randomUUID(),done=randomUUID(),open=randomUUID();
    await legacy.query("insert into projects(id,user_id,title) values($1,$2,'Legacy')",[p,A]);
    for(const id of [done,open])await legacy.query("insert into project_tasks(id,user_id,project_id,title) values($1,$2,$3,'Legacy task')",[id,A,p]);
    await legacy.query('update project_tasks set completed_at=now() where id=$1',[done]);
    const before=(await legacy.query('select id,created_at::text,updated_at::text,completed_at::text from project_tasks order by id')).rows;
    await legacy.exec(await readFile('supabase/migrations/20261031000100_projects_advanced.sql','utf8'));
    assert.deepEqual((await legacy.query('select id,created_at::text,updated_at::text,completed_at::text from project_tasks order by id')).rows,before);
    assert.deepEqual((await legacy.query('select progress_mode,manual_progress_percent from projects')).rows,[{progress_mode:'tasks',manual_progress_percent:0}]);
    const rows=(await legacy.query('select id,progress_stage,progress_weight,parent_task_id from project_tasks')).rows;
    assert.equal(rows.find(t=>t.id===done).progress_stage,'completed');assert.equal(rows.find(t=>t.id===open).progress_stage,'not_started');
    assert(rows.every(t=>t.progress_weight===1&&t.parent_task_id===null));
  } finally {await legacy.close();}
});
