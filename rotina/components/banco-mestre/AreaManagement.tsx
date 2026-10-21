'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMasterArea, renameMasterArea, setMasterAreaActive } from '@/app/banco-mestre/area-actions';
import type { AreaMutationResult, ManagedArea } from '@/lib/banco-mestre/data/area-contracts';
import type { ManagedAreasReadResult } from '@/lib/banco-mestre/data/area-read-model';
import { toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { areaReturnTo } from '@/lib/banco-mestre/area-navigation';

type Failure=Extract<AreaMutationResult,{ok:false}>;
function safeFailure(error:unknown):Failure {
  const mapped=toPersistenceError(error);
  return {ok:false,kind:mapped.kind,message:mapped.message};
}
function MutationError({error}:{error:Failure|null}) {
  if(!error) return null;
  return <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
    <p>{error.kind==='Conflict'?'Esta área foi alterada em outra sessão ou a tentativa de criação já foi registrada.':error.message}</p>
    <p>O que você digitou foi mantido neste formulário.</p>
    {error.kind==='Unauthorized' && <Button asChild variant="outline"><Link href="/auth/login">Entrar novamente</Link></Button>}
    {error.kind==='Conflict' && <><p>Confira os dados mais recentes antes de continuar. Não houve tentativa de sobrescrita automática.</p><Button type="button" variant="outline" onClick={()=>{if(window.confirm('Recarregar a página descartará os rascunhos desta tela. Continuar?'))window.location.reload();}}>Recarregar áreas</Button></>}
    {error.kind==='Unknown' && <p>Confira a lista antes de tentar novamente: a resposta pode ter sido interrompida após o salvamento.</p>}
  </div>;
}

export function AreaCreateForm({returnTo}:{returnTo?:string}={}) {
  const router=useRouter();
  const [name,setName]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<Failure|null>(null);
  const [saved,setSaved]=useState(false);
  const id=useRef<string|null>(null);
  const inFlight=useRef(false);
  const completed=useRef(false);
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(inFlight.current || completed.current || error?.kind==='Conflict') return;
    if(!name.trim()) {setError({ok:false,kind:'Validation',message:'Informe o nome da área.'});return;}
    inFlight.current=true;setSaving(true);setError(null);
    try {
      id.current??=crypto.randomUUID();
      const result=await createMasterArea({id:id.current,name});
      if(!result.ok) {setError(result);return;}
      completed.current=true;setSaved(true);router.refresh();
    } catch(error) {if(!completed.current)setError(safeFailure(error));}
    finally {inFlight.current=false;setSaving(false);}
  }
  function another() {id.current=null;completed.current=false;setSaved(false);setName('');setError(null);}
  return <Card><CardContent className="space-y-4 p-5">
    <h2 className="text-lg font-semibold">Nova área</h2>
    {saved ? <div className="space-y-3"><p role="status">Área criada. A lista será atualizada com os dados salvos.</p><Button type="button" onClick={another}>Criar outra área</Button><Button asChild variant="outline"><Link href="/banco-mestre/nova">{areaReturnTo(returnTo)?'Voltar para criar item':'Criar item'}</Link></Button></div> :
      <form onSubmit={submit} noValidate aria-busy={saving} className="space-y-3">
        <fieldset disabled={saving} className="space-y-3">
          <Label htmlFor="area-new-name">Nome da nova área</Label>
          <Input id="area-new-name" name="name" value={name} onChange={event=>setName(event.target.value)} aria-invalid={error?.kind==='Validation'} aria-describedby={error?'area-create-error':undefined} />
          <Button type="submit" disabled={saving || error?.kind==='Conflict'}>{saving?'Salvando…':'Criar área'}</Button>
        </fieldset>
        {saving && <p role="status" aria-live="polite">Salvando área…</p>}
        <div id="area-create-error"><MutationError error={error} /></div>
      </form>}
  </CardContent></Card>;
}

