'use client';
import { useRef, useState } from 'react';
import {useDraftProtection} from '@/lib/forms/draft-protection';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { amountInput, parseAmount } from '@/lib/finance/validation';
import { billTotals, billMonthLabel, shiftBillMonth } from '@/lib/finance/bills';
import { formatMoney } from '@/lib/finance/summary';
import { saveBillMonth } from '@/app/financas/contas/actions';
import type { BillMonth, FixedExpense, BillResult } from '@/lib/finance/bills-contracts';
type Failure = Extract<BillResult<BillMonth>, {ok:false}>;
export function BillRow({item, onSaved}: {item: BillMonth; onSaved: (value: BillMonth) => void}) {
  const [saved,setSaved] = useState(item), [amount,setAmount] = useState(amountInput(item.amountCents));
  const [busy,setBusy] = useState(false), [failure,setFailure] = useState<Failure | null>(null), [success,setSuccess] = useState(false);
  const saving = useRef(false);
  let cents: number | null = null; try {cents = parseAmount(amount);} catch { /* Keep draft editable. */ }
  useDraftProtection(cents!==saved.amountCents,busy);
  async function save(paid: boolean) {
    if (saving.current || cents === null) return;
    if (paid !== (saved.paidAt !== null) && !window.confirm(paid ? `Confirmar pagamento de ${formatMoney(cents)}? Será criada uma despesa na data de hoje.` : 'Desfazer pagamento e remover somente a despesa vinculada a esta conta?')) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      const result = await saveBillMonth({id:saved.id,amountCents:cents,paid,expectedUpdatedAt:saved.updatedAt});
      if (!result.ok) {setFailure(result); return;}
      setSaved(result.value); setAmount(amountInput(result.value.amountCents)); onSaved(result.value); setSuccess(true);
    } catch {setFailure({ok:false,kind:'Unknown',message:'Não foi possível confirmar a operação. O valor foi mantido; consulte os dados salvos antes de tentar novamente.'});}
    finally {saving.current = false; setBusy(false);}
  }
  return <li className="space-y-3 rounded-xl border bg-card p-4">
    <form onSubmit={event=>{event.preventDefault();void save(saved.paidAt !== null);}} className="grid items-end gap-4 xl:grid-cols-[minmax(0,1fr)_180px_90px_auto]">
      <div className="min-w-0"><h3 className="break-words font-semibold">{saved.name}</h3><p className="break-words text-sm text-muted-foreground">{saved.category}</p><Link className="text-sm underline" href={`/financas/contas/${saved.fixedExpenseId}`}>Editar cadastro</Link></div>
      <div className="space-y-1"><label className="block text-sm" htmlFor={`bill-amount-${saved.id}`}>Valor deste mês (R$)</label><Input id={`bill-amount-${saved.id}`} inputMode="decimal" value={amount} disabled={busy} onChange={event=>{setAmount(event.target.value);setSuccess(false);}} /></div>
      <p className="pb-2 text-sm">Dia {saved.dueDay}</p>
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" aria-label={`Pagamento de ${saved.name}`} checked={saved.paidAt !== null} disabled={busy || cents === null} onChange={event=>void save(event.target.checked)} />{saved.paidAt ? 'Pago' : 'Não pago'}</label><Button type="submit" variant="outline" disabled={busy || cents === null || cents === saved.amountCents}>{busy ? 'Salvando…' : 'Salvar valor'}</Button></div>
    </form>
    {cents === null && <p role="alert">Informe um valor positivo com até duas casas decimais, sem separador de milhar.</p>}
    {saved.paidAt && <p className="text-sm text-muted-foreground">Pago em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(saved.paidAt))}. Alterar o valor atualiza a despesa vinculada.</p>}
    {success && <p role="status">Conta do mês salva.</p>}
    {failure && <div role="alert" className="space-y-2"><p>{failure.message}</p><p>Seu valor foi mantido neste formulário.</p>{failure.kind === 'Unauthorized' && <Link className="block underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}<Link className="block underline" href={`/financas?billMonth=${saved.referenceMonth}`} target="_blank" rel="noopener noreferrer">Consultar mês salvo em outra aba</Link></div>}
  </li>;
}
export function BillsSection({month,currentMonth,initialItems,definitions,calendarMonth}: {month: string; currentMonth: string; initialItems: BillMonth[]; definitions: FixedExpense[]; calendarMonth: string}) {
  const router = useRouter(), [items,setItems] = useState(initialItems);
  const totals = billTotals(items), previous = shiftBillMonth(month,-1), next = shiftBillMonth(month,1);
  const link = (value: string) => `/financas?month=${calendarMonth}&billMonth=${value}`;
  return <section className="space-y-5 border-t pt-6" aria-labelledby="bills-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="bills-title" className="text-xl font-semibold">Contas do mês — {billMonthLabel(month)}</h2><Button asChild><Link href="/financas/contas/nova">+ Nova conta fixa</Link></Button></div>
    <p className="text-sm text-muted-foreground">Referência financeira atual: {billMonthLabel(currentMonth)}. Virada no dia 20. {month > currentMonth ? 'Você está consultando um mês futuro.' : ''} O vencimento mostra o dia cadastrado; em meses curtos, considere o último dia disponível.</p>
    <nav aria-label="Meses das contas" className="flex flex-wrap gap-3">{previous && <Button asChild variant="outline"><Link href={link(previous)}>Mês anterior</Link></Button>}<Button asChild variant="outline"><Link href={link(currentMonth)}>Referência atual</Link></Button>{next && <Button asChild variant="outline"><Link href={link(next)}>Próximo mês</Link></Button>}</nav>
    <div className="grid gap-3 md:grid-cols-3">{[{label:'Total previsto',cents:totals.expected},{label:'Total pago',cents:totals.paid},{label:'Restante a pagar',cents:totals.remaining}].map(total=><div key={total.label} className="min-w-0 rounded-xl border bg-card p-4"><h3 className="text-sm text-muted-foreground">{total.label}</h3><p className="break-words text-xl font-semibold">{formatMoney(total.cents)}</p></div>)}</div>
    <p className="text-sm text-muted-foreground">Confirme o valor no campo antes de marcar pago. A despesa entra nos lançamentos pela data real do pagamento, não pelo mês de referência. Alterações no cadastro valem para meses ainda não abertos.</p>
    {!items.length ? <p>Nenhuma conta nesta referência. Cadastre uma conta fixa ou consulte outro mês.</p> : <ul className="space-y-3">{items.map(item=><BillRow key={item.id} item={item} onSaved={value=>{setItems(current=>current.map(row=>row.id===value.id?value:row));router.refresh();}} />)}</ul>}
    {definitions.length > 0 && <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Cadastros de contas fixas ({definitions.length})</summary><ul className="mt-3 space-y-2">{definitions.map(expense=><li key={expense.id} className="break-words"><Link className="underline" href={`/financas/contas/${expense.id}`}>{expense.name}</Link> · {expense.active ? 'Ativa' : 'Desativada'} · padrão {formatMoney(expense.defaultAmountCents)}</li>)}</ul></details>}
  </section>;
}
