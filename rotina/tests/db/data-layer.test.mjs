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
      else {assert.equal(name,'save_activity_aggregate');result=await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) result',[JSON.stringify(args.p_activity),JSON.stringify(args.p_relations),args.p_expected_revision]);}
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

test('Database provisório confere colunas, tipos, nullability, defaults e FKs no catálogo real',async()=>{
  const source=ts.createSourceFile('database.types.ts',await readFile('lib/banco-mestre/data/database.types.ts','utf8'),ts.ScriptTarget.Latest,true);
  const aliases=new Map(source.statements.filter(ts.isTypeAliasDeclaration).map(n=>[n.name.text,n.type]));
  const dbtype=aliases.get('Database');
  const publicSchema=dbtype.members.find(n=>n.name.getText(source)==='public').type;
  const tableNodes=publicSchema.members.find(n=>n.name.getText(source)==='Tables').type.members;
  assert.equal(tableNodes.length,9);
  const property=(node,name)=>node.members.find(m=>m.name.getText(source)===name)?.type;
  const literal=n=>ts.isLiteralTypeNode(n)?n.literal.text??(n.literal.kind===ts.SyntaxKind.TrueKeyword):null;
  for(const table of tableNodes) {
    const name=table.name.getText(source);
    const [rowRef,required,relationTypes]=table.type.typeArguments;
    const fields=aliases.get(rowRef.typeName.getText(source)).members;
    const actual=(await db.query("select column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",[name])).rows;
    assert.deepEqual(fields.map(n=>n.name.getText(source)),actual.map(r=>r.column_name),name+' columns');
    const requiredKeys=ts.isUnionTypeNode(required)?required.types.map(literal):[literal(required)];
    assert.deepEqual([...requiredKeys].sort(),actual.filter(r=>r.is_nullable==='NO'&&r.column_default===null).map(r=>r.column_name).sort(),name+' Insert required');
    for(const [index,field] of fields.entries()) {
      const tokens=field.type.getText(source).split(' | ');
      assert.equal(tokens.includes('null'),actual[index].is_nullable==='YES',name+'.'+actual[index].column_name+' nullable');
      const expect=actual[index].udt_name==='_int2'?['number[]']:['int2','int4'].includes(actual[index].udt_name)?['number']:actual[index].udt_name==='numeric'?['number','string']:actual[index].udt_name==='bool'?['boolean']:['string'];
      assert.deepEqual(tokens.filter(x=>x!=='null').sort(),expect.sort(),name+'.'+actual[index].column_name+' type');
    }
    const foreignKeys=(await db.query("select c.conname,rt.relname as relation,array(select a.attname from unnest(c.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n order by k.o) as cols,array(select a.attname from unnest(c.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n order by k.o) as refcols from pg_constraint c join pg_class rt on rt.oid=c.confrelid where c.contype='f' and c.conrelid=$1::regclass",['public.'+name])).rows;
    const declared=relationTypes.elements.map(n=>{
      if(ts.isTypeReferenceNode(n)) {
        const prefix=n.typeName.getText(source),t=literal(n.typeArguments[0]);
        return prefix==='Owner'?{conname:t+'_user_id_fkey',relation:'users',cols:['user_id'],refcols:['id']}:{conname:t+'_user_id_activity_id_fkey',relation:'activities',cols:['user_id','activity_id'],refcols:['user_id','id']};
      }
      return {conname:literal(property(n,'foreignKeyName')),relation:literal(property(n,'referencedRelation')),cols:property(n,'columns').elements.map(literal),refcols:property(n,'referencedColumns').elements.map(literal)};
    });
    const sorted=rows=>rows.sort((a,b)=>a.conname.localeCompare(b.conname));
    assert.deepEqual(sorted(declared),sorted(foreignKeys),name+' Relationships');
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
