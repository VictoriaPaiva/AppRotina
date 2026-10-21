/* eslint-disable @typescript-eslint/no-require-imports -- Fixtures isoladas do runner Node. */
const {randomUUID}=require('node:crypto');
const {load}=require('./load-typescript.cjs');
const mocks=load('lib/banco-mestre/mock-data.ts');
const owner='00000000-0000-4000-8000-000000000001';
function fixture(name) {
  const original=mocks.mockActivities.find(a=>a.id===name);
  const activity=structuredClone(original);
  activity.id=randomUUID(); activity.areaId=randomUUID();
  if(activity.type==='fixedActivity') for(const s of activity.config.schedules) s.id=randomUUID();
  const rel=list=>structuredClone(list.filter(x=>x.activityId===name)).map(x=>({...x,id:randomUUID(),activityId:activity.id}));
  return {activity,goals:rel(mocks.mockGoals),rules:rel(mocks.mockRecurrenceRules),windows:rel(mocks.mockTimeWindows)};
}
// Simula apenas o formato de transporte PostgreSQL para testes unitários.
// Testes em tests/db/data-layer.test.mjs fazem roundtrip com a RPC REAL.
function databaseResult(args, bundle, revision=1) {
  const p=structuredClone(args.p_relations);
  const audit={created_at:bundle.activity.createdAt,updated_at:bundle.activity.updatedAt,user_id:owner};
  const row=v=>v===null?null:{...v,...audit,activity_id:bundle.activity.id};
  return {activity:{...args.p_activity,...audit,revision},reminder_config:row(p.reminder_config),commitment_config:row(p.commitment_config),planning_context:row(p.planning_context),fixed_schedules:p.fixed_schedules.map(row),goals:p.goals.map(row),recurrence_rules:p.recurrence_rules.map(row),time_windows:p.time_windows.map(row)};
}
module.exports={fixture,databaseResult,owner};
