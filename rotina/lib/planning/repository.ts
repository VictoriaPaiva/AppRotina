import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { PersistenceError, toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { fail, localDate, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { DailyPlanItem, PlanRepository, ChangePlanInput } from './contracts';
import { createPlanInput, completePlanInput, reschedulePlanInput } from './validation';

const COLUMNS = 'id,user_id,activity_id,planned_date,completed_at,created_at,updated_at';
export function createPlanRepository(client: Pick<SupabaseClient<Database>, 'from'>, verifiedUserId: string): PlanRepository {
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
        createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt')};
    });
  }
  async function list(date: string, pending: boolean): Promise<DailyPlanItem[]> {
    const valid = localDate(date, 'date'), result: DailyPlanItem[] = [];
    for (let offset = 0;; offset += 500) {
      let q = client.from('daily_plan_items').select(COLUMNS).eq('user_id', owner);
      q = pending ? q.lt('planned_date', valid).is('completed_at', null) : q.eq('planned_date', valid);
      const {data, error} = await q.order('planned_date').order('created_at').order('id').range(offset, offset + 499);
      if (error) throw error;
      const page = rows(data); result.push(...page);
      if (page.length < 500) return result;
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
    listByRange: (start, end) => operation(async () => {
      const from = localDate(start, 'start'), to = localDate(end, 'end');
      if (from > to) fail('range');
      const result: DailyPlanItem[] = [];
      for (let offset = 0;; offset += 500) {
        const {data, error} = await client.from('daily_plan_items').select(COLUMNS).eq('user_id', owner)
          .gte('planned_date', from).lte('planned_date', to)
          .order('planned_date').order('created_at').order('id').range(offset, offset + 499);
        if (error) throw error;
        const page = rows(data); result.push(...page);
        if (page.length < 500) return result;
      }
    }),
    listByDate: date => operation(() => list(date, false)),
    listPending: today => operation(() => list(today, true)),
    create: input => operation(async () => {
      const v = createPlanInput(input);
      const {data, error} = await client.from('daily_plan_items').insert({id: v.id, user_id: owner, activity_id: v.activityId, planned_date: v.plannedDate}).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length !== 1 || result[0].id !== v.id) fail('plans.create');
      return result[0];
    }),
    setCompleted: input => operation(() => {
      const v = completePlanInput(input);
      // The trigger replaces this marker with the database clock.
      return update(v, {completed_at: v.completed ? '2000-01-01T00:00:00Z' : null});
    }),
    reschedule: input => operation(() => { const v = reschedulePlanInput(input); return update(v, {planned_date: v.plannedDate}); }),
  };
}
