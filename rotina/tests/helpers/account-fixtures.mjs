import {randomUUID} from 'node:crypto';
export const OWNER_TABLES=['activities','areas','commitment_configs','daily_plan_items','financial_transactions','fixed_expense_months','fixed_expenses','fixed_schedules','goals','ideas','planning_contexts','project_tasks','projects','recurrence_rules','reminder_configs','time_windows'];
export const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
export const authFixture=`create role authenticated nologin;create role anon nologin;create schema auth;
create table auth.users(id uuid primary key,email text,encrypted_password text);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
create table auth.refresh_tokens(id uuid primary key,session_id uuid references auth.sessions(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`;
export async function seedAccount(db,id) {
  await db.query('insert into auth.users values($1,$2,$3)',[id,id+'@example.test','test-hash']);
  const session=randomUUID();await db.query('insert into auth.sessions values($1,$2)',[session,id]);await db.query('insert into auth.refresh_tokens values($1,$2)',[randomUUID(),session]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const area=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Teste')",[area,id]);
  const save=async(type,relations={})=>(await db.query('select save_activity_aggregate($1::jsonb,$2::jsonb) v',[JSON.stringify({name:'Teste',area_id:area,type}),JSON.stringify(relations)])).rows[0].v.activity;
  await save('reminder',{reminder_config:{reference_date:'2026-10-28'},recurrence_rules:[{basis:'calendar',pattern:'interval',interval_count:1,unit:'month',anchor_date:'2026-10-28',invalid_date_policy:'lastValidDay',starts_on:'2026-10-28'}]});
  await save('commitment',{commitment_config:{date:'2026-10-28',start_time:'10:00',end_time:'11:00'}});
  await save('fixedActivity',{fixed_schedules:[{weekdays:[1,3],start_time:'08:00',end_time:'09:00'}]});
  const activity=await save('variableActivity',{planning_context:{location:'Teste'},time_windows:[{kind:'timeRange',effect:'preferred',coverage:'startOnly',start_time:'14:00',end_time:'15:00',end_day_offset:0,starts_on:'2026-10-28'}]});
  await save('checklistGoal',{goals:[{metric:'count',unit:'execution',minimum_target:1,period:'day',starts_on:'2026-10-28'}]});
  await db.query("insert into daily_plan_items(user_id,activity_id,planned_date) values($1,$2,'2026-10-28')",[id,activity.id]);
  await db.query("insert into ideas(user_id,title) values($1,'Teste')",[id]);
  const project=randomUUID();await db.query("insert into projects(id,user_id,title) values($1,$2,'Teste')",[project,id]);await db.query("insert into project_tasks(user_id,project_id,title) values($1,$2,'Teste')",[id,project]);
  await db.query("insert into financial_transactions(user_id,type,date,amount_cents,description,category) values($1,'expense','2026-10-28',12345,'Teste','Teste')",[id]);
  await db.query("select save_fixed_expense($1,'Aluguel',150000,27,'Moradia',true)",[randomUUID()]);
  const bill=(await db.query('select id,updated_at::text from fixed_expense_months where user_id=$1',[id])).rows[0];
  await db.query('select save_fixed_expense_month($1,150000,true,$2::timestamptz)',[bill.id,bill.updated_at]);
}
export async function snapshot(db,id) {
  const result={};
  for(const table of [...OWNER_TABLES,'auth.users','auth.sessions']) {
    result[table]=(await db.query(`select to_jsonb(t) v from ${table} t where ${table==='auth.users'?'id':'user_id'}=$1 order by to_jsonb(t)::text`,[id])).rows;
  }
  result.refresh=(await db.query('select to_jsonb(t) v from auth.refresh_tokens t join auth.sessions s on s.id=t.session_id where s.user_id=$1 order by t.id',[id])).rows;
  return result;
}
