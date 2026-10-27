'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createTask, updateTask } from '@/app/projetos/actions';
import type { ProjectTask } from '@/lib/projects/contracts';
import { projectProgress } from '@/lib/projects/progress';
type Failure = {kind: string; message: string};
function TaskFailure({failure}: {failure: Failure | null}) {
  return failure && <div role="alert" className="space-y-2"><p>{failure.message}</p><p>Seu rascunho foi mantido. Consulte os dados salvos em outra aba antes de tentar novamente.</p>{failure.kind === 'Unauthorized' && <Link className="underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}</div>;
}
const uncertain = {kind: 'Unknown', message: 'Não foi possível confirmar o salvamento.'};
export function TaskRow({task, onSaved}: {task: ProjectTask; onSaved: (task: ProjectTask) => void}) {
  const [saved, setSaved] = useState(task), [title, setTitle] = useState(task.title);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState(false), saving = useRef(false);
  async function save(completed: boolean) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      const result = await updateTask({id: saved.id, projectId: saved.projectId, title, completed, expectedUpdatedAt: saved.updatedAt});
      if (!result.ok) {setFailure(result); return;}
      setSaved(result.task); setTitle(result.task.title); onSaved(result.task); setSuccess(true);
    } catch {setFailure(uncertain);}
    finally {saving.current = false; setBusy(false);}
  }
  const valid = !!title.trim() && Array.from(title).length <= 200;
  return <li className="space-y-3 rounded-xl border bg-card p-4">
    <form onSubmit={event => {event.preventDefault(); void save(saved.completedAt !== null);}} className="flex flex-wrap items-center gap-3">
      <input type="checkbox" aria-label={`Concluir ou desfazer: ${saved.title}`} checked={saved.completedAt !== null} disabled={busy || !valid} onChange={event => void save(event.target.checked)} />
      <Input aria-label={`Título da tarefa ${saved.title}`} className={`min-w-0 flex-1 ${saved.completedAt ? 'line-through' : ''}`} value={title} disabled={busy} required onChange={event => {setTitle(event.target.value); setSuccess(false);}} />
      <Button type="submit" variant="outline" disabled={busy || !valid || title === saved.title}>{busy ? 'Salvando…' : 'Salvar tarefa'}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{saved.completedAt ? 'Concluída' : 'Pendente'}</p><TaskFailure failure={failure} />{success && <p role="status">Tarefa salva.</p>}
    {failure && <Link className="block underline" href={`/projetos/${task.projectId}`} target="_blank" rel="noopener noreferrer">Consultar projeto em outra aba</Link>}
  </li>;
}
export function ProjectTasks({projectId, initialTasks}: {projectId: string; initialTasks: ProjectTask[]}) {
  const [tasks, setTasks] = useState(initialTasks), [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState(false), saving = useRef(false), attemptId = useRef<string | null>(null);
  const progress = projectProgress(tasks);
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      attemptId.current ??= crypto.randomUUID();
      const result = await createTask({id: attemptId.current, projectId, title});
      if (!result.ok) {setFailure(result); return;}
      setTasks(current => [...current, result.task]); setTitle(''); attemptId.current = null; setSuccess(true);
    } catch {setFailure(uncertain);}
    finally {saving.current = false; setBusy(false);}
  }
  return <section className="space-y-5" aria-label="Tarefas do projeto">
    <h2 className="text-xl font-semibold">Tarefas e progresso</h2>
    <p aria-live="polite">{progress.percentage}% · {progress.completed}/{progress.total} tarefas concluídas</p>
    <progress className="h-3 w-full accent-project" aria-label="Progresso do projeto" value={progress.percentage} max={100} />
    <form onSubmit={add} className="flex flex-wrap gap-3"><Input aria-label="Nova tarefa" placeholder="Título da nova tarefa" required value={title} disabled={busy} className="min-w-0 flex-1" onChange={event => {setTitle(event.target.value); setSuccess(false);}} /><Button disabled={busy || !title.trim() || Array.from(title).length > 200}>{busy ? 'Adicionando…' : 'Adicionar tarefa'}</Button></form>
    <p className="text-xs text-muted-foreground">Títulos de tarefas: até 200 caracteres.</p><TaskFailure failure={failure} />{success && <p role="status">Tarefa adicionada.</p>}
    {failure && <Link className="block underline" href={`/projetos/${projectId}`} target="_blank" rel="noopener noreferrer">Consultar projeto em outra aba</Link>}
    {!tasks.length ? <p>Este projeto ainda não tem tarefas.</p> : <ul className="space-y-3">{tasks.map(task => <TaskRow key={task.id} task={task} onSaved={updated => setTasks(current => current.map(item => item.id === updated.id ? updated : item))} />)}</ul>}
  </section>;
}