export function AreaRow({area}:{area:ManagedArea}) {
  const router=useRouter();const inputId=useId();
  const [name,setName]=useState(area.name);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState<Failure|null>(null);
  const inFlight=useRef(false);const completed=useRef(false);
  const expected={name:area.name,active:area.active,sortPosition:area.sortPosition,updatedAt:area.updatedAt};
  const changed=name!==area.name;
  const blocked=saving || saved || error?.kind==='Conflict';
  async function save(kind:'name'|'active') {
    if(inFlight.current || completed.current || error?.kind==='Conflict') return;
    if(kind==='name' && !name.trim()) {setError({ok:false,kind:'Validation',message:'Informe o nome da área.'});return;}
    if(kind==='active') {
      if(changed) return;
      if(area.active && !window.confirm('Desativar esta área? Os itens existentes continuarão vinculados e visíveis. A área não poderá ser escolhida em novos itens ou novas associações.')) return;
    }
    inFlight.current=true;setSaving(true);setError(null);
    try {
      const result=kind==='name'
        ? await renameMasterArea({id:area.id,name,expected})
        : await setMasterAreaActive({id:area.id,active:!area.active,expected});
      if(!result.ok) {setError(result);return;}
      completed.current=true;setSaved(true);router.refresh();
    } catch(error) {if(!completed.current)setError(safeFailure(error));}
    finally {inFlight.current=false;setSaving(false);}
  }
  return <li><Card><CardContent className="space-y-3 p-5">
    <div className="flex flex-wrap items-center gap-3"><h3 className="break-words font-semibold">{area.name}</h3><Badge variant={area.active?'secondary':'outline'}>{area.active?'Ativa':'Inativa'}</Badge></div>
    {!area.active && <p className="text-sm text-muted-foreground">Os itens existentes continuam vinculados e visíveis. Reative para tornar esta área disponível novamente para novos itens e associações.</p>}
    <form onSubmit={event=>{event.preventDefault();void save('name');}} noValidate aria-busy={saving} className="space-y-3">
      <fieldset disabled={saving || saved} className="space-y-3">
        <Label htmlFor={inputId}>Nome da área</Label>
        <Input id={inputId} name="name" value={name} onChange={event=>setName(event.target.value)} aria-invalid={error?.kind==='Validation'} aria-describedby={error?inputId+'-error':undefined} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={blocked || !changed}>Salvar nome</Button>
          <Button type="button" variant="outline" disabled={blocked || changed} onClick={()=>void save('active')}>{area.active?'Desativar':'Reativar'}</Button>
          {changed && <Button type="button" variant="ghost" disabled={saving || saved} onClick={()=>setName(area.name)}>Restaurar nome</Button>}
        </div>
        {changed && <p className="text-sm text-muted-foreground">Salve ou restaure o nome antes de alterar o estado da área.</p>}
      </fieldset>
      {saving && <p role="status" aria-live="polite">Salvando alteração…</p>}
      {saved && <p role="status">Alteração salva. Atualizando a lista…</p>}
      <div id={inputId+'-error'}><MutationError error={error} /></div>
    </form>
  </CardContent></Card></li>;
}

export function AreaManagement({result,returnTo}:{result:ManagedAreasReadResult;returnTo?:string}) {
  const router=useRouter();
  const destination=areaReturnTo(returnTo);
  return <div className="space-y-6">
    <header className="space-y-3"><h1 className="text-2xl font-semibold">Áreas do Banco Mestre</h1><p className="text-muted-foreground">Organize seus itens por área. Desativar uma área preserva os itens existentes.</p><Button asChild variant="outline"><Link href="/banco-mestre">Voltar ao Banco Mestre</Link></Button>{destination && result.status==='ready' && result.areas.some(area=>area.active) && <Button asChild><Link href={destination}>Voltar para criar item</Link></Button>}</header>
    {result.status==='error' ? <Card><CardContent className="space-y-3 p-5"><h2 className="font-semibold">Não foi possível carregar as áreas</h2><p role="alert">{result.message}</p>{result.kind==='Unauthorized'?<Button asChild><Link href="/auth/login">Entrar novamente</Link></Button>:<Button type="button" onClick={()=>router.refresh()}>Tentar novamente</Button>}</CardContent></Card> : <>
      {result.areas.length===0 && <Card><CardContent className="space-y-3 p-5"><h2 className="font-semibold">Você ainda não tem áreas</h2><p>Crie sua primeira área para cadastrar os itens da sua rotina.</p><Button asChild><a href="#area-new-name">Criar primeira área</a></Button></CardContent></Card>}
      {result.areas.length>0 && !result.areas.some(area=>area.active) && <p role="status">Todas as áreas estão inativas. Crie uma área ou reative uma existente para cadastrar novos itens.</p>}
      <AreaCreateForm returnTo={destination} />
      {result.areas.length>0 && <section aria-label="Suas áreas"><h2 className="mb-3 text-lg font-semibold">Suas áreas</h2><ul className="space-y-3">{result.areas.map(area=><AreaRow key={area.id+':'+area.updatedAt} area={area} />)}</ul></section>}
    </>}
  </div>;
}
