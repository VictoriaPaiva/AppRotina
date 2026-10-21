import type { Activity, Area, Duration, Goal, PlanningContext, RecurrenceRule, TimeWindow } from '@/types/banco-mestre';
import type { Json } from './database.types';
import type { ActivityBundle, PersistedActivityBundle, PersistedActivitySummary, SaveActivityAggregateArgs } from './contracts';
import { bool, choice, fail, fromIsoWeekdays, integer, INT_MAX, localDate, localTime, optionalText, parseDatabaseNumber, record, text, timestamp, toIsoWeekdays, uuid, weekdays } from './validation';

type Data = Record<string, unknown>;
const types = ['reminder','commitment','fixedActivity','variableActivity','checklistGoal'] as const;
function nullFields(row: Data, keys: readonly string[], f: string) { for (const key of keys) if (row[key] !== null) fail(f+'.'+key); }
function ownKeys(row: Data, keys: readonly string[], f: string) { for (const key of Object.keys(row)) if (!keys.includes(key) && row[key] !== undefined) fail(f+'.'+key); }
function duration(row: Data): Duration {
  const mode = choice(row.duration_mode,['unknown','fixed','minimumIdeal'],'duration_mode');
  switch (mode) {
    case 'unknown': nullFields(row,['duration_minutes','min_duration_minutes','ideal_duration_minutes'],'duration'); return {mode};
    case 'fixed': nullFields(row,['min_duration_minutes','ideal_duration_minutes'],'duration'); return {mode,minutes:integer(row.duration_minutes,'duration_minutes',1)};
    case 'minimumIdeal': {
      nullFields(row,['duration_minutes'],'duration');
      const minMinutes = integer(row.min_duration_minutes,'min_duration_minutes',1);
      const idealMinutes = integer(row.ideal_duration_minutes,'ideal_duration_minutes',minMinutes);
      return {mode,minMinutes,idealMinutes};
    }
  }
}
export function activitySummaryFromDatabase(value: unknown): PersistedActivitySummary {
  const row = record(value,'activity');
  uuid(row.user_id,'activity.user_id');
  const description = optionalText(row.description,'description');
  return {revision:integer(row.revision,'revision',1),activity:{
    id:uuid(row.id), name:text(row.name,'name'), ...(description === undefined ? {} : {description}),
    areaId:uuid(row.area_id,'area_id'), status:choice(row.status,['active','inactive'],'status'),
    type:choice(row.type,types,'type'), defaultImportance:choice(row.default_importance,['required','important','optional'],'default_importance'),
    duration:duration(row),createdAt:timestamp(row.created_at,'created_at'),updatedAt:timestamp(row.updated_at,'updated_at'),
  }};
}
export function areaFromDatabase(value: unknown): Area {
  const row=record(value,'area'); uuid(row.user_id,'area.user_id'); integer(row.sort_position,'area.sort_position');
  timestamp(row.created_at,'area.created_at'); timestamp(row.updated_at,'area.updated_at');
  return {id:uuid(row.id),name:text(row.name,'area.name'),active:bool(row.active,'area.active')};
}
function validity(row: Data, f: string) {
  const startsOn=localDate(row.starts_on,f+'.starts_on');
  const endsOn=row.ends_on === null ? undefined : localDate(row.ends_on,f+'.ends_on');
  if (endsOn !== undefined && endsOn < startsOn) fail(f+'.ends_on');
  return {startsOn,...(endsOn === undefined ? {} : {endsOn})};
}
function ownership(row: Data, parent: Data, f: string) {
  if(uuid(row.user_id,f+'.user_id') !== uuid(parent.user_id) || uuid(row.activity_id,f+'.activity_id') !== uuid(parent.id)) fail(f+'.ownership');
  timestamp(row.created_at,f+'.created_at'); timestamp(row.updated_at,f+'.updated_at');
}
function config(value: unknown, parent: Data, f: string): Data | null {
  if(value === null) return null;
  const row=record(value,f); ownership(row,parent,f); return row;
}
function children(value: unknown, parent: Data, f: string): Data[] {
  if(!Array.isArray(value)) fail(f);
  const ids=new Set<string>();
  const rows=value.map((v:unknown)=>{
    const row=record(v,f); ownership(row,parent,f); const id=uuid(row.id,f+'.id');
    if(ids.has(id)) fail(f+'.duplicate_id'); ids.add(id); integer(row.sort_position,f+'.sort_position'); return row;
  });
  return rows.sort((a,b)=>Number(a.sort_position)-Number(b.sort_position) || String(a.id).localeCompare(String(b.id)));
}
function planning(row: Data | null): PlanningContext {
  if(row === null) return {};
  const location=optionalText(row.location,'location');
  const preparationMinutes=row.preparation_minutes === null ? undefined : integer(row.preparation_minutes,'preparation_minutes');
  const outboundMinutes=row.outbound_minutes === null ? undefined : integer(row.outbound_minutes,'outbound_minutes');
  const returnMinutes=row.return_minutes === null ? undefined : integer(row.return_minutes,'return_minutes');
  return {...(location === undefined ? {} : {location}),...(preparationMinutes === undefined ? {} : {preparationMinutes}),
    ...(outboundMinutes === undefined && returnMinutes === undefined ? {} : {travel:{...(outboundMinutes === undefined ? {} : {outboundMinutes}),...(returnMinutes === undefined ? {} : {returnMinutes})}})};
}
function schedule(row: Data) {
  const startTime=localTime(row.start_time,'schedule.start_time'),endTime=localTime(row.end_time,'schedule.end_time');
  if(endTime <= startTime) fail('schedule.end_time');
  return {id:uuid(row.id),weekdays:fromIsoWeekdays(row.weekdays),startTime,endTime};
}
function goal(row: Data): Goal {
  const metric=choice(row.metric,['count','duration','quantity'],'goal.metric');
  const minimumTarget=parseDatabaseNumber(row.minimum_target,'goal.minimum_target',metric !== 'quantity',metric === 'duration' ? INT_MAX : Number.MAX_SAFE_INTEGER);
  const idealTarget=row.ideal_target === null ? undefined : parseDatabaseNumber(row.ideal_target,'goal.ideal_target',metric !== 'quantity',metric === 'duration' ? INT_MAX : Number.MAX_SAFE_INTEGER);
  if(minimumTarget <= 0 || (idealTarget !== undefined && idealTarget < minimumTarget)) fail('goal.targets');
  const base={id:uuid(row.id),activityId:uuid(row.activity_id),enabled:bool(row.enabled,'goal.enabled'),minimumTarget,
    ...(idealTarget === undefined ? {} : {idealTarget}),period:choice(row.period,['day','week','month'],'goal.period'),...validity(row,'goal')};
  const unit=text(row.unit,'goal.unit');
  switch(metric) {
    case 'count': if(unit !== 'execution') fail('goal.unit'); return {...base,metric,unit};
    case 'duration': if(unit !== 'minute') fail('goal.unit'); return {...base,metric,unit};
    case 'quantity': return {...base,metric,unit};
  }
}
function rule(row: Data): RecurrenceRule {
  const basis=choice(row.basis,['calendar','completion'],'rule.basis');
  const pattern=choice(row.pattern,['interval','weekdays','monthDay','monthWeekday'],'rule.pattern');
  const unit=choice(row.unit,['day','week','month'],'rule.unit');
  const interval=integer(row.interval_count,'rule.interval_count',1);
  const label=optionalText(row.label,'rule.label');
  const base={id:uuid(row.id),activityId:uuid(row.activity_id),enabled:bool(row.enabled,'rule.enabled'),...(label === undefined ? {} : {label}),...validity(row,'rule')};
  const invalidDatePolicy=unit === 'month' ? choice(row.invalid_date_policy,['lastValidDay','skip'],'rule.invalid_date_policy') : undefined;
  if(unit !== 'month') nullFields(row,['invalid_date_policy'],'rule');
  if(pattern === 'interval') nullFields(row,['weekdays','day_of_month','ordinal','weekday'],'rule');
  if(basis === 'completion') {
    nullFields(row,['anchor_date'],'rule');
    if(pattern !== 'interval' || unit === 'week') fail('rule.completion');
    if(unit === 'month') return {...base,basis,pattern:'interval',unit,interval,invalidDatePolicy:invalidDatePolicy ?? fail('rule.policy')};
    return {...base,basis,pattern:'interval',unit,interval};
  }
  const calendar={...base,basis,interval,anchorDate:localDate(row.anchor_date,'rule.anchor_date')};
  switch(pattern) {
    case 'interval': return unit === 'month' ? {...calendar,pattern,unit,invalidDatePolicy:invalidDatePolicy ?? fail('rule.policy')} : {...calendar,pattern,unit};
    case 'weekdays':
      if(unit !== 'week') fail('rule.unit'); nullFields(row,['day_of_month','ordinal','weekday'],'rule');
      return {...calendar,pattern,unit,weekdays:fromIsoWeekdays(row.weekdays)};
    case 'monthDay':
      if(unit !== 'month') fail('rule.unit'); nullFields(row,['weekdays','ordinal','weekday'],'rule');
      return {...calendar,pattern,unit,dayOfMonth:integer(row.day_of_month,'rule.day_of_month',1,31),invalidDatePolicy:invalidDatePolicy ?? fail('rule.policy')};
    case 'monthWeekday': {
      if(unit !== 'month') fail('rule.unit'); nullFields(row,['weekdays','day_of_month'],'rule');
      const ordinal=row.ordinal === -1 ? 'last' : integer(row.ordinal,'rule.ordinal',1,5);
      if(ordinal !== 'last' && ordinal !== 1 && ordinal !== 2 && ordinal !== 3 && ordinal !== 4 && ordinal !== 5) fail('rule.ordinal');
      return {...calendar,pattern,unit,ordinal,weekday:weekdays[integer(row.weekday,'rule.weekday',1,7)-1],invalidDatePolicy:invalidDatePolicy ?? fail('rule.policy')};
    }
  }
}
/** Reconstrói todas as uniões; o agregado aplica adicionalmente a matriz ativa da B.1. */
export function timeWindowFromDatabase(value: unknown): TimeWindow {
  const row=record(value,'window');
  const kind=choice(row.kind,['weekdays','timeRange','fixedStart'],'window.kind');
  const recurrenceRuleId=row.recurrence_rule_id === null ? undefined : uuid(row.recurrence_rule_id,'window.recurrence_rule_id');
  const base={id:uuid(row.id),activityId:uuid(row.activity_id),...(recurrenceRuleId === undefined ? {} : {recurrenceRuleId}),
    effect:choice(row.effect,['allowed','forbidden','preferred'],'window.effect'),coverage:choice(row.coverage,['startOnly','wholeActivity'],'window.coverage'),...validity(row,'window')};
  if(kind === 'weekdays') { nullFields(row,['start_time','end_time','end_day_offset'],'window'); return {...base,kind,weekdays:fromIsoWeekdays(row.weekdays)}; }
  const days=row.weekdays === null ? {} : {weekdays:fromIsoWeekdays(row.weekdays)};
  const startTime=localTime(row.start_time,'window.start_time');
  if(kind === 'fixedStart') {
    nullFields(row,['end_time','end_day_offset'],'window'); if(base.coverage !== 'startOnly') fail('window.coverage');
    return {...base,kind,...days,startTime,coverage:'startOnly'};
  }
  const endTime=localTime(row.end_time,'window.end_time');
  const endDayOffset=integer(row.end_day_offset,'window.end_day_offset',0,1);
  if((endDayOffset === 0 && endTime <= startTime) || (endDayOffset === 1 && endTime > startTime)) fail('window.range');
  return {...base,kind,...days,startTime,endTime,endDayOffset:endDayOffset === 0 ? 0 : 1};
}
export function aggregateFromDatabase(value: unknown): PersistedActivityBundle {
  const data=record(value,'aggregate'),row=record(data.activity,'activity');
  const {activity:base,revision}=activitySummaryFromDatabase(row);
  const reminder=config(data.reminder_config,row,'reminder_config'),commitment=config(data.commitment_config,row,'commitment_config'),context=config(data.planning_context,row,'planning_context');
  const schedules=children(data.fixed_schedules,row,'fixed_schedules').map(schedule);
  const goals=children(data.goals,row,'goals').map(goal),rules=children(data.recurrence_rules,row,'rules').map(rule),windows=children(data.time_windows,row,'windows').map(timeWindowFromDatabase);
  if((base.type === 'reminder') !== (reminder !== null) || (base.type === 'commitment') !== (commitment !== null)) fail('aggregate.config');
  if((base.type === 'fixedActivity' && !schedules.length) || (base.type !== 'fixedActivity' && schedules.length)) fail('aggregate.schedules');
  if((base.type === 'checklistGoal' && !goals.length) || (!['variableActivity','checklistGoal'].includes(base.type) && goals.length)) fail('aggregate.goals');
  if(!['reminder','commitment'].includes(base.type) && rules.length) fail('aggregate.rules');
  if(context !== null && !['commitment','fixedActivity','variableActivity'].includes(base.type)) fail('aggregate.context');
  if(windows.length && (base.type !== 'variableActivity' || windows.some(w=>w.effect !== 'preferred' || w.kind === 'fixedStart' || w.recurrenceRuleId !== undefined))) fail('aggregate.windows');
  let activity: Activity;
  switch(base.type) {
    case 'reminder': {
      const r=reminder ?? fail('reminder_config');
      const reminderTime=r.reminder_time === null ? undefined : localTime(r.reminder_time,'reminder_time');
      activity={...base,type:base.type,config:{referenceDate:localDate(r.reference_date,'reference_date'),...(reminderTime === undefined ? {} : {reminderTime})}}; break;
    }
    case 'commitment': {
      const c=commitment ?? fail('commitment_config');
      const startTime=localTime(c.start_time,'start_time'),endTime=localTime(c.end_time,'end_time'); if(endTime <= startTime) fail('end_time');
      activity={...base,type:base.type,config:{...planning(context),date:localDate(c.date,'date'),startTime,endTime}}; break;
    }
    case 'fixedActivity': activity={...base,type:base.type,config:{...planning(context),schedules}}; break;
    case 'variableActivity': activity={...base,type:base.type,config:planning(context)}; break;
    case 'checklistGoal': activity={...base,type:base.type,config:{}}; break;
  }
  return {bundle:{activity,goals,rules,windows},revision};
}

