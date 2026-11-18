'use client';
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {createStandalonePlan} from '@/app/planejamento/actions';
import {useDraftProtection} from '@/lib/forms/draft-protection';
import {importanceLabels} from '@/lib/banco-mestre/presentation';
import type {PlanResult} from '@/lib/planning/contracts';

function Editor({date,onClose}:{date:string;onClose:()=>void}) {
  const router=useRouter(),attempt=useRef<string|null>(null),lock=useRef(false);
  const [title,setTitle]=useState(''),[plannedDate,setDate]=useState(date),[time,setTime]=useState('');
  const [duration,setDuration]=useState(''),[importance,setImportance]=useState('important'),[description,setDescription]=useState('');
  const [busy,setBusy]=useState(false),[result,setResult]=useState<PlanResult|null>(null);
  const dirty=!!(title||time||duration||description||plannedDate!==date||importance!=='important');
  const allow=useDraftProtection(dirty,busy);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(lock.current)return;
    const minutes=duration.trim()?Number(duration):null;
    if(!title.trim()||!plannedDate||(minutes!==null&&(!Number.isInteger(minutes)||minutes<=0||minutes>2147483647))){setResult({ok:false,kind:'Validation',message:'Informe título, data e duração inteira positiva quando preenchida.'});return;}
    lock.current=true;setBusy(true);setResult(null);attempt.current??=crypto.randomUUID();
    try{
      const saved=await createStandalonePlan({id:attempt.current,title,plannedDate,plannedTime:time||null,durationMinutes:minutes,importance,description:description.trim()||null});
      if(!saved.ok){setResult(saved);lock.current=false;return;}
      allow();onClose();router.replace('/calendario?date='+plannedDate);router.refresh();
    }catch{lock.current=false;setResult({ok:false,kind:'Unknown',message:'Não foi possível confirmar o salvamento. Seu rascunho foi mantido; confira o calendário antes de tentar novamente.'});}
    finally{setBusy(false);}
  }
  return <form onSubmit={submit} aria-label="Novo item avulso" className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">Novo item avulso</h3><p className="text-sm text-muted-foreground">Somente nesta data, sem cadastro no Banco Mestre.</p>
    <div><Label htmlFor="standalone-title">Nome/título</Label><Input id="standalone-title" required maxLength={200} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)} /></div>
    <div><Label htmlFor="standalone-date">Data</Label><Input id="standalone-date" type="date" required value={plannedDate} disabled={busy} onChange={e=>setDate(e.target.value)} /></div>
    <div><Label htmlFor="standalone-time">Horário (opcional)</Label><Input id="standalone-time" type="time" step={60} value={time} disabled={busy} onChange={e=>setTime(e.target.value)} /></div>
    <div><Label htmlFor="standalone-duration">Duração em minutos (opcional)</Label><Input id="standalone-duration" type="number" min={1} max={2147483647} step={1} value={duration} disabled={busy} onChange={e=>setDuration(e.target.value)} /></div>
    <div><Label htmlFor="standalone-importance">Importância</Label><select id="standalone-importance" className="min-h-11 w-full rounded-md border bg-background px-3" value={importance} disabled={busy} onChange={e=>setImportance(e.target.value)}>{Object.entries(importanceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
    <div><Label htmlFor="standalone-description">Observação (opcional)</Label><textarea id="standalone-description" rows={3} maxLength={2000} className="w-full rounded-md border bg-background p-3" value={description} disabled={busy} onChange={e=>setDescription(e.target.value)} /></div>
    {result&&!result.ok&&<p role="alert">{result.message}</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy?'Salvando…':'Salvar item avulso'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Descartar o item avulso não salvo?')){allow();onClose();}}}>Cancelar</Button></div>
  </form>;
}
export function StandalonePlanForm({date}:{date:string}){
  const [open,setOpen]=useState(false);
  return open?<Editor key={date} date={date} onClose={()=>setOpen(false)} />:<Button type="button" onClick={()=>setOpen(true)} aria-label="Adicionar item avulso nesta data">+ Item avulso</Button>;
}
