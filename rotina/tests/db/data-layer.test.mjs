import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {load}=require('../helpers/load-typescript.cjs');
const {fixture,owner}=require('../helpers/data-fixtures.cjs');
const {createBancoMestreRepository}=load('lib/banco-mestre/data/repository.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const db=new PGlite();
const second='00000000-0000-4000-8000-000000000002';
async function user(id=owner) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
}
// Adapter SOMENTE de teste, consulta PostgreSQL em memória; nenhuma URL/chave.
const client={
  from(table) {
    assert(['activities','areas'].includes(table));
    let columns='*'; const order=[];
    const query={select(value){assert(/^[a-z_,]+$/.test(value));columns=value;return query;},order(col,{ascending}){assert(/^[a-z_]+$/.test(col));order.push(col+(ascending?' asc':' desc'));return query;},async range(start,end){
      try {return {data:JSON.parse(JSON.stringify((await db.query(`select ${columns} from public.${table} order by ${order.join(',')} limit $1 offset $2`,[end-start+1,start])).rows)),error:null};}
      catch(error){return {data:null,error};}
    }};return query;
  },
  async rpc(name,args) {
    try {
      let result;
      if(name==='get_activity_aggregate') result=await db.query('select public.get_activity_aggregate($1::uuid) result',[args.p_activity_id]);
      else {
        assert.equal(name,'save_activity_aggregate');
        const values=[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations)];
        result=Object.hasOwn(args,'p_expected_revision')
          ? await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) result',[...values,args.p_expected_revision])
          : await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb) result',values);
      }
      return {data:result.rows[0].result,error:null};
    } catch(error) {return {data:null,error};}
  },
};
const repo=createBancoMestreRepository(client);
before(async()=>{
  await db.exec(`create role authenticated nologin; create role anon nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${owner}'),('${second}');`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await user();
});
beforeEach(async()=>{await db.exec('rollback');await user();});
after(async()=>{await db.close();});

test('Official Database matches columns, defaults, nullable fields and public FKs',async()=>{
  const source=ts.createSourceFile('database.types.ts',await readFile('lib/banco-mestre/data/database.types.ts','utf8'),ts.ScriptTarget.Latest,true);
  const dbtype=source.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='Database').type;
  const property=(node,name)=>node.members.find(m=>m.name.getText(source)===name)?.type;
  const literal=n=>ts.isLiteralTypeNode(n)?n.literal.text??(n.literal.kind===ts.SyntaxKind.TrueKeyword):null;
  const schema=property(dbtype,'public');
  const tables=property(schema,'Tables').members;
  assert.deepEqual(tables.map(t=>t.name.getText(source)).sort(),['activities','areas','commitment_configs','fixed_schedules','goals','planning_contexts','recurrence_rules','reminder_configs','time_windows']);
  const sorted=rows=>rows.sort((a,b)=>a.conname.localeCompare(b.conname));
  for(const table of tables) {
    const name=table.name.getText(source);
    const fields=property(table.type,'Row').members;
    const insert=property(table.type,'Insert').members;
    const update=property(table.type,'Update').members;
    const actual=(await db.query("select column_name,udt_name,is_nullable,column_default,is_generated,is_identity from information_schema.columns where table_schema='public' and table_name=$1",[name])).rows;
    const columnNames=actual.map(r=>r.column_name).sort();
    for(const shape of [fields,insert,update]) assert.deepEqual(shape.map(f=>f.name.getText(source)).sort(),columnNames,name+' columns');
    assert.deepEqual(insert.filter(f=>!f.questionToken).map(f=>f.name.getText(source)).sort(),actual.filter(r=>r.is_nullable==='NO'&&r.column_default===null).map(r=>r.column_name).sort(),name+' Insert required');
    assert(update.every(f=>f.questionToken),name+' Update optional');
    assert(actual.every(r=>r.is_generated==='NEVER'&&r.is_identity==='NO'),name+' no generated/identity columns');
    for(const column of actual) {
      const expected=column.udt_name==='_int2'?'number[]':['int2','int4','numeric'].includes(column.udt_name)?'number':column.udt_name==='bool'?'boolean':'string';
      for(const shape of [fields,insert,update]) {
        const field=shape.find(f=>f.name.getText(source)===column.column_name);
        const tokens=field.type.getText(source).split(' | ');
        assert.equal(tokens.includes('null'),column.is_nullable==='YES',name+'.'+column.column_name+' nullable');
        assert.deepEqual(tokens.filter(t=>t!=='null'),[expected],name+'.'+column.column_name+' type');
      }
      assert(!fields.find(f=>f.name.getText(source)===column.column_name).questionToken,name+' Row required');
    }
    const foreignKeys=(await db.query("select c.conname,rt.relname as relation,array(select a.attname from unnest(c.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n order by k.o) as cols,array(select a.attname from unnest(c.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n order by k.o) as refcols from pg_constraint c join pg_class rt on rt.oid=c.confrelid where c.contype='f' and c.conrelid=$1::regclass and rt.relnamespace='public'::regnamespace",['public.'+name])).rows;
    const declared=property(table.type,'Relationships').elements.map(n=>({conname:literal(property(n,'foreignKeyName')),relation:literal(property(n,'referencedRelation')),cols:property(n,'columns').elements.map(literal),refcols:property(n,'referencedColumns').elements.map(literal)}));
    assert.deepEqual(sorted(declared),sorted(foreignKeys),name+' public Relationships');
    // Schema-scoped generation omits auth relations; still verify the physical FK.
    const ownerFk=(await db.query("select c.conname from pg_constraint c where c.contype='f' and c.conrelid=$1::regclass and c.confrelid='auth.users'::regclass",['public.'+name])).rows;
    assert.deepEqual(ownerFk,[{conname:name+'_user_id_fkey'}]);
  }
  const functions=property(schema,'Functions').members;
  assert.deepEqual(functions.map(f=>f.name.getText(source)).sort(),['get_activity_aggregate','save_activity_aggregate']);
  for(const fn of functions) {
    const name=fn.name.getText(source),args=property(fn.type,'Args').members;
    const sql=(await db.query("select proargnames,pronargs,pronargdefaults,pg_get_function_result(oid) result from pg_proc where pronamespace='public'::regnamespace and proname=$1",[name])).rows;
    assert.equal(sql.length,1);assert.equal(sql[0].result,'jsonb');
    assert.equal(property(fn.type,'Returns').getText(source),'Json');
    assert.deepEqual(args.map(a=>a.name.getText(source)).sort(),[...sql[0].proargnames].sort());
    assert.equal(args.filter(a=>!a.questionToken).length,sql[0].pronargs-sql[0].pronargdefaults);
    assert.equal(sql[0].pronargdefaults,name==='save_activity_aggregate'?2:0);
  }
});
for(const name of ['aniversario-mae','dentista','trabalho','academia','faxina','agua','escovar','cabelo']) test('repository → RPC real → mapper preserva '+name,async()=>{
  const bundle=fixture(name);
  await db.query('insert into public.areas(id,user_id,name) values ($1,$2,$3)',[bundle.activity.areaId,owner,'Área fictícia']);
  const saved=await repo.saveActivity(bundle);
  // Auditoria é gerada pelo banco; compara todos os demais valores do domínio.
  assert.deepEqual(saved.bundle,{...bundle,activity:{...bundle.activity,createdAt:saved.bundle.activity.createdAt,updatedAt:saved.bundle.activity.updatedAt}});
  assert.deepEqual(await repo.getActivity(saved.bundle.activity.id),saved);
});
test('leitura pública invoker preserva RLS/anon, NotFound e revisão sem writes',async()=>{
  const b=fixture('dentista'); await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[b.activity.areaId,owner,'Área']);
  const saved=await repo.saveActivity(b);
  const again=await repo.getActivity(b.activity.id);assert.equal(again.revision,saved.revision);
  await user(second);
  await assert.rejects(()=>repo.getActivity(b.activity.id),e=>e instanceof PersistenceError&&e.kind==='NotFound');
  assert.deepEqual(await repo.listActivities(),[]);assert.deepEqual(await repo.listAreas(),[]);
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>repo.getActivity(b.activity.id),e=>e.kind==='Unauthorized');
  await user('');
  await assert.rejects(()=>repo.getActivity(b.activity.id),e=>e.kind==='Unauthorized');
  await user();
  const meta=(await db.query("select prosecdef,provolatile from pg_proc where oid='public.get_activity_aggregate(uuid)'::regprocedure")).rows[0];
  assert.equal(meta.prosecdef,false);assert.equal(meta.provolatile,'s');
  assert.equal((await db.query("select has_function_privilege('anon','public.get_activity_aggregate(uuid)','EXECUTE') ok")).rows[0].ok,false);
});
test('repository edição, listagens básicas e Conflict usando expectedRevision real',async()=>{
  const list=await repo.listActivities(),areas=await repo.listAreas();assert(list.length>=8);assert(areas.length>=8);
  assert(list.every(x=>!('config' in x.activity)));
  const original=await repo.getActivity(list[0].activity.id);
  const changed=structuredClone(original.bundle);changed.activity.name='Editado';
  const updated=await repo.saveActivity(changed,original.revision);assert(updated.revision>original.revision);
  assert.equal(updated.bundle.activity.createdAt,original.bundle.activity.createdAt);
  await assert.rejects(()=>repo.saveActivity(changed,original.revision),e=>e.kind==='Conflict');
  assert.equal((await repo.getActivity(changed.activity.id)).bundle.activity.name,'Editado');
});
