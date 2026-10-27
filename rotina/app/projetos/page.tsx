import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProjectCard } from '@/components/cards/ProjectCard';
import { ProjectReadError } from '@/components/projects/ProjectReadError';
import { readProjects } from '@/lib/projects/server';
import { projectProgress } from '@/lib/projects/progress';
async function Content() {
  const data = await readProjects();
  if (data.status === 'error') return <ProjectReadError data={data} />;
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Projetos</h1><Button asChild><Link href="/projetos/nova">Novo projeto</Link></Button></div>
    {!data.projects.length ? <p>Você ainda não tem projetos. Crie seu primeiro projeto.</p> : <div className="grid gap-4 lg:grid-cols-2">{data.projects.map(project => <ProjectCard key={project.id} project={project} {...projectProgress(data.tasks.filter(task => task.projectId === project.id))} />)}</div>}
  </div>;
}
export default function ProjectsPage() { return <Suspense fallback={<p role="status">Carregando projetos…</p>}><Content /></Suspense>; }
