import {quantityRange,quantityTotals} from './quantity-totals';
import { createClient } from '@/lib/supabase/server';
import { createBancoMestreRepository } from '@/lib/banco-mestre/data/repository';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { localDate } from '@/lib/banco-mestre/data/validation';
import { createPlanRepository } from './repository';
import { nextPlanDate, planToday } from './dates';
import type { DailyPlanItem, PlanReadResult } from './contracts';
import { validateTree } from '@/lib/activities/subitems';

export async function readPlanPage(requestedDate?: unknown,todayMode=false): Promise<PlanReadResult> {
  try {
    const client = await createClient();
    const {data, error} = await client.auth.getClaims();
    if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
    const today = planToday(), date = requestedDate === undefined ? today : localDate(requestedDate, 'date');
    const repository = createPlanRepository(client, data.claims.sub);
    const master=createBancoMestreRepository(client);
    const [items, pending, summaries,subitems,completedToday] = await Promise.all([
      repository.listByDate(date), repository.listPending(today), master.listActivities(), master.listSubitems(),
      todayMode?repository.listCompletedOn(today):Promise.resolve([]),
    ]);
    // A paginated master read for names/options; never one getActivity per item.
    const groups=new Map<string,typeof subitems>();
    for(const node of subitems){const group=groups.get(node.rootActivityId)??[];group.push(node);groups.set(node.rootActivityId,group);}
    const activities = summaries.map(({activity,revision}) => ({id: activity.id, name: activity.name, active: activity.status === 'active',type:activity.type,revision:groups.get(activity.id)?.[0].revision??revision,
      ...(groups.has(activity.id)?{subitems:validateTree({mode:groups.get(activity.id)![0].mode,items:groups.get(activity.id)!.map(n=>n.item)})}:{})}));
    const names = new Map(activities.map(activity => [activity.id, activity]));
    const view = (item: DailyPlanItem) => {
      const activity = names.get(item.activityId);
      if (!activity) throw new PersistenceError('NotFound');
      return {...item, name: item.activityNameSnapshot??activity.name, active: activity.active,activityTypeSnapshot:item.activityTypeSnapshot??activity.type};
    };
    const range=quantityRange([...items,...pending,...completedToday]);
    const periodRows=range?await repository.listByRange(range.start,range.end):[];
    const views=(rows:DailyPlanItem[])=>range?quantityTotals(rows.map(view),periodRows):rows.map(view);
    return {status: 'ready', today, tomorrow: nextPlanDate(today), date, items:views(items), pending:views(pending),completedToday:views(completedToday), activities};
  } catch (error) { return readFailure(error); }
}
