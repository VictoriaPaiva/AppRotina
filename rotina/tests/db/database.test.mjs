import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// PostgreSQL real, em memória; não aceita URL nem acessa banco remoto.
const db = new PGlite();
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const areaA = '00000000-0000-4000-8000-000000000011';
const areaB = '00000000-0000-4000-8000-000000000012';
const tables = ['areas','activities','reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','time_windows'];
async function user(id = A) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
}
async function rejected(fn, code) {
  await assert.rejects(fn, e => !code || e.code === code);
  await db.exec('rollback');
}
const activity = type => ({ name: 'Teste', area_id: areaA, type });
const goal = (metric = 'count', minimum_target = 1) => ({metric, unit: metric === 'quantity' ? 'km' : metric === 'duration' ? 'minute' : 'execution', minimum_target, period:'week', starts_on:'2026-10-11'});
const schedule = {weekdays:[1,3,5], start_time:'08:00', end_time:'09:00'};
const reminder = {reference_date:'2026-10-11'};
const commitment = {date:'2026-10-11', start_time:'10:00', end_time:'11:00'};
async function save(a, relations = {}, revision = null) {
  return (await db.query('select public.save_activity_aggregate($1::jsonb,$2::jsonb,$3::integer) as bundle',[JSON.stringify(a),JSON.stringify(relations),revision])).rows[0].bundle;
}
before(async () => {
  await db.exec(`create role authenticated nologin; create role anon nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${A}'),('${B}');`);
  for (const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await user();
  await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[areaA,A,'Área A']);
  await user(B);
  await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[areaB,B,'Área B']);
  await user();
});
beforeEach(async () => { await db.exec('rollback'); await user(); });
after(async () => {await db.close();});

