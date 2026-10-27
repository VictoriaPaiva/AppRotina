import { Suspense } from 'react';
import { IdeaEditor } from '@/components/ideas/IdeaEditor';
import { IdeaReadError } from '@/components/ideas/IdeaReadError';
import { ideaRepositoryForSession } from '@/lib/ideas/server';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
async function Content() {
  try { await ideaRepositoryForSession(); }
  catch (error) { return <IdeaReadError data={readFailure(error)} />; }
  return <IdeaEditor />;
}
export default function NovaIdeiaPage() { return <Suspense fallback={<p role="status">Carregando…</p>}><Content /></Suspense>; }
