import { readPlanPage } from '@/lib/planning/server';
import { PlanningBoard } from './PlanningBoard';

export async function PlanPageContent({date, activity, todayMode = false}: {date?: unknown; activity?: unknown; todayMode?: boolean}) {
  const data = await readPlanPage(todayMode ? undefined : date);
  const initialActivityId = data.status === 'ready' && typeof activity === 'string' && data.activities.some(item => item.id === activity && item.active) ? activity : '';
  const key = data.status === 'ready' ? [data.date, ...data.items.map(item => item.id + item.updatedAt), ...data.pending.map(item => item.id + item.updatedAt), ...data.activities.map(item => item.id + item.name + item.active)].join('|') : data.kind;
  return <PlanningBoard key={key + initialActivityId} data={data} todayMode={todayMode} initialActivityId={initialActivityId} />;
}
