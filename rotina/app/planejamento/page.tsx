import { Suspense } from 'react';
import { PlanPageContent } from '@/components/planning/PlanPageContent';

async function Content({searchParams}: {searchParams: Promise<{date?: string | string[]; activity?: string | string[]}>}) {
  const params = await searchParams;
  return <PlanPageContent date={params.date} activity={params.activity} />;
}
export default function PlanejamentoPage(props: {searchParams: Promise<{date?: string | string[]; activity?: string | string[]}>}) {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando planejamento…</p>}><Content {...props} /></Suspense>;
}
