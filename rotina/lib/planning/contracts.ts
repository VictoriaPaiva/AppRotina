import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';

export interface DailyPlanItem {
  id: string;
  activityId: string;
  plannedDate: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  plannedTime?:string|null;
  sortOrder?:number;
  manualOrder?:boolean;
  activityTypeSnapshot?:string;
  goalTrackingModeSnapshot?:'quantity'|'checklist';
  quantity?:import('@/lib/activities/quantity').QuantityGoal[];
  checklist?:import('@/lib/activities/checklist').ChecklistCheck[];
  subitems?: import('@/lib/activities/subitems').PlanSubitem[];
  plannedDurationMinutes?: number;
  activityNameSnapshot?: string;
}
export type PlanSnapshot = Pick<DailyPlanItem, 'plannedDate' | 'completedAt' | 'updatedAt'>;
export interface CreatePlanInput { id: string; activityId: string; plannedDate: string; plannedTime?:string|null; sourceRevision?:number; configuration?:import('@/lib/activities/subitems').SubitemSelection[] }
export interface TimePlanInput extends ChangePlanInput {plannedTime:string|null}
export interface QuantityPlanInput extends ChangePlanInput {goalId:string;amount?:number;unitIndex?:number;completed?:boolean}
export interface CheckPlanInput extends ChangePlanInput {checklistItemId:string;completed:boolean}
export interface ReorderPlanInput {plannedDate:string;items:ChangePlanInput[]}
export interface ConfigurePlanInput extends ChangePlanInput {configuration:import('@/lib/activities/subitems').SubitemSelection[]}
export interface CompleteSubitemInput extends ChangePlanInput {subitemId:string;completed:boolean}
export interface ChangePlanInput { id: string; expected: PlanSnapshot }
export interface CompletePlanInput extends ChangePlanInput { completed: boolean }
export interface ReschedulePlanInput extends ChangePlanInput { plannedDate: string }
export interface PlanRepository {
  listCompletedOn(date:string):Promise<DailyPlanItem[]>;
  setQuantity(input:QuantityPlanInput):Promise<DailyPlanItem>;
  setTime(input:TimePlanInput):Promise<DailyPlanItem>;
  completeChecklist(input:CheckPlanInput):Promise<DailyPlanItem>;
  reorder(input:ReorderPlanInput):Promise<void>;
  listByRange(start: string, end: string): Promise<DailyPlanItem[]>;
  listByDate(date: string): Promise<DailyPlanItem[]>;
  listPending(today: string): Promise<DailyPlanItem[]>;
  create(input: CreatePlanInput): Promise<DailyPlanItem>;
  setCompleted(input: CompletePlanInput): Promise<DailyPlanItem>;
  reschedule(input: ReschedulePlanInput): Promise<DailyPlanItem>;
  configureSubitems(input:ConfigurePlanInput):Promise<DailyPlanItem>;
  completeSubitem(input:CompleteSubitemInput):Promise<DailyPlanItem>;
}
export type PlanResult = {ok: true} | {ok: false; kind: PersistenceErrorKind; message: string};
export interface PlanActivity { id: string; name: string; active: boolean; type?:string; revision?:number; subitems?:import('@/lib/activities/subitems').ActivityTree }
export type PlanViewItem = DailyPlanItem & {name: string; active: boolean;quantityTotals?:Record<string,number>};
export type PlanReadResult = {status: 'ready'; date: string; today: string; tomorrow: string; items: PlanViewItem[]; pending: PlanViewItem[]; completedToday?:PlanViewItem[]; activities: PlanActivity[]}
  | {status: 'error'; kind: PersistenceErrorKind; message: string};
export const planSnapshot = ({plannedDate, completedAt, updatedAt}: DailyPlanItem): PlanSnapshot => ({plannedDate, completedAt, updatedAt});
