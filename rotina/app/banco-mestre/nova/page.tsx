import { ActivityForm } from '@/components/banco-mestre/ActivityForm';
import { Suspense } from 'react';
import { readBancoMestreAreas } from '@/lib/banco-mestre/data/read-model';
import { createBancoMestreReader } from '@/lib/banco-mestre/data/server-reader';

async function NewContent() {
  const result=await readBancoMestreAreas(createBancoMestreReader);
  return result.status==='error'?<ActivityForm areas={[]} failure={result}/>:<ActivityForm areas={result.areas}/>;
}
export default function NewActivityPage() {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando formulário…</p>}><NewContent /></Suspense>;
}
