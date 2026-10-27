import { Suspense } from 'react';
import { ProjectEditor } from '@/components/projects/ProjectEditor';
import { ProjectTasks } from '@/components/projects/ProjectTasks';
import { ProjectReadError } from '@/components/projects/ProjectReadError';
import { readProject } from '@/lib/projects/server';
async function Content({params}: {params: Promise<{id: string}>}) {
  const {id} = await params, data = await readProject(id);
  if (data.status === 'error') return <ProjectReadError data={data} />;
  return <div className="mx-auto max-w-4xl space-y-8"><ProjectEditor project={data.project} /><ProjectTasks projectId={id} initialTasks={data.tasks} /></div>;
}
export default function ProjectPage(props: {params: Promise<{id: string}>}) { return <Suspense fallback={<p role="status">Carregando projeto…</p>}><Content {...props} /></Suspense>; }
