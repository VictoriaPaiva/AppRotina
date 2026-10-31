'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import {useDraftProtection} from '@/lib/forms/draft-protection';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { amountInput, parseAmount } from '@/lib/finance/validation';
import { saveFixedExpense } from '@/app/financas/contas/actions';
import type { FixedExpense, BillResult } from '@/lib/finance/bills-contracts';
export function FixedExpenseEditor({expense}: {expense?: FixedExpense}) {
  const router = useRouter(), [saved,setSaved] = useState(expense);
  const [name,setName] = useState(expense?.name ?? ''), [amount,setAmount] = useState(expense ? amountInput(expense.defaultAmountCents) : '');
  const [dueDay,setDueDay] = useState(String(expense?.dueDay ?? 1)), [category,setCategory] = useState(expense?.category ?? 'Contas fixas'), [active,setActive] = useState(expense?.active ?? true);
  const [busy,setBusy] = useState(false), [success,setSuccess] = useState(false), [failure,setFailure] = useState<Extract<BillResult<FixedExpense>,{ok:false}> | null>(null);
  const saving = useRef(false), attemptId = useRef<string | null>(null), navigating = useRef(false);
  useLayoutEffect(() => () => {
    // Activity retains hidden routes. Preserve edits and unfinished drafts.
    if (expense || !navigating.current) return;
    navigating.current = false;
    attemptId.current = null;
    saving.current = false;
    setSaved(undefined);
    setName('');
    setAmount('');
    setDueDay('1');
    setCategory('Contas fixas');
    setActive(true);
    setBusy(false);
    setFailure(null);
    setSuccess(false);
  }, [expense]);
  let cents: number | null = null; try {cents = parseAmount(amount);} catch { /* Keep invalid draft. */ }
  const valid = !!name.trim() && Array.from(name).length<=200 && cents !== null && /^[0-9]+$/.test(dueDay) && Number(dueDay)>=1 && Number(dueDay)<=31 && !!category.trim() && Array.from(category).length<=100;
  const dirty=saved?name!==saved.name||cents!==saved.defaultAmountCents||dueDay!==String(saved.dueDay)||category!==saved.category||active!==saved.active:name!==''||amount!==''||dueDay!=='1'||category!=='Contas fixas';
  useDraftProtection(dirty,busy);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if (saving.current || navigating.current || !valid || cents === null || (!!saved&&!dirty)) return;
    saving.current=true;setBusy(true);setSuccess(false);setFailure(null);
    try {
      attemptId.current ??= crypto.randomUUID();
      const result=await saveFixedExpense({id:saved?.id ?? attemptId.current,name,defaultAmountCents:cents,dueDay:Number(dueDay),category,active,expectedUpdatedAt:saved?.updatedAt ?? null});
      if (!result.ok) {setFailure(result);return;}
      setSaved(result.value);setName(result.value.name);setAmount(amountInput(result.value.defaultAmountCents));setDueDay(String(result.value.dueDay));setCategory(result.value.category);setActive(result.value.active);setSuccess(true);
      if (!saved) {navigating.current=true;router.replace('/financas');router.refresh();}
    } catch {setFailure({ok:false,kind:'Unknown',message:'Não foi possível confirmar o salvamento. O rascunho foi mantido. Consulte o cadastro salvo antes de tentar novamente.'});}
    finally {saving.current=false;setBusy(false);}
  }
  return <div className="mx-auto max-w-3xl space-y-5"><Link className="underline" href="/financas">Voltar às finanças</Link><h1 className="text-2xl font-semibold">{saved?'Editar conta fixa':'Nova conta fixa'}</h1>
    <p className="text-sm text-muted-foreground">O valor padrão inicia os meses ainda não abertos. Alterar ou desativar o cadastro preserva os meses já criados. Contas novas aparecem na referência financeira atual.</p>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy || navigating.current} className="space-y-4">
      {dirty && <p aria-live="polite" className="text-sm text-muted-foreground">Alterações não salvas.</p>}
      <div className="space-y-2"><Label htmlFor="fixed-name">Nome</Label><Input id="fixed-name" required value={name} onChange={event=>{setName(event.target.value);setSuccess(false);}} /><p className="text-xs text-muted-foreground">Até 200 caracteres.</p></div>
      <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="fixed-amount">Valor padrão (R$)</Label><Input id="fixed-amount" required inputMode="decimal" placeholder="1500,00" value={amount} onChange={event=>{setAmount(event.target.value);setSuccess(false);}} /></div><div className="space-y-2"><Label htmlFor="fixed-due">Dia do vencimento</Label><Input id="fixed-due" type="number" min={1} max={31} required value={dueDay} onChange={event=>{setDueDay(event.target.value);setSuccess(false);}} /></div></div>
      <p className="text-xs text-muted-foreground">Valor positivo até R$ 21.474.836,47, sem separador de milhar. Em meses sem o dia cadastrado, o vencimento é considerado no último dia.</p>
      <div className="space-y-2"><Label htmlFor="fixed-category">Categoria</Label><Input id="fixed-category" required value={category} onChange={event=>{setCategory(event.target.value);setSuccess(false);}} /><p className="text-xs text-muted-foreground">Até 100 caracteres.</p></div>
      {saved && <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={event=>{setActive(event.target.checked);setSuccess(false);}} />Conta ativa para gerar novos meses</label>}
      {amount && cents===null && <p role="alert">Informe um valor positivo, por exemplo 1500,00, sem separador de milhar.</p>}
      {(!/^[0-9]+$/.test(dueDay)||Number(dueDay)<1||Number(dueDay)>31) && <p role="alert">Informe um dia de vencimento entre 1 e 31.</p>}
      <Button type="submit" disabled={!valid || (!!saved&&!dirty)}>{busy?'Salvando…':'Salvar conta fixa'}</Button>
    </fieldset></form>
    {success && <p role="status">Cadastro salvo. Os estados mensais existentes foram preservados.</p>}
    {failure && <div role="alert" className="space-y-2"><p>{failure.message}</p><p>Seu rascunho foi mantido.</p>{failure.kind==='Unauthorized' && <Link className="block underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}<Link className="block underline" href={saved || attemptId.current ? `/financas/contas/${saved?.id ?? attemptId.current}` : '/financas'} target="_blank" rel="noopener noreferrer">Consultar cadastro salvo em outra aba</Link></div>}
  </div>;
}
