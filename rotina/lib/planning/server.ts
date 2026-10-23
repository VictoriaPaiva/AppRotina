import { createClient } from '@/lib/supabase/server';
import { createBancoMestreRepository } from '@/lib/banco-mestre/data/repository';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { localDate } from '@/lib/banco-mestre/data/validation';
import { createPlanRepository } from './repository';
import { nextPlanDate, planToday } from './dates';
import type { DailyPlanItem, PlanReadResult } from './contracts';

export async function readPlanPage(requestedDate?: unknown): Promise<PlanReadResult> {
  try {
    const client = await createClient();
    const {data, error} = await client.auth.getClaims();
    if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
    const today = planToday(), date = requestedDate === undefined ? today : localDate(requestedDate, 'date');
    const repository = createPlanRepository(client, data.claims.sub);
    const [items, pending, summaries] = await Promise.all([
      repository.listByDate(date), repository.listPending(today), createBancoMestreRepository(client).listActivities(),
    ]);
    // A paginated master read for names/options; never one getActivity per item.
    const activities = summaries.map(({activity}) => ({id: activity.id, name: activity.name, active: activity.status === 'active'}));
    const names = new Map(activities.map(activity => [activity.id, activity]));
    const view = (item: DailyPlanItem) => {
      const activity = names.get(item.activityId);
      if (!activity) throw new PersistenceError('NotFound');
      return {...item, name: activity.name, active: activity.active};
    };
    return {status: 'ready', today, tomorrow: nextPlanDate(today), date, items: items.map(view), pending: pending.map(view), activities};
  } catch (error) { return readFailure(error); }
}
