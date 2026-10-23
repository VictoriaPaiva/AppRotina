import { Suspense } from 'react';
import { PlanPageContent } from '@/components/planning/PlanPageContent';

export default function HojePage() {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando Hoje…</p>}><PlanPageContent todayMode /></Suspense>;
}