function json(v: unknown, f: string): Json {
  if(v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if(typeof v === 'number') return Number.isFinite(v) ? v : fail(f);
  if(Array.isArray(v)) return v.map((x:unknown)=>json(x,f));
  const row=record(v,f),result:{[key:string]:Json}={};
  for(const [key,value] of Object.entries(row)) if(value !== undefined) result[key]=json(value,f+'.'+key);
  return result;
}
function domainValidity(v: { startsOn: string; endsOn?: string }) { return {starts_on:v.startsOn,ends_on:v.endsOn ?? null}; }
function planningPayload(c: PlanningContext): Data | null {
  if(c.travel !== undefined) ownKeys(record(c.travel,'travel'),['outboundMinutes','returnMinutes'],'travel');
  const p={location:c.location ?? null,preparation_minutes:c.preparationMinutes ?? null,outbound_minutes:c.travel?.outboundMinutes ?? null,return_minutes:c.travel?.returnMinutes ?? null};
  return Object.values(p).every(v=>v === null) ? null : p;
}
function rulePayload(r: RecurrenceRule, sort_position: number): Data {
  ownKeys(record(r,'rule'),['id','activityId','enabled','label','startsOn','endsOn','basis','pattern','interval','unit',...(r.basis === 'calendar' ? ['anchorDate'] : []),...(r.unit === 'month' ? ['invalidDatePolicy'] : []),...(r.pattern === 'weekdays' ? ['weekdays'] : []),...(r.pattern === 'monthDay' ? ['dayOfMonth'] : []),...(r.pattern === 'monthWeekday' ? ['ordinal','weekday'] : [])],'rule');
  return {id:r.id,enabled:r.enabled,label:r.label ?? null,...domainValidity(r),sort_position,basis:r.basis,pattern:r.pattern,interval_count:r.interval,unit:r.unit,
    anchor_date:r.basis === 'calendar' ? r.anchorDate : null,invalid_date_policy:'invalidDatePolicy' in r ? r.invalidDatePolicy : null,
    weekdays:r.pattern === 'weekdays' ? toIsoWeekdays(r.weekdays) : null,day_of_month:r.pattern === 'monthDay' ? r.dayOfMonth : null,
    ordinal:r.pattern === 'monthWeekday' ? r.ordinal === 'last' ? -1 : r.ordinal : null,
    weekday:r.pattern === 'monthWeekday' ? toIsoWeekdays([r.weekday])[0] : null};
}
function windowPayload(w: TimeWindow, sort_position: number): Data {
  ownKeys(record(w,'window'),['id','activityId','recurrenceRuleId','effect','coverage','startsOn','endsOn','kind','weekdays',...(w.kind === 'weekdays' ? [] : ['startTime']),...(w.kind === 'timeRange' ? ['endTime','endDayOffset'] : [])],'window');
  return {id:w.id,...domainValidity(w),sort_position,recurrence_rule_id:w.recurrenceRuleId ?? null,kind:w.kind,effect:w.effect,coverage:w.coverage,
    weekdays:'weekdays' in w && w.weekdays !== undefined ? toIsoWeekdays(w.weekdays) : null,
    start_time:'startTime' in w ? w.startTime : null,end_time:w.kind === 'timeRange' ? w.endTime : null,end_day_offset:w.kind === 'timeRange' ? w.endDayOffset : null};
}
/** Snapshot completo validado pela mesma fronteira de leitura; nunca usa IDs textuais dos mocks. */
export function aggregateToRpc(bundle: ActivityBundle, expectedRevision?: number): SaveActivityAggregateArgs {
  record(bundle,'bundle');
  const a=bundle.activity; record(a,'activity');
  const d=a.duration; record(d,'duration');
  for(const [key,value] of Object.entries({goals:bundle.goals,rules:bundle.rules,windows:bundle.windows})) {
    if(!Array.isArray(value)) fail(key);
    for(const child of value) record(child,key);
  }
  for(const g of bundle.goals) {
    if(typeof g.minimumTarget !== 'number' || (g.idealTarget !== undefined && typeof g.idealTarget !== 'number')) fail('goal.targets');
  }
  if(a.type === 'fixedActivity') {
    if(!Array.isArray(a.config.schedules)) fail('schedules');
    for(const schedule of a.config.schedules) record(schedule,'schedule');
  }
  const mode=choice(d.mode,['unknown','fixed','minimumIdeal'],'duration.mode');
  ownKeys(record(d,'duration'),mode === 'unknown' ? ['mode'] : mode === 'fixed' ? ['mode','minutes'] : ['mode','minMinutes','idealMinutes'],'duration');
  const p_activity={id:a.id,name:a.name,description:a.description ?? null,area_id:a.areaId,status:a.status,type:a.type,default_importance:a.defaultImportance,
    duration_mode:mode,duration_minutes:d.mode === 'fixed' ? d.minutes : null,min_duration_minutes:d.mode === 'minimumIdeal' ? d.minMinutes : null,ideal_duration_minutes:d.mode === 'minimumIdeal' ? d.idealMinutes : null};
  const isAgenda=a.type === 'commitment' || a.type === 'fixedActivity' || a.type === 'variableActivity';
  const common=isAgenda ? ['location','preparationMinutes','travel'] : [];
  ownKeys(record(a.config,'config'),[...common,...(a.type === 'reminder' ? ['referenceDate','reminderTime'] : a.type === 'commitment' ? ['date','startTime','endTime'] : a.type === 'fixedActivity' ? ['schedules'] : [])],'config');
  const p_relations={
    reminder_config:a.type === 'reminder' ? {reference_date:a.config.referenceDate,reminder_time:a.config.reminderTime ?? null} : null,
    commitment_config:a.type === 'commitment' ? {date:a.config.date,start_time:a.config.startTime,end_time:a.config.endTime} : null,
    planning_context:isAgenda ? planningPayload(a.config) : null,
    fixed_schedules:a.type === 'fixedActivity' ? a.config.schedules.map((s,i)=>({id:s.id,weekdays:toIsoWeekdays(s.weekdays),start_time:s.startTime,end_time:s.endTime,sort_position:i})) : [],
    goals:bundle.goals.map((g,i)=>({id:g.id,enabled:g.enabled,metric:g.metric,unit:g.unit,minimum_target:g.minimumTarget,ideal_target:g.idealTarget ?? null,period:g.period,...domainValidity(g),sort_position:i})),
    recurrence_rules:bundle.rules.map(rulePayload),time_windows:bundle.windows.map(windowPayload),
  };
  const revision=expectedRevision === undefined ? null : integer(expectedRevision,'expectedRevision',1);
  if(revision === null && a.status !== 'active') fail('creation.status');
  for(const relation of [...bundle.goals,...bundle.rules,...bundle.windows]) if(uuid(relation.activityId) !== uuid(a.id)) fail('relation.activityId');
  // Sintetiza somente metadata para reaproveitar a validação integral, sem enviá-la à RPC.
  const owner='00000000-0000-4000-8000-000000000001';
  const metadata={user_id:owner,activity_id:a.id,created_at:a.createdAt,updated_at:a.updatedAt};
  const child=(v:Data | null)=>v === null ? null : {...v,...metadata};
  aggregateFromDatabase({activity:{...p_activity,user_id:owner,revision:revision ?? 1,created_at:a.createdAt,updated_at:a.updatedAt},
    reminder_config:child(p_relations.reminder_config),commitment_config:child(p_relations.commitment_config),planning_context:child(p_relations.planning_context),
    fixed_schedules:p_relations.fixed_schedules.map(child),goals:p_relations.goals.map(child),recurrence_rules:p_relations.recurrence_rules.map(child),time_windows:p_relations.time_windows.map(child)});
  return {p_activity:json(p_activity,'p_activity'),p_relations:json(p_relations,'p_relations'),...(revision === null ? {} : {p_expected_revision:revision})};
}
