import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');
const {createIdeaRepository}=load('lib/ideas/repository.ts');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const db=new PGlite();
const iso=value=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');
const transport={async query(sql,params){
const result=await db.query(sql,params);
for(const row of result.rows) if(Object.hasOwn(row,'updated_at')) {
const raw=(await db.query('select created_at::text c,updated_at::text u from ideas where id=$1',[row.id])).rows[0];row.created_at=iso(raw.c);row.updated_at=iso(raw.u);
}
return result;
}};
const client=pgliteClient(transport,['ideas']),repo=createIdeaRepository(client,A);
async function user(id=A){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const create=(title='Ideia real',content='Conteúdo\ncom linhas')=>repo.create({id:randomUUID(),title,content});
before(async()=>{
await db.exec(`create role authenticated nologin;create role anon nologin;create schema auth;create schema routine_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${A}'),('${B}');`);
await db.exec(await readFile('supabase/migrations/20261026000100_ideas.sql','utf8'));await user();
});
after(async()=>db.close());
test('empty list, create, edit, fresh repository refresh, multiple and long texts persist exact content',async()=>{
assert.deepEqual(await repo.list(),[]);
const text='Texto longo 😀\n'.repeat(3000),idea=await create('  Primeira ideia  ',text);assert.equal(idea.title,'Primeira ideia');assert.equal(idea.content,text);assert.equal(idea.createdAt,idea.updatedAt);
const changed=await repo.update({id:idea.id,title:'Editada',content:text+'Fim',expectedUpdatedAt:idea.updatedAt});assert.notEqual(changed.updatedAt,idea.updatedAt);assert.equal(changed.createdAt,idea.createdAt);
assert.deepEqual(await createIdeaRepository(client,A).get(idea.id),changed);
await create('Outra','');assert.equal((await repo.list()).length,2);assert.equal((await repo.list())[0].title,'Outra');
await assert.rejects(()=>repo.update({id:idea.id,title:'Perdida',content:'',expectedUpdatedAt:idea.updatedAt}),e=>e.kind==='Conflict');assert.equal((await repo.get(idea.id)).title,'Editada');
await assert.rejects(()=>repo.create({id:idea.id,title:'Duplicada',content:''}),e=>e.kind==='Conflict');
});
test('RLS A/B covers repository and direct SQL; owner spoofing/anon and identity/audit writes denied',async()=>{
const idea=await create();await user(B);const b=createIdeaRepository(client,B);assert.deepEqual(await b.list(),[]);await assert.rejects(()=>b.get(idea.id),e=>e.kind==='NotFound');await assert.rejects(()=>b.update({id:idea.id,title:'Ataque',content:'',expectedUpdatedAt:idea.updatedAt}),e=>e.kind==='NotFound');
assert.equal((await db.query('select id from ideas where id=$1',[idea.id])).rows.length,0);
assert.equal((await db.query('update ideas set title=$1 where id=$2 returning id',['Ataque',idea.id])).rows.length,0);
await assert.rejects(()=>db.query('insert into ideas(user_id,title) values($1,$2)',[A,'Ataque']),e=>e.code==='42501');
await user();for(const sql of ['update ideas set updated_at=now()','update ideas set created_at=now()','update ideas set user_id=user_id','delete from ideas'])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from ideas'),e=>e.code==='42501');await assert.rejects(()=>db.query('insert into ideas(user_id,title) values($1,$2)',[A,'Anon']),e=>e.code==='42501');await user();
});
test('SQL and repository reject invalid titles/oversized content, accept boundary limits',async()=>{
await create('x'.repeat(200),'😀'.repeat(100000));
for(const [title,content] of [['',''],['   ',''],['x'.repeat(201),''],['ok','x'.repeat(100001)]]) {
await assert.rejects(()=>create(title,content),e=>e.kind==='Validation');
await assert.rejects(()=>db.query('insert into ideas(user_id,title,content) values($1,$2,$3)',[A,title,content]),e=>e.code==='23514');
}
});
