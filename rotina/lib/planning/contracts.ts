import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';

export interface DailyPlanItem {
  id: string;
  activityId: string;
  plannedDate: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type PlanSnapshot = Pick<DailyPlanItem, 'plannedDate' | 'completedAt' | 'updatedAt'>;
export interface CreatePlanInput { id: string; activityId: string; plannedDate: string }
export interface ChangePlanInput { id: string; expected: PlanSnapshot }
export interface CompletePlanInput extends ChangePlanInput { completed: boolean }
export interface ReschedulePlanInput extends ChangePlanInput { plannedDate: string }
export interface PlanRepository {
  listByDate(date: string): Promise<DailyPlanItem[]>;
  listPending(today: string): Promise<DailyPlanItem[]>;
  create(input: CreatePlanInput): Promise<DailyPlanItem>;
  setCompleted(input: CompletePlanInput): Promise<DailyPlanItem>;
  reschedule(input: ReschedulePlanInput): Promise<DailyPlanItem>;
}
export type PlanResult = {ok: true} | {ok: false; kind: PersistenceErrorKind; message: string};
export interface PlanActivity { id: string; name: string; active: boolean }
export type PlanViewItem = DailyPlanItem & {name: string; active: boolean};
export type PlanReadResult = {status: 'ready'; date: string; today: string; tomorrow: string; items: PlanViewItem[]; pending: PlanViewItem[]; activities: PlanActivity[]}
  | {status: 'error'; kind: PersistenceErrorKind; message: string};
export const planSnapshot = ({plannedDate, completedAt, updatedAt}: DailyPlanItem): PlanSnapshot => ({plannedDate, completedAt, updatedAt});