test('nove tabelas com RLS, grants restritos e sem colunas JSON', async () => {
  const r = await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",[tables]);
  assert.equal(r.rows.length,9); assert.ok(r.rows.every(x=>x.relrowsecurity));
  for (const t of tables) {
    const row = (await db.query("select has_table_privilege('anon',$1,'SELECT') as anon, has_table_privilege('authenticated',$1,'DELETE') as del",['public.'+t])).rows[0];
    assert.equal(row.anon,false); assert.equal(row.del,!['areas','activities'].includes(t));
  }
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name=any($1) and data_type in ('json','jsonb')",[tables])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='routine_private'::regnamespace and prosecdef")).rows[0].n,0);
});
test('salva atomicamente os cinco tipos e quantidade decimal', async () => {
  for (const [type,relations] of [
    ['reminder',{reminder_config:reminder}],['commitment',{commitment_config:commitment,planning_context:{preparation_minutes:0}}],
    ['fixedActivity',{fixed_schedules:[schedule]}], ['variableActivity',{goals:[goal('quantity',1.5)]}], ['checklistGoal',{goals:[goal()]}]
  ]) assert.equal((await save(activity(type),relations)).activity.type,type);
});
test('RLS isola A/B, rejeita ownership/FK cruzados e anon', async () => {
  const a = await save(activity('reminder'),{reminder_config:reminder});
  await user(B);
  for (const t of tables.filter(t=>t!=='areas')) assert.equal((await db.query(`select count(*)::int n from ${t}`)).rows[0].n,0);
  assert.equal((await db.query('update activities set name=$1 where id=$2 returning id',['Invadido',a.activity.id])).rows.length,0);
  await rejected(()=>save({...activity('variableActivity'), area_id:areaA}),'23503');
  await rejected(()=>db.query('insert into areas(user_id,name) values ($1,$2)',[A,'Invadida']),'42501');
  await user();
  await rejected(()=>db.query('update activities set user_id=$1 where id=$2',[B,a.activity.id]),'23514');
  await db.exec('reset role; set role anon');
  for (const t of tables) await rejected(()=>db.query(`select * from ${t}`),'42501');
  await rejected(()=>save(activity('variableActivity')),'42501');
  await user();
  await rejected(()=>db.query('delete from activities where id=$1',[a.activity.id]),'42501');
  await rejected(()=>db.query('delete from areas where id=$1',[areaA]),'42501');
});
test('integridade diferida rejeita mestre/config/grupos/metas incompletos no COMMIT', async () => {
  for (const type of ['reminder','commitment','fixedActivity','checklistGoal']) {
    await db.exec('begin');
    await db.query("insert into activities(user_id,name,area_id,type,default_importance) values ($1,'Incompleto',$2,$3,'important')",[A,areaA,type]);
    await rejected(()=>db.exec('commit'),'23514');
  }
  const a = await save(activity('reminder'),{reminder_config:reminder});
  await db.exec('begin'); await db.query('delete from reminder_configs where activity_id=$1',[a.activity.id]);
  await rejected(()=>db.exec('commit'),'23514');
  assert.equal((await db.query('select count(*)::int n from reminder_configs where activity_id=$1',[a.activity.id])).rows[0].n,1);
});
test('troca de tipo em transação; rollback integral se novo agregado for inválido', async () => {
  const original = await save(activity('reminder'),{reminder_config:reminder});
  await rejected(()=>save({...activity('fixedActivity'),id:original.activity.id},{},original.activity.revision),'23514');
  const untouched = (await db.query('select * from activities where id=$1',[original.activity.id])).rows[0];
  assert.equal(untouched.type,'reminder'); assert.equal(untouched.revision,original.activity.revision);
  const changed = await save({...activity('fixedActivity'),id:original.activity.id},{fixed_schedules:[schedule]},original.activity.revision);
  assert.equal(changed.reminder_config,null); assert.equal(changed.fixed_schedules.length,1);
});
test('IDs e created_at preservados; revision avança por filhos e bloqueia edição antiga', async () => {
  const a = await save(activity('variableActivity'),{goals:[goal()]});
  const payload = {id:a.goals[0].id,...goal('count',2)};
  const b = await save({...activity('variableActivity'),id:a.activity.id},{goals:[payload]},a.activity.revision);
  assert.equal(b.goals[0].id,a.goals[0].id); assert.equal(b.goals[0].created_at,a.goals[0].created_at); assert.ok(b.activity.revision>a.activity.revision);
  await rejected(()=>save({...activity('variableActivity'),id:a.activity.id,name:'Rejected stale edit'},{goals:[{...payload,minimum_target:99}]},a.activity.revision),'PT409');
  assert.deepEqual((await db.query('select public.get_activity_aggregate($1) bundle',[a.activity.id])).rows[0].bundle,b);
  await db.query('update goals set minimum_target=3 where id=$1',[payload.id]);
  assert.ok((await db.query('select revision from activities where id=$1',[a.activity.id])).rows[0].revision>b.activity.revision);
  await rejected(()=>save({...activity('variableActivity'),id:a.activity.id},{goals:[payload]},b.activity.revision),'PT409');
});
test('durações e planejamento rejeitam frações, negativos, zero e overflow; quantity aceita decimal', async () => {
  for (const n of [1.5,0,-1,2147483648]) await rejected(()=>save({...activity('variableActivity'),duration_mode:'fixed',duration_minutes:n}));
  for (const field of ['preparation_minutes','outbound_minutes','return_minutes']) for (const n of [0.5,-1,2147483648]) await rejected(()=>save(activity('variableActivity'),{planning_context:{[field]:n}}));
  for (const metric of ['count','duration']) await rejected(()=>save(activity('variableActivity'),{goals:[goal(metric,1.5)]}),'23514');
  await rejected(()=>save({...activity('variableActivity'),duration_mode:'unknown',duration_minutes:1}),'23514');
  await rejected(()=>save({...activity('variableActivity'),duration_mode:'minimumIdeal',min_duration_minutes:20,ideal_duration_minutes:10}),'23514');
});
test('dias ISO únicos/ordenados, horários civis e períodos válidos', async () => {
  for (const weekdays of [[],[0],[8],[1,1],[3,1],[1,null]]) await rejected(()=>save(activity('fixedActivity'),{fixed_schedules:[{...schedule,weekdays}]}),'23514');
  for (const end_time of ['08:00','07:00','24:00','09:00:30']) await rejected(()=>save(activity('fixedActivity'),{fixed_schedules:[{...schedule,end_time}]}),'23514');
  await rejected(()=>save(activity('variableActivity'),{goals:[{...goal(),ends_on:'2026-10-10'}]}),'23514');
});
test('sete formatos de recorrência válidos, anual = 12 meses; campos incompatíveis rejeitados', async () => {
  const base = {basis:'calendar',interval_count:1,anchor_date:'2026-10-11',starts_on:'2026-10-11'};
  const rules = [
    {...base,pattern:'interval',unit:'day'}, {...base,pattern:'interval',unit:'month',interval_count:12,invalid_date_policy:'skip'},
    {...base,pattern:'weekdays',unit:'week',weekdays:[1,7]},
    {...base,pattern:'monthDay',unit:'month',day_of_month:31,invalid_date_policy:'lastValidDay'},
    {...base,pattern:'monthWeekday',unit:'month',ordinal:-1,weekday:1,invalid_date_policy:'skip'},
    {basis:'completion',pattern:'interval',unit:'day',interval_count:2,starts_on:base.starts_on},
    {basis:'completion',pattern:'interval',unit:'month',interval_count:1,invalid_date_policy:'skip',starts_on:base.starts_on}
  ];
  assert.equal((await save(activity('reminder'),{reminder_config:reminder,recurrence_rules:rules})).recurrence_rules.length,7);
  for (const invalid of [{...rules[0],weekdays:[1]}, {...rules[5],anchor_date:base.anchor_date}, {...rules[1],invalid_date_policy:null},{...rules[3],day_of_month:32}]) await rejected(()=>save(activity('reminder'),{reminder_config:reminder,recurrence_rules:[invalid]}),'23514');
});
test('preferências atuais: variável, preferred, sem vínculo; overnight e cobertura', async () => {
  const window = {kind:'timeRange',effect:'preferred',coverage:'wholeActivity',start_time:'22:00',end_time:'06:00',end_day_offset:1,starts_on:'2026-10-11'};
  const a = await save(activity('variableActivity'),{time_windows:[window,{kind:'weekdays',effect:'preferred',coverage:'startOnly',weekdays:[1,2],starts_on:'2026-10-11'}]});
  assert.equal(a.time_windows.length,2);
  for (const bad of [{...window,effect:'allowed'},{...window,effect:'forbidden'},{...window,end_day_offset:0},{...window,kind:'fixedStart',end_time:null,end_day_offset:null,coverage:'startOnly'}]) await rejected(()=>save(activity('variableActivity'),{time_windows:[bad]}),'23514');
  await rejected(()=>save(activity('checklistGoal'),{goals:[goal()],time_windows:[window]}),'23514');
});
test('área inativa preserva vínculo antigo mas impede novas associações; campos protegidos', async () => {
  const a = await save(activity('variableActivity'));
  await db.query('update areas set active=false where id=$1',[areaA]);
  await rejected(()=>save(activity('variableActivity')),'23503');
  await save({...activity('variableActivity'),id:a.activity.id},{},a.activity.revision);
  await db.query('update areas set active=true where id=$1',[areaA]);
  await rejected(()=>save({...activity('variableActivity'),revision:999}),'22023');
  await rejected(()=>save(activity('variableActivity'),{goals:[{...goal(),user_id:B}]}),'22023');
});

