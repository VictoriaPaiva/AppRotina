import { Suspense } from 'react';
import { IdeaEditor } from '@/components/ideas/IdeaEditor';
import { IdeaReadError } from '@/components/ideas/IdeaReadError';
import { readIdea } from '@/lib/ideas/server';
async function Content({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const data = await readIdea(id);
  return data.status === 'ready' ? <IdeaEditor key={data.idea.id + data.idea.updatedAt} idea={data.idea} /> : <IdeaReadError data={data} />;
}
export default function IdeaPage(props: {params: Promise<{id: string}>}) { return <Suspense fallback={<p role="status">Carregando ideia…</p>}><Content {...props} /></Suspense>; }
