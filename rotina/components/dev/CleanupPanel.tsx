'use client';
import { useRef,useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
interface Report {
  counts:Record<string,number>; otherCounts:Record<string,number>; otherAccounts:number;
  email?:string; token?:string; expires?:number; canExecute?:boolean;
  executed:boolean; accountPreserved:boolean; allZero:boolean; othersUnchanged:boolean; structureUnchanged:boolean; sessionVerified?:boolean;
}
const phrase='APAGAR MEUS DADOS DE TESTE';
export function CleanupPanel() {
  const [preview,setPreview]=useState<Report|null>(null),[result,setResult]=useState<Report|null>(null);
  const [confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const running=useRef(false);
  async function request(action:'preview'|'execute') {
    if (running.current) return;
    running.current=true;setBusy(true);setError('');
    try {
      const response=await fetch('/api/dev/clear-data',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',
        body:JSON.stringify(action==='preview'?{action}:{action,token:preview?.token,confirmation})});
      const report=await response.json();
      if (!response.ok || !report.ok) throw Error(report.message??'Ferramenta indisponível. Confira a habilitação local e sua sessão.');
      if (action==='preview') {setPreview(report);setResult(null);setConfirmation('');setUncertain(false);}
      else {setResult(report);setConfirmation('');setUncertain(false);}
    } catch (failure) {
      setError(failure instanceof Error?failure.message:'Não foi possível confirmar a operação.');
      if (action==='execute') {setUncertain(true);setConfirmation('');}
    } finally {running.current=false;setBusy(false);}
  }
  return <div className="mx-auto max-w-4xl space-y-5"><h1 className="text-2xl font-semibold">Limpeza temporária de dados de teste</h1>
    <p>Somente desenvolvimento local. Preserva conta, senha e estrutura. Não limpa nada ao abrir esta página. Feche as outras abas do app antes de executar.</p>
    <Button disabled={busy} onClick={()=>void request('preview')}>{busy?'Consultando…':'Gerar prévia de contagens'}</Button>
    {preview && <section className="space-y-4"><h2 className="text-xl font-semibold">Conta autenticada: {preview.email}</h2><p>Revise todas as contagens. A prévia vale por 10 minutos e é invalidada se os dados ou a estrutura mudarem.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Tabela</th><th className="p-2">Antes</th><th className="p-2">Depois</th><th className="p-2">Outras contas (antes/depois)</th></tr></thead><tbody>{Object.entries(preview.counts).map(([table,count])=><tr key={table} className="border-t"><th scope="row" className="p-2 font-normal">{table}</th><td className="p-2">{count}</td><td className="p-2">{result?.counts[table]??'—'}</td><td className="p-2">{preview.otherCounts[table]} / {result?.otherCounts[table]??'—'}</td></tr>)}</tbody></table></div>
      <p>Outras contas Auth encontradas: {preview.otherAccounts}. A verificação compara contagens e hashes das linhas, não apenas totais.</p>
      {!preview.canExecute && <p role="status">Somente prévia: execução real bloqueada pela configuração local. Aguarde autorização antes de habilitá-la.</p>}
      {!result && <div className="space-y-3"><label htmlFor="cleanup-confirmation" className="block">Para confirmar, digite exatamente: <strong>{phrase}</strong></label><Input id="cleanup-confirmation" value={confirmation} disabled={busy || !preview.canExecute || uncertain} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" />
        <Button variant="destructive" disabled={busy || !preview.canExecute || uncertain || confirmation!==phrase || !preview.expires} onClick={()=>void request('execute')}>Apagar somente meus dados de teste</Button></div>}
    </section>}
    {error && <div role="alert" className="space-y-2"><p>{error}</p>{uncertain && <p>O resultado ficou incerto. Gere uma nova prévia para consultar os dados; o envio não será repetido.</p>}<Link className="underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link></div>}
    {result && <div role="status" className="space-y-2"><p>Limpeza confirmada: {result.allZero?'todas as 16 tabelas ficaram sem linhas desta conta.':'verifique as contagens.'}</p><p>Conta Auth preservada: {result.accountPreserved?'sim':'não confirmado'}. Outras contas intactas: {result.othersUnchanged?'sim':'não confirmado'}. Estrutura preservada: {result.structureUnchanged?'sim':'não confirmado'}.</p><p>Sessão verificada novamente: {result.sessionVerified?'sim':'não foi possível verificar agora; entre novamente para conferir'}.</p><Link className="underline" href="/banco-mestre">Abrir Banco Mestre do zero</Link></div>}
    <Link className="block underline" href="/hoje">Voltar ao app</Link>
  </div>;
}
