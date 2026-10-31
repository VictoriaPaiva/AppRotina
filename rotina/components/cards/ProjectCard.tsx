import Link from 'next/link';
import type { Project } from '@/lib/projects/contracts';
export function ProjectCard({project, total, completed, percentage}: {project: Project; total: number; completed: number; percentage: number}) {
  const manual=project.progressMode==='manual', hybrid=project.progressMode==='hybrid';
  const main=manual ? project.manualProgressPercent : percentage;
  return <article className="min-w-0 space-y-3 rounded-2xl border border-project-border bg-card p-5 shadow-sm">
    <h2 className="break-words text-lg font-semibold"><Link className="underline" href={'/projetos/'+project.id}>{project.title}</Link></h2>
    {project.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{Array.from(project.description).slice(0,180).join('')}{Array.from(project.description).length > 180 ? '…' : ''}</p>}
    <p>{manual ? 'Progresso manual' : 'Progresso por tarefas'}: {main}%</p>
    {hybrid && <p>Progresso manual: {project.manualProgressPercent}% · Modo híbrido, valores separados</p>}
    <p className="text-sm text-muted-foreground">{completed}/{total} tarefas concluídas</p>
    <progress className="h-2 w-full accent-project" aria-label={(manual?'Progresso manual de ':'Progresso por tarefas de ')+project.title} value={main} max={100} />
  </article>;
}
