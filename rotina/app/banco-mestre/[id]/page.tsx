import { Suspense } from 'react';
import { ActivityRouteView } from '@/components/banco-mestre/ActivityDetail';
import { readBancoMestreActivity } from '@/lib/banco-mestre/data/read-model';
import { createBancoMestreReader } from '@/lib/banco-mestre/data/server-reader';

async function DetailContent({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <ActivityRouteView result={await readBancoMestreActivity(createBancoMestreReader,id)} />;
}

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando atividade…</p>}><DetailContent params={params} /></Suspense>;
}
