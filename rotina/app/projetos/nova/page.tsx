import { Suspense } from 'react';
import { ProjectEditor } from '@/components/projects/ProjectEditor';
import { ProjectReadError } from '@/components/projects/ProjectReadError';
import { projectRepositoryForSession } from '@/lib/projects/server';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
async function Content() {
  try { await projectRepositoryForSession(); }
  catch (error) { return <ProjectReadError data={readFailure(error)} />; }
  return <ProjectEditor />;
}
export default function NovaProjetoPage() { return <Suspense fallback={<p role="status">Carregando…</p>}><Content /></Suspense>; }
