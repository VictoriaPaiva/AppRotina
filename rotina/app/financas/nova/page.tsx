import { Suspense } from 'react';
import { TransactionEditor } from '@/components/finance/TransactionEditor';
import { FinanceReadError } from '@/components/finance/FinanceReadError';
import { financeRepositoryForSession } from '@/lib/finance/server';
import { financeMonth } from '@/lib/finance/validation';
import { planToday } from '@/lib/planning/dates';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
async function Content({searchParams}: {searchParams: Promise<{month?: string}>}) {
  try {
    await financeRepositoryForSession();
    const {month} = await searchParams, today = planToday();
    const selectedMonth = financeMonth(month === undefined ? today.slice(0,7) : month);
    return <TransactionEditor initialDate={today.startsWith(selectedMonth) ? today : selectedMonth + '-01'} />;
  } catch (error) {return <FinanceReadError data={readFailure(error)} />;}
}
export default function NewTransactionPage(props: {searchParams: Promise<{month?: string}>}) {return <Suspense fallback={<p role="status">Carregando…</p>}><Content {...props} /></Suspense>;}
