import { ActivityForm } from '@/components/banco-mestre/ActivityForm';
import { ActivityRouteView } from '@/components/banco-mestre/ActivityDetail';
import { Suspense } from 'react';
import { readBancoMestreActivity } from '@/lib/banco-mestre/data/read-model';
import { createBancoMestreReader } from '@/lib/banco-mestre/data/server-reader';

async function EditContent({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const result=await readBancoMestreActivity(createBancoMestreReader,id);
  return result.status==='error'?<ActivityRouteView result={result}/>:<ActivityForm key={id+':'+result.item.revision} initial={result.item.bundle} expectedRevision={result.item.revision} areas={result.areas}/>;
}
export default function EditActivityPage({params}:{params:Promise<{id:string}>}) {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando edição…</p>}><EditContent params={params}/></Suspense>;
}
