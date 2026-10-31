'use client';
import { useRef, useState } from 'react';
import {useDraftProtection} from '@/lib/forms/draft-protection';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createTask, updateTask } from '@/app/projetos/actions';
import type { ProjectTask, Project, ProgressStage } from '@/lib/projects/contracts';
import { projectProgress, taskTreeProgress, stageLabels, stagePercent } from '@/lib/projects/progress';
const stages = Object.keys(stagePercent) as ProgressStage[];
type Failure = {kind: string; message: string};
function TaskFailure({failure}: {failure: Failure | null}) {
  return failure && <div role="alert" className="space-y-2"><p>{failure.message}</p><p>Seu rascunho foi mantido. Consulte os dados salvos em outra aba antes de tentar novamente.</p>{failure.kind === 'Unauthorized' && <Link className="underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}</div>;
}
const uncertain = {kind: 'Unknown', message: 'Não foi possível confirmar o salvamento.'};
export function TaskRow({task, onSaved, derivedPercent, childrenCount = 0, onAddChild}: {task: ProjectTask; onSaved: (task: ProjectTask) => void; derivedPercent?: number; childrenCount?: number; onAddChild?: () => void}) {
  const [saved, setSaved] = useState(task), [title, setTitle] = useState(task.title);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState(false), saving = useRef(false);
  const [stage,setStage] = useState<ProgressStage>(task.progressStage ?? (task.completedAt?'completed':'not_started'));
  const [weight,setWeight] = useState(task.progressWeight ?? 1);
  const savedStage=saved.progressStage ?? (saved.completedAt?'completed':'not_started');
  const editableStage=childrenCount ? savedStage : stage;
  const dirty=title!==saved.title || (!childrenCount && stage!==savedStage) || weight!==(saved.progressWeight ?? 1);
  useDraftProtection(dirty,busy);
  async function save(completed: boolean, nextStage: ProgressStage = completed ? 'completed' : 'not_started') {
    if (saving.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      const result = await updateTask({id: saved.id, projectId: saved.projectId, title, completed, progressStage: nextStage, progressWeight: weight, expectedUpdatedAt: saved.updatedAt});
      if (!result.ok) {setFailure(result); return;}
      setSaved(result.task); setTitle(result.task.title); onSaved(result.task); setSuccess(true);
      setStage(result.task.progressStage ?? (result.task.completedAt?'completed':'not_started')); setWeight(result.task.progressWeight ?? 1);
    } catch {setFailure(uncertain);}
    finally {saving.current = false; setBusy(false);}
  }
  const valid = !!title.trim() && Array.from(title).length <= 200;
  return <li className="space-y-3 rounded-xl border bg-card p-4">
    <form onSubmit={event => {event.preventDefault(); void save(editableStage==='completed',editableStage);}} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 lg:flex lg:flex-wrap">
      <label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" aria-label={`Concluir ou desfazer: ${saved.title}`} checked={childrenCount ? derivedPercent===100 : saved.completedAt !== null} disabled={busy || !valid || childrenCount>0} onChange={event => void save(event.target.checked)} /></label>
      <Input aria-label={`Título da tarefa ${saved.title}`} className={`min-w-0 flex-1 ${(childrenCount ? derivedPercent===100 : saved.completedAt!==null) ? 'line-through' : ''}`} value={title} disabled={busy} required onChange={event => {setTitle(event.target.value); setSuccess(false);}} />
      {!childrenCount && <label className="col-span-2 w-full space-y-1">Estágio: {stageLabels[stage]} — {stagePercent[stage]}%<input aria-label={'Progresso de '+saved.title} aria-valuetext={stageLabels[stage]+' '+stagePercent[stage]+'%'} type="range" min={0} max={6} step={1} value={stages.indexOf(stage)} disabled={busy} className="min-h-11 w-full" onChange={event=>{setStage(stages[Number(event.target.value)]);setSuccess(false);}} /></label>}
      <label className="col-span-2 flex min-h-11 items-center gap-2">Peso<select aria-label={'Peso de '+saved.title} value={weight} disabled={busy} className="min-h-11 rounded-md border bg-background px-3" onChange={event=>{setWeight(Number(event.target.value));setSuccess(false);}}>{![1,2,3,5].includes(weight) && <option value={weight}>{weight}</option>}<option value={1}>Pequeno (1)</option><option value={2}>Médio (2)</option><option value={3}>Grande (3)</option><option value={5}>Muito grande (5)</option></select></label>
      <Button type="submit" variant="outline" className="col-span-2 w-full lg:w-auto" disabled={busy || !valid || !dirty}>{busy ? 'Salvando…' : 'Salvar tarefa'}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{childrenCount ? `Progresso derivado: ${Math.round(derivedPercent ?? 0)}% · ${childrenCount} subtarefas. Edite o progresso nas folhas.` : `${stageLabels[saved.progressStage ?? (saved.completedAt?'completed':'not_started')]} · ${stagePercent[saved.progressStage ?? (saved.completedAt?'completed':'not_started')]}%`}</p>
    {onAddChild && <Button type="button" variant="outline" onClick={onAddChild} disabled={busy}>Adicionar subtarefa</Button>}
    <TaskFailure failure={failure} />{success && <p role="status">Tarefa salva.</p>}
    {failure && <Link className="block underline" href={`/projetos/${task.projectId}`} target="_blank" rel="noopener noreferrer">Consultar projeto em outra aba</Link>}
  </li>;
}
export function ProjectTasks({projectId, initialTasks, project}: {projectId: string; initialTasks: ProjectTask[]; project?: Project}) {
  const [tasks, setTasks] = useState(initialTasks), [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState(false), saving = useRef(false), attemptId = useRef<string | null>(null);
  const [parentTaskId,setParentTaskId] = useState('');
  const progress = projectProgress(tasks);
  const tree=taskTreeProgress(tasks);
  useDraftProtection(title!=='',busy);
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      attemptId.current ??= crypto.randomUUID();
      const result = await createTask({id: attemptId.current, projectId, title, parentTaskId:parentTaskId || null});
      if (!result.ok) {setFailure(result); return;}
      setTasks(current => [...current, result.task]); setTitle(''); setParentTaskId(''); attemptId.current = null; setSuccess(true);
    } catch {setFailure(uncertain);}
    finally {saving.current = false; setBusy(false);}
  }
  function branch(id: string, depth=0): React.ReactNode {
    const task=tree.nodes.get(id)!, children=tree.children.get(id) ?? [];
    return <li key={id} className="min-w-0"><details open className="min-w-0"><summary className="min-h-11 cursor-pointer break-words py-2">{task.title} — {Math.round(tree.values.get(id)!)}%{children.length>0 && ` · ${children.length} subtarefas`}</summary><ul><TaskRow task={task} derivedPercent={tree.values.get(id)} childrenCount={children.length} onAddChild={()=>{setParentTaskId(id);document.getElementById('new-task-title')?.focus();}} onSaved={updated=>setTasks(current=>current.map(item=>item.id===updated.id?updated:item))} /></ul>{children.length>0 && <ul className={depth<3?'space-y-3 border-l pl-3':'space-y-3'}>{children.map(child=>branch(child,depth+1))}</ul>}</details></li>;
  }
  return <section className="space-y-5" aria-label="Tarefas do projeto">
    <h2 className="text-xl font-semibold">Tarefas e progresso</h2>
    <p aria-live="polite">{project?.progressMode==='manual' ? `Progresso manual: ${project.manualProgressPercent}%` : `Progresso por tarefas: ${progress.percentage}%`}{project?.progressMode==='hybrid' && ` · Progresso manual: ${project.manualProgressPercent}% (valores separados)`} · {progress.completed}/{progress.total} tarefas concluídas</p>
    <progress className="h-3 w-full accent-project" aria-label={project?.progressMode==='manual'?'Progresso manual do projeto':'Progresso por tarefas do projeto'} value={project?.progressMode==='manual'?project.manualProgressPercent:progress.percentage} max={100} />
    <form onSubmit={add} className="flex flex-col gap-3"><label>Adicionar em<select aria-label="Tarefa pai" value={parentTaskId} disabled={busy} className="min-h-11 w-full rounded-md border bg-background px-3" onChange={event=>setParentTaskId(event.target.value)}><option value="">Raiz do projeto</option>{tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label><Input id="new-task-title" aria-label="Nova tarefa" placeholder="Título da nova tarefa" required value={title} disabled={busy} className="min-w-0 flex-1" onChange={event => {setTitle(event.target.value); setSuccess(false);}} /><Button disabled={busy || !title.trim() || Array.from(title).length > 200}>{busy ? 'Adicionando…' : 'Adicionar tarefa'}</Button></form>
    <p className="text-xs text-muted-foreground">Títulos de tarefas: até 200 caracteres.</p><TaskFailure failure={failure} />{success && <p role="status">Tarefa adicionada.</p>}
    {failure && <Link className="block underline" href={`/projetos/${projectId}`} target="_blank" rel="noopener noreferrer">Consultar projeto em outra aba</Link>}
    {!tasks.length ? <p>Este projeto ainda não tem tarefas.</p> : <ul className="space-y-3">{tree.roots.map(id=>branch(id))}</ul>}
  </section>;
}
