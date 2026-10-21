/* eslint-disable @typescript-eslint/no-require-imports -- Testes Node de mappers TypeScript. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {load}=require('./helpers/load-typescript.cjs');
const {fixture,databaseResult}=require('./helpers/data-fixtures.cjs');
const mapper=load('lib/banco-mestre/data/mapper.ts');
const validation=load('lib/banco-mestre/data/validation.ts');
const {MapperError}=load('lib/banco-mestre/data/errors.ts');
const make=(name)=>{const bundle=fixture(name);const args=mapper.aggregateToRpc(bundle,bundle.activity.status==='inactive'?1:undefined);return {bundle,args,data:databaseResult(args,bundle)};};

for(const name of ['aniversario-mae','dentista','trabalho','academia','faxina','agua','escovar','cabelo']) test('roundtrip do cenário '+name,()=>{
  const {bundle,args,data}=make(name);
  const result=mapper.aggregateFromDatabase(data);
  assert.deepEqual(result.bundle,bundle); assert.equal(result.revision,1);
  assert(!('user_id' in args.p_activity)); assert(!('revision' in args.p_activity));
  assert(!('created_at' in args.p_activity));
  for(const row of [...args.p_relations.goals,...args.p_relations.recurrence_rules,...args.p_relations.fixed_schedules,...args.p_relations.time_windows]) assert(!('activity_id' in row)&&!('user_id' in row));
});
test('todos os dias ISO ida/volta, ordem canônica e rejeição de conjuntos inválidos',()=>{
  assert.deepEqual(validation.fromIsoWeekdays([1,2,3,4,5,6,7]),validation.weekdays);
  assert.deepEqual(validation.toIsoWeekdays(['sunday','monday']),[1,7]);
  for(const values of [[],[0],[8],[1,1],[2,1],[null]]) assert.throws(()=>validation.fromIsoWeekdays(values),MapperError);
  for(const values of [[],['nope'],['monday','monday']]) assert.throws(()=>validation.toIsoWeekdays(values),MapperError);
});
test('numeric seguro: números/decimais strings, integralidade antes do arredondamento',()=>{
  for(const n of [1.5,'1.5','.5','+1.50','9007199254740991']) assert.equal(validation.parseDatabaseNumber(n),Number(n));
  for(const n of [NaN,Infinity,-Infinity,'NaN','Infinity','',' ','0x10','1,5','1e3',{},null,'9007199254740991.1','9007199254740992']) assert.throws(()=>validation.parseDatabaseNumber(n),MapperError);
  assert.equal(validation.parseDatabaseNumber('30.000','minutes',true),30);
  for(const n of ['30.5','1.00000000000000001']) assert.throws(()=>validation.parseDatabaseNumber(n,'count',true),MapperError);
});
test('datas civis/leap year e time com segundos zero, sem mudança de timezone',()=>{
  for(const date of ['0001-01-01','2024-02-29','2026-10-11','9999-12-31']) assert.equal(validation.localDate(date,'date'),date);
  for(const date of ['0000-01-01','2026-02-29','1900-02-29','2026-04-31','2026-10-11T00:00:00Z']) assert.throws(()=>validation.localDate(date,'date'),MapperError);
  for(const time of ['09:00','09:00:00','09:00:00.000']) assert.equal(validation.localTime(time,'time'),'09:00');
  for(const time of ['24:00','09:00:01','09:00:00.1','9:00','09:00Z']) assert.throws(()=>validation.localTime(time,'time'),MapperError);
});
test('durations unknown/fixed/minimumIdeal e rejeição de shapes inválidos nos dois sentidos',()=>{
  const {bundle,data}=make('academia');
  for(const changes of [{duration_mode:'fixed',duration_minutes:30.5,min_duration_minutes:null,ideal_duration_minutes:null},{duration_mode:'fixed',duration_minutes:null,min_duration_minutes:null,ideal_duration_minutes:null},{duration_mode:'unknown',duration_minutes:1,min_duration_minutes:null,ideal_duration_minutes:null},{duration_mode:'minimumIdeal',min_duration_minutes:0},{ideal_duration_minutes:29},{duration_mode:'nope'}]) assert.throws(()=>mapper.aggregateFromDatabase({...data,activity:{...data.activity,...changes}}),MapperError);
  for(const duration of [{mode:'unknown',minutes:1},{mode:'fixed',minutes:30.5},{mode:'fixed',minutes:2147483648},{mode:'minimumIdeal',minMinutes:40,idealMinutes:30}]) assert.throws(()=>mapper.aggregateToRpc({...bundle,activity:{...bundle.activity,duration}}),MapperError);
});
test('planejamento opcional preserva zero e travel parcial; ausência gera null',()=>{
  const b=fixture('academia'); b.activity.config={preparationMinutes:0,travel:{returnMinutes:0}};
  const args=mapper.aggregateToRpc(b);
  assert.deepEqual(args.p_relations.planning_context,{location:null,preparation_minutes:0,outbound_minutes:null,return_minutes:0});
  assert.deepEqual(mapper.aggregateFromDatabase(databaseResult(args,b)).bundle,b);
  const empty=make('academia'); assert.equal(empty.args.p_relations.planning_context,null);
  assert.deepEqual(mapper.aggregateFromDatabase(empty.data).bundle.activity.config,{});
});
test('goals: numeric string, quantity decimal, integralidade, units e ideal >= mínimo',()=>{
  const {bundle,data}=make('agua');
  data.goals[0].minimum_target='1.5'; data.goals[0].ideal_target='2.75';
  assert.equal(mapper.aggregateFromDatabase(data).bundle.goals[0].minimumTarget,1.5);
  const bad=[{metric:'duration',unit:'minute',minimum_target:'30.5'},{metric:'count',unit:'execution',minimum_target:'1.5'},{metric:'count',unit:'garrafas'},{minimum_target:0},{minimum_target:11,ideal_target:10},{unit:''},{minimum_target:'9007199254740991.0001'}];
  for(const patch of bad) assert.throws(()=>mapper.aggregateFromDatabase({...data,goals:[{...data.goals[0],...patch}]}),MapperError);
  bundle.goals[0].metric='quantity'; bundle.goals[0].minimumTarget=1.5;
  assert.equal(mapper.aggregateToRpc(bundle).p_relations.goals[0].minimum_target,1.5);
});
test('todos os sete ramos de recurrence, calendar week, ordinal last, completion sem âncora',()=>{
  const b=fixture('cabelo');const base={id:randomUUID(),activityId:b.activity.id,enabled:true,startsOn:'2026-10-11',interval:2};
  const calendar={...base,basis:'calendar',anchorDate:'2026-10-11'};
  const examples=[{...calendar,pattern:'interval',unit:'day'},{...calendar,pattern:'interval',unit:'week'},{...calendar,pattern:'interval',unit:'month',invalidDatePolicy:'skip'},{...calendar,pattern:'weekdays',unit:'week',weekdays:['monday','sunday']},{...calendar,pattern:'monthDay',unit:'month',dayOfMonth:31,invalidDatePolicy:'lastValidDay'},{...calendar,pattern:'monthWeekday',unit:'month',ordinal:'last',weekday:'sunday',invalidDatePolicy:'skip'},{...base,basis:'completion',pattern:'interval',unit:'day'},{...base,basis:'completion',pattern:'interval',unit:'month',invalidDatePolicy:'skip'}];
  b.rules=examples.map(r=>({...r,id:randomUUID()}));
  const args=mapper.aggregateToRpc(b);assert.equal(args.p_relations.recurrence_rules[5].ordinal,-1);
  assert.equal(args.p_relations.recurrence_rules[6].anchor_date,null);
  assert.deepEqual(mapper.aggregateFromDatabase(databaseResult(args,b)).bundle,b);
  const data=databaseResult(args,b);
  for(const patch of [{basis:'completion',anchor_date:'2026-10-11'},{weekdays:[1]},{interval_count:0},{interval_count:0.5},{pattern:'monthDay',unit:'month',day_of_month:32,invalid_date_policy:'skip'}]) assert.throws(()=>mapper.aggregateFromDatabase({...data,recurrence_rules:[{...data.recurrence_rules[0],...patch}]}),MapperError);
});
test('janelas: overnight, weekdays opcionais e fixedStart estrutural sem liberar agregado',()=>{
  const b=fixture('academia'); b.windows[0]={...b.windows[0],startTime:'22:00',endTime:'06:00',endDayOffset:1,weekdays:['monday','sunday']};
  const args=mapper.aggregateToRpc(b),data=databaseResult(args,b);
  assert.deepEqual(mapper.aggregateFromDatabase(data).bundle,b);
  const row={...data.time_windows[0],kind:'fixedStart',end_time:null,end_day_offset:null};
  assert.equal(mapper.timeWindowFromDatabase(row).kind,'fixedStart');
  assert.throws(()=>mapper.aggregateFromDatabase({...data,time_windows:[row]}),MapperError);
  for(const patch of [{effect:'allowed'},{effect:'forbidden'},{end_day_offset:0},{recurrence_rule_id:randomUUID()}]) assert.throws(()=>mapper.aggregateFromDatabase({...data,time_windows:[{...data.time_windows[0],...patch}]}),MapperError);
});
test('metadata, configs, ownership, UUIDs, cardinalidade e IDs duplicados rejeitados',()=>{
  const {bundle,data}=make('dentista');
  for(const patch of [{commitment_config:null},{reminder_config:{...data.commitment_config}},{planning_context:{...data.planning_context,user_id:randomUUID()}},{planning_context:{...data.planning_context,activity_id:randomUUID()}},{activity:{...data.activity,id:'dentista'}},{activity:{...data.activity,revision:0}},{activity:{...data.activity,type:'bad'}}]) assert.throws(()=>mapper.aggregateFromDatabase({...data,...patch}),MapperError);
  assert.throws(()=>mapper.aggregateToRpc({...bundle,activity:{...bundle.activity,id:'dentista'}}),MapperError);
  const g=make('agua');assert.throws(()=>mapper.aggregateFromDatabase({...g.data,goals:[]}),MapperError);
  assert.throws(()=>mapper.aggregateFromDatabase({...g.data,goals:[g.data.goals[0],g.data.goals[0]]}),MapperError);
  assert.throws(()=>mapper.aggregateToRpc({...g.bundle,goals:[{...g.bundle.goals[0],activityId:randomUUID()}]}),MapperError);
  assert.throws(()=>mapper.aggregateFromDatabase({...make('trabalho').data,fixed_schedules:[]}),MapperError);
});
test('sorting determinístico e payload com índice do array; source não é alterado',()=>{
  const {bundle,args,data}=make('academia'),before=structuredClone(data);
  data.goals.reverse();
  assert.deepEqual(mapper.aggregateFromDatabase(data).bundle.goals,bundle.goals);
  assert.deepEqual(args.p_relations.goals.map(g=>g.sort_position),[0,1]);
  assert.deepEqual(data.goals,[...before.goals].reverse());
});
