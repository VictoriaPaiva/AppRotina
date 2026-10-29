import { Suspense } from 'react';
import { readFinance } from '@/lib/finance/server';
import { FinanceOverview } from '@/components/finance/FinanceOverview';
import { FinanceReadError } from '@/components/finance/FinanceReadError';
import { readBills } from '@/lib/finance/bills-server';
import { BillsSection } from '@/components/finance/BillsSection';
async function BillsContent({result,calendarMonth}:{result:ReturnType<typeof readBills>;calendarMonth:string}) {
  const bills=await result;
  return bills.status==='ready'?<BillsSection key={bills.month} month={bills.month} currentMonth={bills.currentMonth} initialItems={bills.items} definitions={bills.definitions} calendarMonth={calendarMonth} />:<FinanceReadError data={bills} section />;
}
async function Content({searchParams}: {searchParams: Promise<{month?: string; billMonth?: string}>}) {
  const {month,billMonth} = await searchParams;
  const finance=readFinance(month), bills=readBills(billMonth);
  // Observe background rejection if the primary render aborts; the section still awaits the original promise.
  void bills.catch(()=>{});
  const data=await finance;
  if (data.status !== 'ready') return <FinanceReadError data={data} />;
  return <FinanceOverview month={data.month} transactions={data.transactions}><Suspense fallback={<p role="status">Carregando contas do mês…</p>}><BillsContent result={bills} calendarMonth={data.month} /></Suspense></FinanceOverview>;
}
export default function FinancePage(props: {searchParams: Promise<{month?: string; billMonth?: string}>}) {return <Suspense fallback={<p role="status">Carregando finanças…</p>}><Content {...props} /></Suspense>;}
