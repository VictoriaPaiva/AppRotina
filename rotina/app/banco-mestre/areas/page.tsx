import { Suspense } from 'react';
import { AreaManagement } from '@/components/banco-mestre/AreaManagement';
import { readManagedAreas } from '@/lib/banco-mestre/data/area-read-model';
import { createManagedAreasReader } from '@/lib/banco-mestre/data/area-server-reader';
import { areaReturnTo } from '@/lib/banco-mestre/area-navigation';

type SearchParams=Promise<{returnTo?:string|string[]}>;
async function AreasContent({searchParams}:{searchParams:SearchParams}) {
  const query=await searchParams;
  return <AreaManagement result={await readManagedAreas(createManagedAreasReader)} returnTo={areaReturnTo(query.returnTo)} />;
}
export default function AreasPage({searchParams}:{searchParams:SearchParams}) {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando áreas…</p>}><AreasContent searchParams={searchParams} /></Suspense>;
}
