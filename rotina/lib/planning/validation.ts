import { parseDatabaseNumber, bool, fail, integer, localDate, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { CreatePlanInput, CompletePlanInput, ReschedulePlanInput, PlanSnapshot, ConfigurePlanInput, CompleteSubitemInput } from './contracts';
import { validateSelection } from '@/lib/activities/subitems';
import type {TimePlanInput,CheckPlanInput,ReorderPlanInput} from './contracts';
export function plannedTime(input:unknown):string|null {if(input===null)return null;if(typeof input!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input))fail('plannedTime');return input;}
export function timePlanInput(input:unknown):TimePlanInput {const v=fields(input,['id','expected','plannedTime']);return {id:uuid(v.id),expected:snapshot(v.expected),plannedTime:plannedTime(v.plannedTime)};}
export function checkPlanInput(input:unknown):CheckPlanInput {const v=fields(input,['id','expected','checklistItemId','completed']);return {id:uuid(v.id),expected:snapshot(v.expected),checklistItemId:uuid(v.checklistItemId),completed:bool(v.completed,'completed')};}
export function reorderPlanInput(input:unknown):ReorderPlanInput {const v=fields(input,['plannedDate','items']);if(!Array.isArray(v.items)||!v.items.length)fail('order');const date=localDate(v.plannedDate,'date');const items=v.items.map(n=>{const r=fields(n,['id','expected']);const expected=snapshot(r.expected);if(expected.plannedDate!==date)fail('order.date');return {id:uuid(r.id),expected};});if(new Set(items.map(n=>n.id)).size!==items.length)fail('order.duplicate');return {plannedDate:date,items};}

function fields(input: unknown, allowed: string[]) {
  const value = record(input, 'plan');
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('plan.input');
  return value;
}
export function snapshot(input: unknown): PlanSnapshot {
  const v = fields(input, ['plannedDate', 'completedAt', 'updatedAt']);
  return {plannedDate: localDate(v.plannedDate, 'date'), completedAt: v.completedAt === null ? null : timestamp(v.completedAt, 'completedAt'), updatedAt: timestamp(v.updatedAt, 'updatedAt')};
}
export function createPlanInput(input: unknown): CreatePlanInput {
  const v = fields(input, ['id', 'activityId', 'plannedDate','sourceRevision','configuration','plannedTime']);
  if(v.configuration!==undefined&&v.sourceRevision===undefined)fail('sourceRevision');
  return {id: uuid(v.id), activityId: uuid(v.activityId), plannedDate: localDate(v.plannedDate, 'date'),...(v.plannedTime===undefined?{}:{plannedTime:plannedTime(v.plannedTime)}),...(v.sourceRevision===undefined?{}:{sourceRevision:integer(v.sourceRevision,'revision',1)}),...(v.configuration===undefined?{}:{configuration:validateSelection(v.configuration)})};
}
export function completePlanInput(input: unknown): CompletePlanInput {
  const v = fields(input, ['id', 'expected', 'completed']);
  return {id: uuid(v.id), expected: snapshot(v.expected), completed: bool(v.completed, 'completed')};
}
export function configurePlanInput(input:unknown):ConfigurePlanInput {const v=fields(input,['id','expected','configuration']);return {id:uuid(v.id),expected:snapshot(v.expected),configuration:validateSelection(v.configuration)};}
export function completeSubitemInput(input:unknown):CompleteSubitemInput {const v=fields(input,['id','expected','subitemId','completed']);return {id:uuid(v.id),expected:snapshot(v.expected),subitemId:uuid(v.subitemId),completed:bool(v.completed,'completed')};}
export function reschedulePlanInput(input: unknown): ReschedulePlanInput {
  const v = fields(input, ['id', 'expected', 'plannedDate']);
  const expected = snapshot(v.expected);
  if (expected.completedAt !== null) fail('completed');
  return {id: uuid(v.id), expected, plannedDate: localDate(v.plannedDate, 'date')};
}

export function quantityPlanInput(input:unknown):import('./contracts').QuantityPlanInput{const v=fields(input,['id','expected','goalId','amount','unitIndex','completed']);const base={id:uuid(v.id),expected:snapshot(v.expected),goalId:uuid(v.goalId)};if(v.amount!==undefined){if(v.unitIndex!==undefined||v.completed!==undefined||typeof v.amount!=='number')fail('quantity.amount');const amount=parseDatabaseNumber(v.amount,'quantity.amount',false,9007199254740991);if(amount<0)fail('quantity.amount');return {...base,amount};}return {...base,unitIndex:integer(v.unitIndex,'quantity.index',0,19),completed:bool(v.completed,'quantity.completed')};}