test('RLS protege leitura/update/delete de cada filha de outro usuário e FK de regra', async () => {
  const reminderA = await save(activity('reminder'),{reminder_config:reminder,recurrence_rules:[{basis:'calendar',pattern:'interval',unit:'day',interval_count:1,anchor_date:'2026-10-11',starts_on:'2026-10-11'}]});
  const commitmentA = await save(activity('commitment'),{commitment_config:commitment,planning_context:{location:'Casa'}});
  const fixedA = await save(activity('fixedActivity'),{fixed_schedules:[schedule]});
  const variableA = await save(activity('variableActivity'),{goals:[goal()],time_windows:[{kind:'weekdays',effect:'preferred',coverage:'startOnly',weekdays:[1],starts_on:'2026-10-11'}]});
  await user(B);
  for (const [table,id] of [['reminder_configs',reminderA.activity.id],['recurrence_rules',reminderA.activity.id],['commitment_configs',commitmentA.activity.id],['planning_contexts',commitmentA.activity.id],['fixed_schedules',fixedA.activity.id],['goals',variableA.activity.id],['time_windows',variableA.activity.id]]) {
    assert.equal((await db.query(`select * from ${table} where activity_id=$1`,[id])).rows.length,0);
    assert.equal((await db.query(`update ${table} set updated_at=now() where activity_id=$1 returning activity_id`,[id])).rows.length,0);
    assert.equal((await db.query(`delete from ${table} where activity_id=$1 returning activity_id`,[id])).rows.length,0);
  }
  await rejected(()=>db.query('insert into planning_contexts(user_id,activity_id,location) values ($1,$2,$3)',[B,variableA.activity.id,'Invadido']),'23503');
  await rejected(()=>save({...activity('variableActivity'),area_id:areaB},{goals:[{...goal(),id:variableA.goals[0].id}]}),'23514');
  await user();
  await rejected(()=>save(activity('variableActivity'),{time_windows:[{kind:'weekdays',effect:'preferred',coverage:'startOnly',weekdays:[1],starts_on:'2026-10-11',recurrence_rule_id:reminderA.recurrence_rules[0].id}]}),'23503');
});
test('transação SQL direta permite mudança completa, bloqueia config/metas indevidas e mantém auditoria', async () => {
  const a = await save(activity('reminder'),{reminder_config:reminder});
  await db.exec('begin');
  await db.query("update activities set type='fixedActivity' where id=$1",[a.activity.id]);
  await db.query('delete from reminder_configs where activity_id=$1',[a.activity.id]);
  await db.query("insert into fixed_schedules(user_id,activity_id,weekdays,start_time,end_time) values ($1,$2,array[1,2]::smallint[],'08:00','09:00')",[A,a.activity.id]);
  await db.exec('commit');
  assert.equal((await db.query('select type from activities where id=$1',[a.activity.id])).rows[0].type,'fixedActivity');
  await rejected(()=>db.query("update activities set created_at='2000-01-01' where id=$1",[a.activity.id]),'23514');
  await rejected(()=>db.query("insert into activities(user_id,name,area_id,type,status,default_importance) values ($1,'Inativo',$2,'variableActivity','inactive','important')",[A,areaA]),'23514');
  await rejected(()=>db.query("insert into reminder_configs(user_id,activity_id,reference_date) values ($1,$2,'2026-10-11')",[A,a.activity.id]),'23514');
  for (const type of ['reminder','commitment','fixedActivity']) {
    const relations = type === 'reminder' ? {reminder_config:reminder} : type === 'commitment' ? {commitment_config:commitment} : {fixed_schedules:[schedule]};
    await rejected(()=>save(activity(type),{...relations,goals:[goal()]}),'23514');
  }
  await rejected(()=>save(activity('fixedActivity'),{fixed_schedules:[{...schedule,start_time:'08:00:00.4'}]}),'23514');
});


