import { Suspense } from 'react';
import { readFinance } from '@/lib/finance/server';
import { FinanceOverview } from '@/components/finance/FinanceOverview';
import { FinanceReadError } from '@/components/finance/FinanceReadError';
import { readBills } from '@/lib/finance/bills-server';
import { BillsSection } from '@/components/finance/BillsSection';
async function Content({searchParams}: {searchParams: Promise<{month?: string; billMonth?: string}>}) {
  const {month,billMonth} = await searchParams;
  const [data,bills] = await Promise.all([readFinance(month),readBills(billMonth)]);
  if (data.status !== 'ready') return <FinanceReadError data={data} />;
  return <FinanceOverview month={data.month} transactions={data.transactions}>{bills.status==='ready'?<BillsSection key={bills.month} month={bills.month} currentMonth={bills.currentMonth} initialItems={bills.items} definitions={bills.definitions} calendarMonth={data.month} />:<FinanceReadError data={bills} />}</FinanceOverview>;
}
export default function FinancePage(props: {searchParams: Promise<{month?: string; billMonth?: string}>}) {return <Suspense fallback={<p role="status">Carregando finanças…</p>}><Content {...props} /></Suspense>;}
