import { bool, fail, localDate, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { CreatePlanInput, CompletePlanInput, ReschedulePlanInput, PlanSnapshot } from './contracts';

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
  const v = fields(input, ['id', 'activityId', 'plannedDate']);
  return {id: uuid(v.id), activityId: uuid(v.activityId), plannedDate: localDate(v.plannedDate, 'date')};
}
export function completePlanInput(input: unknown): CompletePlanInput {
  const v = fields(input, ['id', 'expected', 'completed']);
  return {id: uuid(v.id), expected: snapshot(v.expected), completed: bool(v.completed, 'completed')};
}
export function reschedulePlanInput(input: unknown): ReschedulePlanInput {
  const v = fields(input, ['id', 'expected', 'plannedDate']);
  const expected = snapshot(v.expected);
  if (expected.completedAt !== null) fail('completed');
  return {id: uuid(v.id), expected, plannedDate: localDate(v.plannedDate, 'date')};
}
