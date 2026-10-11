import { Suspense } from 'react';
import { ActivityRouteView } from '@/components/banco-mestre/ActivityDetail';

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p role="status">Carregando atividade…</p>}><ActivityRouteView params={params} /></Suspense>;
}
