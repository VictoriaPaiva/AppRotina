import { Suspense } from 'react';
import { TransactionEditor } from '@/components/finance/TransactionEditor';
import { FinanceReadError } from '@/components/finance/FinanceReadError';
import { readTransaction } from '@/lib/finance/server';
import Link from 'next/link';
import { readBillMonth } from '@/lib/finance/bills-server';
async function Content({params}: {params: Promise<{id: string}>}) {
  const {id} = await params, data = await readTransaction(id);
  if (data.status === 'ready' && data.transaction.fixedExpenseMonthId) {
    const source = await readBillMonth(data.transaction.fixedExpenseMonthId);
    if (source.status !== 'ready') return <FinanceReadError data={source} />;
    return <div className="space-y-4"><h1 className="text-2xl font-semibold">Lançamento de conta fixa</h1><p>Este lançamento foi criado pelo pagamento de {source.item.name}. Edite o valor ou desfaça o pagamento em Contas do mês para manter os registros coerentes.</p><Link className="underline" href={`/financas?billMonth=${source.item.referenceMonth}`}>Abrir conta do mês</Link></div>;
  }
  return data.status === 'ready' ? <TransactionEditor transaction={data.transaction} initialDate={data.transaction.date} /> : <FinanceReadError data={data} />;
}
export default function TransactionPage(props: {params: Promise<{id: string}>}) {return <Suspense fallback={<p role="status">Carregando lançamento…</p>}><Content {...props} /></Suspense>;}
