import { Suspense } from 'react';
import { FixedExpenseEditor } from '@/components/finance/FixedExpenseEditor';
import { FinanceReadError } from '@/components/finance/FinanceReadError';
import { readFixedExpense } from '@/lib/finance/bills-server';
async function Content({params}: {params: Promise<{id:string}>}) {
  const {id}=await params,data=await readFixedExpense(id);
  return data.status==='ready'?<FixedExpenseEditor expense={data.expense} />:<FinanceReadError data={data} />;
}
export default function FixedExpensePage(props:{params:Promise<{id:string}>}) {return <Suspense fallback={<p role="status">Carregando conta…</p>}><Content {...props} /></Suspense>;}
