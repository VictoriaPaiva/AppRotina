import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { PersistenceError, toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { choice, fail, integer, localDate, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { DailyPlanItem, PlanRepository, ChangePlanInput } from './contracts';
import { createPlanInput, completePlanInput, reschedulePlanInput, configurePlanInput, completeSubitemInput, timePlanInput,quantityPlanInput,checkPlanInput,reorderPlanInput,plannedTime } from './validation';
import {quantitySnapshot} from '@/lib/activities/quantity';
import { checklistSnapshot } from '@/lib/activities/checklist';
import { orderPlanItems } from './order';
import { nextPlanDate, PLAN_TIME_ZONE } from './dates';
import { snapshotSubitems } from '@/lib/activities/subitems';
import type { Json } from '@/lib/banco-mestre/data/database.types';

const COLUMNS = 'id,user_id,activity_id,planned_date,completed_at,created_at,updated_at,subitem_snapshot,planned_duration_minutes,activity_name_snapshot,planned_time,sort_order,manual_order,activity_type_snapshot,checklist_snapshot,goal_tracking_mode_snapshot,quantity_snapshot';
export function createPlanRepository(client: Pick<SupabaseClient<Database>, 'from'|'rpc'>, verifiedUserId: string): PlanRepository {
  const owner = uuid(verifiedUserId, 'owner');
  const operation = async <T>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === '23505') throw new PersistenceError('Conflict', error);
        if (error.code === '23503') throw new PersistenceError('NotFound', error);
      }
      throw toPersistenceError(error);
    }
  };
  function rows(data: unknown): DailyPlanItem[] {
    if (!Array.isArray(data)) fail('plans.response');
    return data.map(value => {
      const v = record(value, 'plan');
      if (uuid(v.user_id) !== owner) fail('plan.owner');
      return {id: uuid(v.id), activityId: uuid(v.activity_id), plannedDate: localDate(v.planned_date, 'date'),
        completedAt: v.completed_at === null ? null : timestamp(v.completed_at, 'completedAt'),
        createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt'),
        ...(v.sort_order===undefined?{}:{sortOrder:integer(v.sort_order,'sortOrder',0),manualOrder:v.manual_order===true,plannedTime:v.planned_time===null?null:plannedTime(String(v.planned_time).slice(0,5))}),
        ...(v.activity_type_snapshot==null?{}:{activityTypeSnapshot:String(v.activity_type_snapshot)}),
        ...(v.goal_tracking_mode_snapshot==null?{}:{goalTrackingModeSnapshot:choice(v.goal_tracking_mode_snapshot,['quantity','checklist'] as const,'trackingMode')}),
        ...(v.quantity_snapshot==null?{}:{quantity:quantitySnapshot(v.quantity_snapshot)}),
        ...(v.checklist_snapshot==null?{}:{checklist:checklistSnapshot(v.checklist_snapshot)}),
        ...(v.activity_name_snapshot==null?{}:{activityNameSnapshot:String(v.activity_name_snapshot)}),
        ...(v.subitem_snapshot==null?{}:{subitems:snapshotSubitems(v.subitem_snapshot),plannedDurationMinutes:integer(v.planned_duration_minutes,'duration',0),activityNameSnapshot:String(v.activity_name_snapshot)})};
    });
  }
  async function list(date: string, pending: boolean): Promise<DailyPlanItem[]> {
    const valid = localDate(date, 'date'), result: DailyPlanItem[] = [];
    for (let offset = 0;; offset += 500) {
      let q = client.from('daily_plan_items').select(COLUMNS).eq('user_id', owner);
      q = pending ? q.lt('planned_date', valid).is('completed_at', null) : q.eq('planned_date', valid);
      const {data, error} = await q.order('planned_date').order('sort_order').order('created_at').order('id').range(offset, offset + 499);
      if (error) throw error;
      const page = rows(data); result.push(...page);
      if (page.length < 500) return orderPlanItems(result);
    }
  }
  async function update(input: ChangePlanInput, patch: {completed_at: string | null} | {planned_date: string}): Promise<DailyPlanItem> {
    let q = client.from('daily_plan_items').update(patch).eq('id', input.id).eq('user_id', owner)
      .eq('updated_at', input.expected.updatedAt).eq('planned_date', input.expected.plannedDate);
    q = input.expected.completedAt === null ? q.is('completed_at', null) : q.eq('completed_at', input.expected.completedAt);
    const {data, error} = await q.select(COLUMNS);
    if (error) throw error;
    const changed = rows(data);
    if (changed.length === 1) return changed[0];
    if (changed.length !== 0) fail('plans.update');
    const visible = await client.from('daily_plan_items').select('id').eq('id', input.id).eq('user_id', owner).limit(1);
    if (visible.error) throw visible.error;
    if (!Array.isArray(visible.data)) fail('plans.available');
    throw new PersistenceError(visible.data.length ? 'Conflict' : 'NotFound');
  }
  return {
    listCompletedOn:date=>operation(async()=>{
      const valid=localDate(date,'date'),result:DailyPlanItem[]=[];
      // PostgreSQL interprets these civil midnights in the application's IANA
      // timezone. Include completed backlog, without scanning pending history.
      for(let offset=0;;offset+=500){
        const {data,error}=await client.from('daily_plan_items').select(COLUMNS).eq('user_id',owner)
          .gte('completed_at',`${valid} 00:00:00 ${PLAN_TIME_ZONE}`)
          .lt('completed_at',`${nextPlanDate(valid)} 00:00:00 ${PLAN_TIME_ZONE}`)
          .order('planned_date').order('sort_order').order('created_at').order('id').range(offset,offset+499);
        if(error)throw error;
        const page=rows(data);result.push(...page);
        if(page.length<500)return orderPlanItems(result);
      }
    }),
    setTime:input=>operation(async()=>{const v=timePlanInput(input),{data,error}=await client.rpc('change_daily_plan_v05',{p_id:v.id,p_expected:v.expected as unknown as Json,p_operation:'time',p_value:{plannedTime:v.plannedTime}});if(error)throw error;return rows([data])[0];}),
    completeChecklist:input=>operation(async()=>{const v=checkPlanInput(input),{data,error}=await client.rpc('change_daily_plan_v05',{p_id:v.id,p_expected:v.expected as unknown as Json,p_operation:'check',p_value:{id:v.checklistItemId,completed:v.completed}});if(error)throw error;return rows([data])[0];}),
    reorder:input=>operation(async()=>{const v=reorderPlanInput(input),{error}=await client.rpc('reorder_plan_day',{p_date:v.plannedDate,p_items:v.items as unknown as Json});if(error)throw error;}),
    listByRange: (start, end) => operation(async () => {
      const from = localDate(start, 'start'), to = localDate(end, 'end');
      if (from > to) fail('range');
      const result: DailyPlanItem[] = [];
      for (let offset = 0;; offset += 500) {
        const {data, error} = await client.from('daily_plan_items').select(COLUMNS).eq('user_id', owner)
          .gte('planned_date', from).lte('planned_date', to)
          .order('planned_date').order('sort_order').order('created_at').order('id').range(offset, offset + 499);
        if (error) throw error;
        const page = rows(data); result.push(...page);
        if (page.length < 500) return orderPlanItems(result);
      }
    }),
    listByDate: date => operation(() => list(date, false)),
    listPending: today => operation(() => list(today, true)),
    create: input => operation(async () => {
      const v = createPlanInput(input);
      if(v.plannedTime!==undefined){const {data,error}=await client.rpc('create_daily_plan_v05',{p_id:v.id,p_activity_id:v.activityId,p_planned_date:v.plannedDate,p_planned_time:v.plannedTime,p_revision:v.sourceRevision??null,p_configuration:(v.configuration??null) as unknown as Json});if(error)throw error;return rows([data])[0];}
      if(v.sourceRevision!==undefined){
        const {data,error}=await client.rpc('create_plan_with_subitems',{p_id:v.id,p_activity_id:v.activityId,p_planned_date:v.plannedDate,p_revision:v.sourceRevision,p_configuration:(v.configuration??null) as unknown as Json});
        if(error)throw error;return rows([data])[0];
      }
      const {data, error} = await client.from('daily_plan_items').insert({id: v.id, user_id: owner, activity_id: v.activityId, planned_date: v.plannedDate}).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length !== 1 || result[0].id !== v.id) fail('plans.create');
      return result[0];
    }),
    setQuantity:input=>operation(async()=>{const v=quantityPlanInput(input);const {data,error}=await client.rpc('change_daily_plan_v05',{p_id:v.id,p_expected:v.expected as unknown as Json,p_operation:'quantity',p_value:{goalId:v.goalId,...(v.amount===undefined?{unitIndex:v.unitIndex,completed:v.completed}:{amount:v.amount})} as Json});if(error)throw error;return rows([data])[0];}),
    setCompleted: input => operation(() => {
      const v = completePlanInput(input);
      // The trigger replaces this marker with the database clock.
      return update(v, {completed_at: v.completed ? '2000-01-01T00:00:00Z' : null});
    }),
    reschedule: input => operation(() => { const v = reschedulePlanInput(input); return update(v, {planned_date: v.plannedDate}); }),
    configureSubitems:input=>operation(async()=>{
      const v=configurePlanInput(input),{data,error}=await client.rpc('change_plan_subitems',{p_id:v.id,p_expected:v.expected as unknown as Json,p_configuration:v.configuration as unknown as Json});
      if(error)throw error;return rows([data])[0];
    }),
    completeSubitem:input=>operation(async()=>{
      const v=completeSubitemInput(input),{data,error}=await client.rpc('change_plan_subitems',{p_id:v.id,p_expected:v.expected as unknown as Json,p_subitem_id:v.subitemId,p_completed:v.completed});
      if(error)throw error;return rows([data])[0];
    }),
  };
}
