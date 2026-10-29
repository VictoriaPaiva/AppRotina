import type { ProjectTask } from './contracts';
export function projectProgressById(tasks: Pick<ProjectTask,'projectId'|'completedAt'>[]) {
  const counts=new Map<string,{total:number;completed:number;percentage:number}>();
  for(const task of tasks) {
    const value=counts.get(task.projectId) ?? {total:0,completed:0,percentage:0};
    value.total++;if(task.completedAt!==null)value.completed++;
    counts.set(task.projectId,value);
  }
  for(const value of counts.values())value.percentage=Math.round(value.completed/value.total*100);
  return counts;
}
export function projectProgress(tasks: Pick<ProjectTask, 'completedAt'>[]) {
  const total = tasks.length, completed = tasks.filter(task => task.completedAt !== null).length;
  return {total, completed, percentage: total ? Math.round(completed / total * 100) : 0};
}
