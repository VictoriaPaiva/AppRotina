import { createClient } from '@/lib/supabase/server';
import { createBancoMestreRepository } from '@/lib/banco-mestre/data/repository';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { localDate } from '@/lib/banco-mestre/data/validation';
import { createPlanRepository } from './repository';
import { planToday } from './dates';
import { calendarMonth } from './calendar';
import type { PlanViewItem } from './contracts';

export type CalendarItem = PlanViewItem & {areaName?: string};
export type CalendarReadResult = Awaited<ReturnType<typeof readCalendarPage>>;
export async function readCalendarPage(requestedDate?: unknown) {
  try {
    const client = await createClient();
    const {data, error} = await client.auth.getClaims();
    if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
    const today = planToday(), date = requestedDate === undefined ? today : localDate(requestedDate, 'date');
    const month = calendarMonth(date), master = createBancoMestreRepository(client);
    const [plans, summaries, areas] = await Promise.all([
      createPlanRepository(client, data.claims.sub).listByRange(month.start, month.end),
      master.listActivities(), master.listAreas(),
    ]);
    const activities = new Map(summaries.map(({activity}) => [activity.id, activity]));
    const areaNames = new Map(areas.map(area => [area.id, area.name]));
    const items: CalendarItem[] = plans.map(item => {
      const activity = activities.get(item.activityId);
      if (!activity) throw new PersistenceError('NotFound');
      return {...item, name: activity.name, active: activity.status === 'active', areaName: areaNames.get(activity.areaId)};
    });
    return {status: 'ready' as const, today, date, month, items};
  } catch (error) { return readFailure(error); }
}
