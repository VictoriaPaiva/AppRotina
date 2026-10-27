import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { FinancialTransaction } from '@/lib/finance/contracts';
import { financeSummary, formatMoney } from '@/lib/finance/summary';
import { formatPlanDate } from '@/lib/planning/dates';
export function FinanceOverview({month, transactions, children}: {month: string; transactions: FinancialTransaction[]; children?: React.ReactNode}) {
  const summary = financeSummary(transactions);
  const totals = [{label: 'Receitas', cents: summary.income}, {label: 'Despesas', cents: summary.expense}, {label: 'Saldo', cents: summary.balance}];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Finanças</h1><Button asChild><Link href={`/financas/nova?month=${month}`}>Novo lançamento</Link></Button></div>
    <form action="/financas" method="get" className="flex flex-wrap items-end gap-3">
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="finance-month">Mês calendário dos lançamentos</label><input className="rounded-md border border-input bg-background p-2" id="finance-month" type="month" name="month" min="0001-01" max="9999-12" required defaultValue={month} /></div><Button type="submit" variant="outline">Ver mês</Button>
    </form>
    <div className="grid gap-4 md:grid-cols-3">{totals.map(({label, cents}) => <article key={label} className="min-w-0 space-y-2 rounded-xl border bg-card p-5"><h2 className="text-sm text-muted-foreground">{label}</h2><p className="break-words text-2xl font-semibold">{formatMoney(cents)}</p></article>)}</div>
    {children}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Lançamentos do mês</h2>
      {!transactions.length ? <p>Nenhum lançamento neste mês.</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-muted/40">{['Tipo', 'Descrição', 'Categoria', 'Data', 'Valor', 'Ação'].map(label => <th scope="col" key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{transactions.map(transaction => <tr key={transaction.id} className="border-b last:border-0"><td className="p-3">{transaction.type === 'income' ? 'Receita' : 'Despesa'}</td><td className="max-w-sm break-words p-3">{transaction.description}</td><td className="max-w-xs break-words p-3">{transaction.category}</td><td className="whitespace-nowrap p-3">{formatPlanDate(transaction.date)}</td><td className="whitespace-nowrap p-3">{formatMoney(transaction.amountCents)}</td><td className="p-3"><Link className="underline" aria-label={`Editar ${transaction.description}`} href={`/financas/${transaction.id}`}>Editar</Link></td></tr>)}</tbody></table></div>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Despesas por categoria</h2>{!summary.categories.length ? <p>Nenhuma despesa neste mês.</p> : <ul className="max-w-2xl divide-y rounded-xl border bg-card px-4">{summary.categories.map(item => <li key={item.category} className="flex justify-between gap-4 py-3"><span className="min-w-0 break-words">{item.category}</span><span className="whitespace-nowrap font-medium">{formatMoney(item.cents)}</span></li>)}</ul>}</section>
  </div>;
}