test('purge administrativo separado remove mestre/filhas antes da conta, sem órfãos', async () => {
  const C='00000000-0000-4000-8000-000000000003';
  const areaC='00000000-0000-4000-8000-000000000013';
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values ($1)',[C]);
  await user(C);
  await db.query('insert into areas(id,user_id,name) values ($1,$2,$3)',[areaC,C,'Teste purge']);
  await save({...activity('reminder'),area_id:areaC},{reminder_config:reminder});
  await db.exec('reset role; begin');
  await db.query('delete from activities where user_id=$1',[C]);
  await db.query('delete from auth.users where id=$1',[C]);
  await db.exec('commit');
  for(const t of tables) assert.equal((await db.query('select count(*)::int n from '+t+' where user_id=$1',[C])).rows[0].n,0);
});

test('última meta/grupo não podem ser removidos; recorrência semanal de calendário é válida', async () => {
  for(const [type,relations,table] of [['checklistGoal',{goals:[goal()]},'goals'],['fixedActivity',{fixed_schedules:[schedule]},'fixed_schedules']]) {
    const a=await save(activity(type),relations);
    await db.exec('begin');
    await db.query('delete from '+table+' where activity_id=$1',[a.activity.id]);
    await rejected(()=>db.exec('commit'),'23514');
    assert.equal((await db.query('select count(*)::int n from '+table+' where activity_id=$1',[a.activity.id])).rows[0].n,1);
  }
  const a=await save(activity('reminder'),{reminder_config:reminder,recurrence_rules:[{basis:'calendar',pattern:'interval',unit:'week',interval_count:2,anchor_date:'2026-10-11',starts_on:'2026-10-11'}]});
  assert.equal(a.recurrence_rules[0].unit,'week');
});


test('injected PostgreSQL serialization_failure retains SQLSTATE 40001',async()=>{
  await assert.rejects(()=>db.exec("do $$ begin raise serialization_failure using message = 'serialization test'; end $$"),e=>e.code==='40001');
});

test('incremental migration only changes custom revision SQLSTATE',async()=>{
  const previous=await readFile('supabase/migrations/20261012000200_private_permissions_hardening.sql','utf8');
  const incremental=await readFile('supabase/migrations/20261019000100_revision_conflict_http_409.sql','utf8');
  const body=previous.slice(previous.indexOf('create or replace function public.save_activity_aggregate'),previous.indexOf('create or replace function public.get_activity_aggregate')).trim();
  assert.equal(incremental.slice(incremental.indexOf('create or replace function')).trim(),body.replace("raise exception 'Stale or unavailable activity revision' using errcode = '40001';","raise sqlstate 'PT409' using message = 'Stale or unavailable activity revision';"));
});
