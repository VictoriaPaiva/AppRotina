import type { ProjectTask, Project, ProgressStage } from './contracts';
export const stagePercent: Record<ProgressStage, number> = {not_started:0,started:15,early_progress:35,in_progress:55,advanced:75,finishing:90,completed:100};
export const stageLabels: Record<ProgressStage, string> = {not_started:'Não iniciada',started:'Iniciada',early_progress:'Progresso inicial',in_progress:'Em desenvolvimento',advanced:'Progresso avançado',finishing:'Finalizando',completed:'Concluída'};
type ProgressTask = Pick<ProjectTask,'completedAt'> & Partial<Pick<ProjectTask,'id'|'parentTaskId'|'progressStage'|'progressWeight'>>;

/** Iterative postorder: arbitrary depth, no intermediate rounding or double counting. */
export function taskTreeProgress<T extends ProgressTask>(tasks: T[]) {
  const nodes = new Map(tasks.map((task, index) => [task.id ?? String(index), task]));
  if (nodes.size!==tasks.length) throw new Error('Tarefas duplicadas no snapshot. Atualize o projeto.');
  const children = new Map<string, string[]>(), roots: string[] = [];
  for (const [id, task] of nodes) {
    if (task.parentTaskId) {
      if (!nodes.has(task.parentTaskId)) throw new Error('Hierarquia de tarefas incompleta. Atualize o projeto.');
      const siblings = children.get(task.parentTaskId) ?? []; siblings.push(id); children.set(task.parentTaskId,siblings);
    } else roots.push(id);
  }
  const values = new Map<string,number>(), visiting = new Set<string>();
  const average = (ids: string[]) => {
    let sum=0, weights=0;
    for (const id of ids) { const weight=nodes.get(id)!.progressWeight ?? 1; sum+=values.get(id)!*weight; weights+=weight; }
    return weights ? sum/weights : 0;
  };
  const stack: [string,boolean][] = roots.map(id=>[id,false]);
  while (stack.length) {
    const [id,visited] = stack.pop()!;
    if (visited) {
      const task=nodes.get(id)!, kids=children.get(id) ?? [];
      values.set(id,kids.length ? average(kids) : stagePercent[task.progressStage ?? (task.completedAt ? 'completed':'not_started')]);
      visiting.delete(id);
    } else {
      if (visiting.has(id)) throw new Error('Ciclo de tarefas inválido.');
      visiting.add(id); stack.push([id,true]);
      for (const child of children.get(id) ?? []) stack.push([child,false]);
    }
  }
  if (values.size!==nodes.size) throw new Error('Ciclo de tarefas inválido.');
  return {nodes,children,roots,values,percent:average(roots)};
}
export function projectProgress(tasks: ProgressTask[]) {
  const tree=taskTreeProgress(tasks);
  return {total:tasks.length,completed:[...tree.values.values()].filter(value=>value===100).length,percentage:Math.round(tree.percent)};
}
export function projectProgressById(tasks: (ProgressTask & {projectId:string})[]) {
  const groups=new Map<string,typeof tasks>();
  for (const task of tasks) { const group=groups.get(task.projectId) ?? []; group.push(task); groups.set(task.projectId,group); }
  return new Map([...groups].map(([id,group])=>[id,projectProgress(group)]));
}
export function projectMainProgress(project: Pick<Project,'progressMode'|'manualProgressPercent'>, tasksPercent: number): number | null {
  return project.progressMode==='hybrid' ? null : project.progressMode==='manual' ? project.manualProgressPercent : tasksPercent;
}
