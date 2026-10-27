import type { ProjectTask } from './contracts';
export function projectProgress(tasks: Pick<ProjectTask, 'completedAt'>[]) {
  const total = tasks.length, completed = tasks.filter(task => task.completedAt !== null).length;
  return {total, completed, percentage: total ? Math.round(completed / total * 100) : 0};
}
