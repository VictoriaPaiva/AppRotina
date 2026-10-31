'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import {useDraftProtection} from '@/lib/forms/draft-protection';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createTransaction, updateTransaction } from '@/app/financas/actions';
import type { FinancialTransaction, FinanceResult } from '@/lib/finance/contracts';
import { amountInput, parseAmount } from '@/lib/finance/validation';
export function TransactionEditor({transaction, initialDate}: {transaction?: FinancialTransaction; initialDate: string}) {
  const router = useRouter();
  const [saved, setSaved] = useState(transaction);
  const [type, setType] = useState<'income' | 'expense'>(transaction?.type ?? 'expense');
  const [date, setDate] = useState(transaction?.date ?? initialDate);
  const [amount, setAmount] = useState(transaction ? amountInput(transaction.amountCents) : '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [category, setCategory] = useState(transaction?.category ?? '');
  const [busy, setBusy] = useState(false), [success, setSuccess] = useState(false);
  const [failure, setFailure] = useState<Extract<FinanceResult, {ok: false}> | null>(null);
  const saving = useRef(false), attemptId = useRef<string | null>(null), navigating = useRef(false);
  useLayoutEffect(() => () => {
    // Activity retains hidden routes. Retire only a confirmed creation.
    if (transaction || !navigating.current) return;
    navigating.current = false;
    attemptId.current = null;
    saving.current = false;
    setSaved(undefined);
    setType('expense');
    setDate(initialDate);
    setAmount('');
    setDescription('');
    setCategory('');
    setBusy(false);
    setFailure(null);
    setSuccess(false);
  }, [transaction, initialDate]);
  let amountCents: number | null = null;
  try {amountCents = parseAmount(amount);} catch { /* Invalid text stays editable. */ }
  const dirty = !saved || type !== saved.type || date !== saved.date || amountCents !== saved.amountCents || description !== saved.description || category !== saved.category;
  const hasDraft=saved?dirty:type!=='expense'||date!==initialDate||amount!==''||description!==''||category!=='';
  const allowNavigation=useDraftProtection(hasDraft,busy);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || navigating.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      const cents = parseAmount(amount);
      attemptId.current ??= crypto.randomUUID();
      const input = {id: saved?.id ?? attemptId.current, type, date, amountCents: cents, description, category};
      const result = saved ? await updateTransaction({...input, expectedUpdatedAt: saved.updatedAt}) : await createTransaction(input);
      if (!result.ok) {setFailure(result); return;}
      setSaved(result.transaction); setType(result.transaction.type); setDate(result.transaction.date);
      setAmount(amountInput(result.transaction.amountCents)); setDescription(result.transaction.description); setCategory(result.transaction.category); setSuccess(true);
      if (!saved) {navigating.current = true; router.replace(`/financas/${result.transaction.id}`); router.refresh();}
    } catch {
      setFailure({ok: false, kind: 'Unknown', message: 'Não foi possível confirmar o salvamento. Seu rascunho foi mantido. Consulte os dados salvos antes de tentar novamente.'});
    } finally {saving.current = false; setBusy(false);}
  }
  function reload() {if (!hasDraft || window.confirm('Recarregar descarta o rascunho não salvo. Deseja continuar?')) {allowNavigation();window.location.reload();}}
  const disabled = busy || navigating.current;
  const backMonth = (saved?.date ?? initialDate).slice(0,7);
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link className="underline" href={`/financas?month=${backMonth}`}>Voltar ao mês</Link><h1 className="text-2xl font-semibold">{saved ? 'Editar lançamento' : 'Novo lançamento'}</h1>
    <form onSubmit={submit} className="space-y-5">
      {hasDraft && <p aria-live="polite" className="text-sm text-muted-foreground">Alterações não salvas.</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="transaction-type">Tipo</Label><select id="transaction-type" className="h-10 w-full rounded-md border border-input bg-background px-3" value={type} disabled={disabled} onChange={event => {setType(event.target.value as 'income' | 'expense'); setSuccess(false);}}><option value="income">Receita</option><option value="expense">Despesa</option></select></div>
        <div className="space-y-2"><Label htmlFor="transaction-date">Data</Label><Input id="transaction-date" type="date" min="0001-01-01" max="9999-12-31" required value={date} disabled={disabled} onChange={event => {setDate(event.target.value); setSuccess(false);}} /></div>
        <div className="space-y-2"><Label htmlFor="transaction-amount">Valor (R$)</Label><Input id="transaction-amount" inputMode="decimal" placeholder="1234,56" required value={amount} disabled={disabled} aria-describedby="amount-help" onChange={event => {setAmount(event.target.value); setSuccess(false);}} /></div>
      </div>
      <p id="amount-help" className="text-sm text-muted-foreground">Valor positivo, até R$ 21.474.836,47. Use vírgula ou ponto para centavos, sem separador de milhar.</p>
      {amount && amountCents === null && <p role="alert">Informe um valor válido, por exemplo 1234,56.</p>}
      <div className="space-y-2"><Label htmlFor="transaction-description">Descrição</Label><Input id="transaction-description" required value={description} disabled={disabled} onChange={event => {setDescription(event.target.value); setSuccess(false);}} /><p className="text-xs text-muted-foreground">Até 500 caracteres.</p></div>
      <div className="space-y-2"><Label htmlFor="transaction-category">Categoria</Label><Input id="transaction-category" placeholder="Ex.: Alimentação, Moradia, Salário" required value={category} disabled={disabled} onChange={event => {setCategory(event.target.value); setSuccess(false);}} /><p className="text-xs text-muted-foreground">Até 100 caracteres. Use o mesmo nome para agrupar despesas.</p></div>
      {failure && <div role="alert" className="space-y-3"><p>{failure.message}</p><p>Seu rascunho foi mantido neste formulário.</p>{failure.kind === 'Unauthorized' && <Link className="block underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}<Button type="button" variant="outline" onClick={reload}>Recarregar dados salvos</Button>{!saved && attemptId.current && <Link className="block underline" href={`/financas/${attemptId.current}`} target="_blank" rel="noopener noreferrer">Consultar esta tentativa em outra aba</Link>}</div>}
      {success && <p role="status">Lançamento salvo.</p>}
      <Button type="submit" disabled={disabled || !date || amountCents === null || !description.trim() || !category.trim() || Array.from(description).length > 500 || Array.from(category).length > 100 || !dirty}>{busy ? 'Salvando…' : 'Salvar lançamento'}</Button>
    </form>
  </div>;
}
