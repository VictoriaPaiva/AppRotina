import { Suspense } from 'react';
import { AreaManagement } from '@/components/banco-mestre/AreaManagement';
import { readManagedAreas } from '@/lib/banco-mestre/data/area-read-model';
import { createManagedAreasReader } from '@/lib/banco-mestre/data/area-server-reader';

async function AreasContent() {
  return <AreaManagement result={await readManagedAreas(createManagedAreasReader)} />;
}
export default function AreasPage() {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando áreas…</p>}><AreasContent /></Suspense>;
}
