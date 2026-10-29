import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { FinancialTransaction } from '@/lib/finance/contracts';
import { financeSummary, formatMoney } from '@/lib/finance/summary';
import { formatPlanDate } from '@/lib/planning/dates';
function TransactionCell({label,children,className=''}:{label:string;children:React.ReactNode;className?:string}) {
  return <td role="cell" className={`block min-w-0 break-words [overflow-wrap:anywhere] lg:table-cell lg:p-3 ${className}`}>
    <span aria-hidden="true" className="mb-1 block text-xs text-muted-foreground lg:hidden">{label}</span>{children}
  </td>;
}
function TransactionTable({transactions}:{transactions:FinancialTransaction[]}) {
  return <div className="lg:overflow-x-auto lg:rounded-xl lg:border"><table role="table" className="block w-full text-left text-sm lg:table">
    <caption className="sr-only">Lançamentos do mês selecionado</caption>
    <thead role="rowgroup" className="sr-only lg:not-sr-only lg:table-header-group"><tr role="row" className="border-b bg-muted/40">{['Tipo','Descrição','Categoria','Data','Valor','Ação'].map(label=><th role="columnheader" scope="col" key={label} className="p-3">{label}</th>)}</tr></thead>
    <tbody role="rowgroup" className="block space-y-4 lg:table-row-group lg:space-y-0">{transactions.map(transaction=><tr role="row" key={transaction.id} className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:table-row lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:p-0 lg:last:border-0">
      <TransactionCell label="Tipo" className="sm:col-span-2">{transaction.type==='income'?'Receita':'Despesa'}</TransactionCell>
      <TransactionCell label="Descrição" className="sm:col-span-2 lg:max-w-sm">{transaction.description}</TransactionCell>
      <TransactionCell label="Categoria" className="sm:col-span-2 lg:max-w-xs">{transaction.category}</TransactionCell>
      <TransactionCell label="Data" className="whitespace-nowrap">{formatPlanDate(transaction.date)}</TransactionCell>
      <TransactionCell label="Valor" className="whitespace-nowrap font-medium lg:font-normal">{formatMoney(transaction.amountCents)}</TransactionCell>
      <TransactionCell label="Ação" className="sm:col-span-2"><Link className="inline-flex min-h-11 min-w-11 items-center underline lg:min-h-0 lg:min-w-0" aria-label={`Editar ${transaction.description}`} href={`/financas/${transaction.id}`}>Editar</Link></TransactionCell>
    </tr>)}</tbody>
  </table></div>;
}
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
      {!transactions.length ? <p>Nenhum lançamento neste mês.</p> : <TransactionTable transactions={transactions}/>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Despesas por categoria</h2>{!summary.categories.length ? <p>Nenhuma despesa neste mês.</p> : <ul className="max-w-2xl divide-y rounded-xl border bg-card px-4">{summary.categories.map(item => <li key={item.category} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:gap-4"><span className="min-w-0 break-words">{item.category}</span><span className="whitespace-nowrap font-medium">{formatMoney(item.cents)}</span></li>)}</ul>}</section>
  </div>;
}
