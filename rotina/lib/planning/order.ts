import type { DailyPlanItem } from './contracts';
export function orderPlanItems<T extends DailyPlanItem>(items:T[]):T[]{
  return [...items].sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate)
    ||Number(!a.plannedTime)-Number(!b.plannedTime)
    ||(a.plannedTime&&b.plannedTime?a.plannedTime.localeCompare(b.plannedTime):0)
    ||(a.sortOrder??0)-(b.sortOrder??0)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
export function movePlanItem<T extends DailyPlanItem>(items:T[],id:string,direction:-1|1):T[]{
  const result=orderPlanItems(items),from=result.findIndex(n=>n.id===id),to=from+direction;
  if(from<0||to<0||to>=result.length||result[from].plannedDate!==result[to].plannedDate||result[from].plannedTime||result[to].plannedTime)return result;
  [result[from],result[to]]=[result[to],result[from]];return result;
}
