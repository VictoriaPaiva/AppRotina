'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { DELETE_ACCOUNT_PHRASE, deletionMessage, type DeletionResult } from '@/lib/account-deletion/contract';

export function DeleteAccountPanel() {
  const [confirming,setConfirming]=useState(false),[confirmation,setConfirmation]=useState('');
  const [pending,setPending]=useState(false),[result,setResult]=useState<DeletionResult|null>(null);
  const busy=useRef(false);
  async function submit(event:React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy.current || confirmation!==DELETE_ACCOUNT_PHRASE) return;
    busy.current=true;setPending(true);setResult(null);
    try {
      const response=await fetch('/api/account/delete',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation}),
      });
      const value=await response.json() as DeletionResult;
      if(!response.ok || value.ok!==true) {
        setResult({ok:false,category:!value.ok && ['INVALID_CONFIRMATION','UNAUTHORIZED','UNAVAILABLE','NETWORK_ERROR','DELETE_FAILED','RESULT_UNCONFIRMED'].includes(value.category)?value.category:'RESULT_UNCONFIRMED'});
        return;
      }
      setResult(value);
      // Clear the browser client's cached session as well as the SSR cookies.
      try {await createClient().auth.signOut({scope:'local'});} catch { /* Auth is already confirmed removed. */ }
      window.location.replace('/auth/login?account=deleted');
    } catch {setResult({ok:false,category:'NETWORK_ERROR'});}
    finally {busy.current=false;setPending(false);}
  }
  return <section className="max-w-2xl space-y-4 rounded-xl border border-destructive/40 bg-surface p-6">
    <h2 className="text-xl font-semibold">Excluir minha conta</h2>
    <p>Esta ação é permanente. Seus dados, planejamentos, projetos, ideias e registros financeiros serão apagados e não poderão ser recuperados.</p>
    {!confirming ? <Button variant="destructive" onClick={()=>setConfirming(true)}>Excluir minha conta</Button> :
      <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
        <div className="space-y-2">
          <Label htmlFor="delete-confirmation">Digite exatamente {DELETE_ACCOUNT_PHRASE}</Label>
          <Input id="delete-confirmation" autoComplete="off" value={confirmation} disabled={pending || result?.ok===true} onChange={e=>setConfirmation(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="destructive" disabled={confirmation!==DELETE_ACCOUNT_PHRASE || pending || result?.ok===true}>{pending?'Excluindo…':'Excluir definitivamente'}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={()=>{setConfirming(false);setConfirmation('');setResult(null);}}>Cancelar</Button>
        </div>
      </form>}
    {result && (result.ok ? <p role="status">{result.alreadyDeleted?'Sua conta já foi excluída.':'Conta excluída com sucesso.'} Redirecionando…</p> :
      <div role="alert" className="space-y-2 text-sm text-destructive"><p>{deletionMessage(result.category)}</p>{result.category==='UNAUTHORIZED' && <Link className="underline" href="/auth/login">Entrar novamente</Link>}</div>)}
  </section>;
}
