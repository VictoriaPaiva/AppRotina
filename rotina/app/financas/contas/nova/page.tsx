import { Suspense } from 'react';
import { FixedExpenseEditor } from '@/components/finance/FixedExpenseEditor';
import { FinanceReadError } from '@/components/finance/FinanceReadError';
import { billsRepositoryForSession } from '@/lib/finance/bills-server';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
async function Content() {
  try {await billsRepositoryForSession();} catch (error) {return <FinanceReadError data={readFailure(error)} />;}
  return <FixedExpenseEditor />;
}
export default function NewFixedExpensePage() {return <Suspense fallback={<p role="status">Carregando cadastro…</p>}><Content /></Suspense>;}
