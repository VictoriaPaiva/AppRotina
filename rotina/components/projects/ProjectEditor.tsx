'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import {useDraftProtection} from '@/lib/forms/draft-protection';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProject, updateProject } from '@/app/projetos/actions';
import type { Project, ProjectResult, ProgressMode } from '@/lib/projects/contracts';
import { PROJECT_TITLE_LIMIT, PROJECT_DESCRIPTION_LIMIT } from '@/lib/projects/validation';


export function ProjectEditor({project}: {project?: Project}) {
  const router = useRouter();
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [progressMode, setProgressMode] = useState<ProgressMode>(project?.progressMode ?? 'tasks');
  const [manualProgressPercent, setManualProgressPercent] = useState(project?.manualProgressPercent ?? 0);
  const [saved, setSaved] = useState(project);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<ProjectResult, {ok: false}> | null>(null);
  const [success, setSuccess] = useState(false);
  const saving = useRef(false), attemptId = useRef<string | null>(null), navigating = useRef(false);
  useLayoutEffect(() => () => {
    // Activity preserves hidden routes, including the saved project and refs.
    // Retire only a confirmed creation; preserve edits and unfinished drafts.
    if (project || !navigating.current) return;
    navigating.current = false;
    attemptId.current = null;
    saving.current = false;
    setSaved(undefined);
    setTitle('');
    setDescription('');
    setProgressMode('tasks');
    setManualProgressPercent(0);
    setBusy(false);
    setFailure(null);
    setSuccess(false);
  }, [project]);
  const dirty = title !== (saved?.title ?? '') || description !== (saved?.description ?? '') || progressMode !== (saved?.progressMode ?? 'tasks') || manualProgressPercent !== (saved?.manualProgressPercent ?? 0);
  const allowNavigation=useDraftProtection(dirty,busy);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || navigating.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      attemptId.current ??= crypto.randomUUID();
      const input = {id: saved?.id ?? attemptId.current, title, description, progressMode, manualProgressPercent};
      const result = saved ? await updateProject({...input, expectedUpdatedAt: saved.updatedAt}) : await createProject(input);
      if (!result.ok) { setFailure(result); return; }
      setSaved(result.project); setTitle(result.project.title); setDescription(result.project.description); setSuccess(true);
      setProgressMode(result.project.progressMode ?? 'tasks'); setManualProgressPercent(result.project.manualProgressPercent ?? 0);
      if (!saved) {
        navigating.current = true;
        router.replace(`/projetos/${result.project.id}`); router.refresh();
      } else router.refresh();
    } catch {
      setFailure({ok: false, kind: 'Unknown', message: 'Não foi possível confirmar o salvamento. Seu texto foi mantido. Consulte os dados salvos antes de tentar novamente.'});
    } finally { saving.current = false; setBusy(false); }
  }
  function reload() {
    if ((!dirty || window.confirm('Recarregar descarta o texto não salvo. Deseja continuar?'))) {allowNavigation();window.location.reload();}
  }
  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href="/projetos" className="text-sm underline">Voltar aos projetos</Link>
    <h1 className="text-2xl font-semibold">{saved ? 'Editar projeto' : 'Novo projeto'}</h1>
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="project-progress-mode">Como medir o progresso?</Label><select id="project-progress-mode" value={progressMode} disabled={busy || navigating.current} className="min-h-11 w-full rounded-md border bg-background px-3" onChange={event=>{setProgressMode(event.target.value as ProgressMode);setSuccess(false);}}><option value="tasks">Por tarefas</option><option value="manual">Manual</option><option value="hybrid">Híbrido</option></select></div>
      {progressMode !== 'tasks' && <div className="space-y-2"><Label htmlFor="project-manual-progress">Progresso manual: {manualProgressPercent}%</Label><input id="project-manual-progress" type="range" min={0} max={100} step={1} value={manualProgressPercent} disabled={busy || navigating.current} className="min-h-11 w-full" aria-valuetext={manualProgressPercent+'%'} onChange={event=>{setManualProgressPercent(Number(event.target.value));setSuccess(false);}} />{progressMode === 'hybrid' && <p className="text-sm text-muted-foreground">O progresso por tarefas também será calculado e exibido separadamente, sem média com o manual.</p>}</div>}
      {dirty && <p aria-live="polite" className="text-sm text-muted-foreground">Alterações não salvas.</p>}
      <div className="space-y-2"><Label htmlFor="project-title">Título</Label><Input id="project-title" required value={title} disabled={busy || navigating.current} onChange={event => {setTitle(event.target.value); setSuccess(false);}} aria-describedby="title-limit" /><p id="title-limit" className="text-xs text-muted-foreground">Até {PROJECT_TITLE_LIMIT} caracteres.</p></div>
      <div className="space-y-2"><Label htmlFor="project-description">Descrição</Label><textarea id="project-description" value={description} disabled={busy || navigating.current} onChange={event => {setDescription(event.target.value); setSuccess(false);}} rows={6} aria-describedby="description-limit" className="w-full resize-y rounded-md border border-input bg-background p-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" /><p id="description-limit" className="text-xs text-muted-foreground">Até {PROJECT_DESCRIPTION_LIMIT.toLocaleString('pt-BR')} caracteres. Descrição opcional.</p></div>
      {failure && <div role="alert" className="space-y-3"><p>{failure.message}</p><p className="text-sm">Seu texto foi mantido neste formulário.</p>{failure.kind === 'Unauthorized' && <Link className="block underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}<Button type="button" variant="outline" onClick={reload}>Recarregar dados salvos</Button>{!saved && attemptId.current && <Link className="block underline" href={`/projetos/${attemptId.current}`} target="_blank" rel="noopener noreferrer">Consultar esta tentativa em outra aba</Link>}</div>}
      {success && <p role="status">Projeto salvo.</p>}
      <div className="flex flex-wrap items-center gap-4"><Button type="submit" disabled={busy || navigating.current || !title.trim() || Array.from(title).length > PROJECT_TITLE_LIMIT || Array.from(description).length > PROJECT_DESCRIPTION_LIMIT || (!!saved && !dirty)}>{busy ? 'Salvando…' : 'Salvar projeto'}</Button>{saved && <p className="text-sm text-muted-foreground">Atualizado em {new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(saved.updatedAt))}</p>}</div>
    </form>
  </div>;
}
