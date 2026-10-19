import { BancoMestreList } from '@/components/banco-mestre/BancoMestreList';
import { Suspense } from 'react';
import { BancoMestreProvider } from '@/components/banco-mestre/BancoMestreProvider';
import { readBancoMestreList } from '@/lib/banco-mestre/data/read-model';
import { createBancoMestreReader } from '@/lib/banco-mestre/data/server-reader';

async function ListContent() {
  const result=await readBancoMestreList(createBancoMestreReader);
  return result.status==='error'
    ? <BancoMestreList error={result} />
    : <BancoMestreProvider areas={result.areas} activities={result.activities}><BancoMestreList /></BancoMestreProvider>;
}

export default function BancoMestrePage() {
  return <Suspense fallback={<p role="status" aria-live="polite">Carregando Banco Mestre…</p>}><ListContent /></Suspense>;
}
