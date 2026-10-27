import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { readIdeas } from '@/lib/ideas/server';
import { IdeaList } from '@/lib/ideas/presentation';
import { IdeaReadError } from '@/components/ideas/IdeaReadError';
async function Content() {
  const data = await readIdeas();
  if (data.status === 'error') return <IdeaReadError data={data} />;
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Ideias</h1><Button asChild><Link href="/ideias/nova">Nova ideia</Link></Button></div><IdeaList ideas={data.ideas} /></div>;
}
export default function IdeiasPage() { return <Suspense fallback={<p role="status">Carregando ideias…</p>}><Content /></Suspense>; }
