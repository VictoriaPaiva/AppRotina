'use client';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createDailyPlan, setDailyPlanCompleted, rescheduleDailyPlan, configureDailyPlanSubitems, completeDailyPlanSubitem,setDailyPlanTime,setDailyPlanQuantity,completeDailyPlanChecklist,reorderDailyPlan } from '@/app/planejamento/actions';
import { planSnapshot, type PlanReadResult, type PlanResult, type PlanViewItem } from '@/lib/planning/contracts';
import { formatPlanDate } from '@/lib/planning/dates';
import { initialSelection, selectionPayload, type PlanSubitem } from '@/lib/activities/subitems';
import { SubitemSelection } from './SubitemSelection';
import { PlanSubitems } from './PlanSubitems';
import {PlanQuantity} from './PlanQuantity';
import {PlanChecklist} from './PlanChecklist';
import {PlanTimeEditor} from './PlanTimeEditor';
import {orderPlanItems} from '@/lib/planning/order';
import { useDraftProtection, confirmPageLeave } from '@/lib/forms/draft-protection';

export function PlanningBoard({data, todayMode = false, initialActivityId = ''}: {data: PlanReadResult; todayMode?: boolean; initialActivityId?: string}) {
  const router = useRouter();
  const [activityId, setActivityId] = useState(initialActivityId);
  const [plannedDate, setPlannedDate] = useState(data.status === 'ready' ? data.date : '');
  const [plannedTime,setPlannedTime]=useState('');
  const selectedActivity=data.status==='ready'?data.activities.find(a=>a.id===activityId):undefined;
  const [subitems,setSubitems]=useState<PlanSubitem[]>(()=>selectedActivity?.subitems?initialSelection(selectedActivity.subitems):[]);
  const [sourceRevision,setSourceRevision]=useState(selectedActivity?.revision);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const busy = useRef(false);
  const attempt = useRef<{id: string; activityId: string; plannedDate: string} | null>(null);
  const completedCreation=useRef(false),draftOwners=useRef(new Set<string>());
  useLayoutEffect(()=>()=>{
    if(!completedCreation.current)return;
    completedCreation.current=false;busy.current=false;attempt.current=null;
    const initial=data.status==='ready'?data.activities.find(a=>a.id===initialActivityId):undefined;
    setActivityId(initialActivityId);setPlannedDate(data.status==='ready'?data.date:'');setSourceRevision(initial?.revision);
    setPlannedTime('');
    setSubitems(initial?.subitems?initialSelection(initial.subitems):[]);setPending(false);setConfirmed(false);setResult(null);
  },[data,initialActivityId]);
  const disabled = pending || confirmed;
  const creationDirty=!confirmed&&(plannedTime!==''||activityId!==initialActivityId||plannedDate!==(data.status==='ready'?data.date:'')||JSON.stringify(subitems)!==JSON.stringify(selectedActivity?.subitems?initialSelection(selectedActivity.subitems):[]));
  useDraftProtection(creationDirty,pending);
  async function run(save: () => Promise<PlanResult>, destination?: string,scope?:string) {
    if (busy.current) return;
    if(((creationDirty&&scope!=='create')||[...draftOwners.current].some(id=>id!==scope))&&!confirmPageLeave())return;
    busy.current = true; setPending(true); setResult(null);
    try {
      const saved = await save(); setResult(saved);
      if (saved.ok) {
        if(scope==='create')completedCreation.current=true;
        setConfirmed(true);
        if (destination) router.push(destination);
        router.refresh(); // A new SSR snapshot remounts the board, without optimistic truth.
      } else busy.current = false;
    } catch {
      setResult({ok: false, kind: 'Unknown', message: 'Não foi possível confirmar a operação. Verifique os dados salvos antes de tentar novamente.'});
      busy.current = false;
    } finally { setPending(false); }
  }
  function reload() {
    if (window.confirm('Recarregar os dados salvos? Alterações ainda não enviadas serão descartadas.')) window.location.reload();
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!attempt.current || attempt.current.activityId !== activityId || attempt.current.plannedDate !== plannedDate) {
      attempt.current = {id: crypto.randomUUID(), activityId, plannedDate};
    }
    const input = {...attempt.current,plannedTime:plannedTime||null,...(selectedActivity?.subitems?{sourceRevision,configuration:selectionPayload(subitems)}:{})};
    void run(() => createDailyPlan(input), '/planejamento?date=' + encodeURIComponent(input.plannedDate),'create');
  }
  function renderItem(item: PlanViewItem) {
    const day=data.status==='ready'?orderPlanItems(data.items):[];
    const visible=day.filter(n=>!n.plannedTime&&(!todayMode||(n.completedAt===null)===(item.completedAt===null))),position=visible.findIndex(n=>n.id===item.id);
    function move(direction:-1|1){const neighbor=visible[position+direction];if(!neighbor)return;const from=day.findIndex(n=>n.id===item.id),to=day.findIndex(n=>n.id===neighbor.id);[day[from],day[to]]=[day[to],day[from]];void run(()=>reorderDailyPlan({plannedDate:item.plannedDate,items:day.map(n=>({id:n.id,expected:planSnapshot(n)}))}));}
    return <li key={item.id}><Card><CardContent className="space-y-3 p-4">
      {item.plannedTime&&<time className="block text-lg font-semibold tabular-nums" dateTime={item.plannedTime}>{item.plannedTime}</time>}
      <div className="min-w-0 break-words"><Link className="font-medium underline" href={'/banco-mestre/' + item.activityId}>{item.name}</Link>
        <p className="text-sm text-muted-foreground">Planejado para {formatPlanDate(item.plannedDate)}{!item.active && ' · Atividade inativa no Banco Mestre'}</p></div>
      {item.subitems&&<PlanSubitems key={item.id+item.updatedAt} items={item.subitems} total={item.plannedDurationMinutes??0} disabled={disabled} onDraftChange={dirty=>{if(dirty)draftOwners.current.add(item.id);else draftOwners.current.delete(item.id);}} onConfigure={configuration=>void run(()=>configureDailyPlanSubitems({id:item.id,expected:planSnapshot(item),configuration}),undefined,item.id)} onComplete={(subitemId,completed)=>void run(()=>completeDailyPlanSubitem({id:item.id,expected:planSnapshot(item),subitemId,completed}))} />}
      {item.quantity?.length?<PlanQuantity key={'quantity'+item.id+item.updatedAt} goals={item.quantity} totals={item.quantityTotals} disabled={disabled} onDirty={(goalId,dirty)=>{const token=item.id+':quantity:'+goalId;if(dirty)draftOwners.current.add(token);else draftOwners.current.delete(token);}} onUnit={(goalId,unitIndex,completed)=>void run(()=>setDailyPlanQuantity({id:item.id,expected:planSnapshot(item),goalId,unitIndex,completed}),undefined,item.id+':quantity:'+goalId)} onAmount={(goalId,amount)=>void run(()=>setDailyPlanQuantity({id:item.id,expected:planSnapshot(item),goalId,amount}),undefined,item.id+':quantity:'+goalId)} />:item.goalTrackingModeSnapshot==='quantity'&&<p className="text-sm text-muted-foreground">Meta por quantidade · conclusão por ocorrência.</p>}
      {(item.goalTrackingModeSnapshot!=='quantity'&&(item.checklist||item.activityTypeSnapshot==='checklistGoal'))&&<PlanChecklist items={item.checklist??[]} disabled={disabled} onComplete={(checklistItemId,completed)=>void run(()=>completeDailyPlanChecklist({id:item.id,expected:planSnapshot(item),checklistItemId,completed}))} />}
      {item.goalTrackingModeSnapshot!=='quantity'&&item.activityTypeSnapshot==='checklistGoal'&&!item.checklist?.length&&<p className="text-sm"><Link className="underline" href={'/banco-mestre/'+item.activityId+'/editar'}>Revisar checklist no Banco Mestre</Link>. Os itens definidos serão usados em novos planejamentos; esta ocorrência antiga não será modificada.</p>}
      <PlanTimeEditor key={'time'+item.id+item.updatedAt} id={item.id} value={item.plannedTime??null} disabled={disabled} onDirty={dirty=>{if(dirty)draftOwners.current.add(item.id);else draftOwners.current.delete(item.id);}} onSave={plannedTime=>void run(()=>setDailyPlanTime({id:item.id,expected:planSnapshot(item),plannedTime}),undefined,item.id)} />
      {!item.plannedTime&&item.plannedDate===(data.status==='ready'?data.date:'')&&<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={disabled||position<=0} aria-label={'Mover '+item.name+' para cima'} onClick={()=>move(-1)}>Mover para cima</Button><Button type="button" variant="outline" className="min-h-11" disabled={disabled||position<0||position===visible.length-1} aria-label={'Mover '+item.name+' para baixo'} onClick={()=>move(1)}>Mover para baixo</Button></div>}
      <Button type="button" variant="outline" disabled={disabled} onClick={() => void run(() => setDailyPlanCompleted({id: item.id, expected: planSnapshot(item), completed: item.completedAt === null}))}>
        {item.completedAt === null ? item.goalTrackingModeSnapshot!=='quantity'&&item.activityTypeSnapshot==='checklistGoal'?item.checklist?.length?'Concluir checklist':'Concluir ocorrência legada':'Concluir' : 'Desfazer conclusão'}
      </Button>
      {item.completedAt === null && <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        const date = new FormData(event.currentTarget).get('plannedDate');
        void run(() => rescheduleDailyPlan({id: item.id, expected: planSnapshot(item), plannedDate: date}));
      }}>
        <div className="space-y-1"><Label htmlFor={'reschedule-' + item.id}>Nova data</Label><Input id={'reschedule-' + item.id} name="plannedDate" type="date" required defaultValue={item.plannedDate} disabled={disabled} /></div>
        <Button type="submit" variant="outline" disabled={disabled}>Reagendar</Button>
      </form>}
    </CardContent></Card></li>;
  }
  if (data.status === 'error') return <Card><CardContent className="space-y-3 p-5"><h1 className="text-2xl font-semibold">{todayMode?'Hoje':'Planejamento'}</h1><p role="alert">{data.message}</p>
    {data.kind === 'Unauthorized' ? <Button asChild><Link href="/auth/login">Entrar novamente</Link></Button> : <Button onClick={reload}>Tentar novamente</Button>}
    <Button asChild variant="outline"><Link href="/planejamento">Abrir planejamento de hoje</Link></Button>
  </CardContent></Card>;
  const active = data.activities.filter(activity => activity.active);
  const ordered=orderPlanItems(data.items);
  const visible=ordered.filter(item=>!todayMode||item.completedAt===null),timed=visible.filter(item=>item.plannedTime),untimed=visible.filter(item=>!item.plannedTime);
  const done=orderPlanItems([...new Map([...ordered.filter(item=>item.completedAt!==null),...(todayMode?data.completedToday??[]:[])].map(item=>[item.id,item])).values()]);
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">{todayMode?'Hoje':'Planejamento'}</h1>
    <p className="text-sm text-muted-foreground">{formatPlanDate(data.date)} · Fuso: America/Sao_Paulo. Planejamento manual; metas e recorrências não são executadas automaticamente.</p>
    <nav className="flex flex-wrap gap-2" aria-label="Datas do planejamento">
      <Button asChild variant="outline"><Link href="/hoje">Hoje</Link></Button>
      <Button asChild variant="outline"><Link href={'/planejamento?date=' + data.tomorrow}>Amanhã</Link></Button>
      <Button asChild variant="outline"><Link href="/banco-mestre">Banco Mestre</Link></Button>
      {todayMode && <Button asChild><Link href="/planejamento">Planejar atividades</Link></Button>}
    </nav>
    {!todayMode && <>
      <form action="/planejamento" method="get" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor="view-date">Consultar data</Label><Input id="view-date" name="date" type="date" defaultValue={data.date} required /></div>
        <Button type="submit" variant="outline">Ver data</Button>
      </form>
      <Card><CardContent className="space-y-3 p-5"><h2 className="font-semibold">Adicionar atividade</h2>
        {active.length === 0 ? <p>Nenhuma atividade ativa disponível. <Link className="underline" href="/banco-mestre">Cadastre ou ative uma atividade no Banco Mestre.</Link></p> :
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="plan-activity">Atividade</Label><select id="plan-activity" className="h-10 w-full rounded-md border bg-background px-3" required value={activityId} disabled={disabled} onChange={event => {setActivityId(event.target.value);const a=data.activities.find(a=>a.id===event.target.value);setSourceRevision(a?.revision);setSubitems(a?.subitems?initialSelection(a.subitems):[]);}}>
              <option value="">Escolha uma atividade</option>{active.map(activity => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
            </select></div>
            {selectedActivity?.subitems&&(subitems.length?<SubitemSelection value={subitems} onChange={setSubitems} disabled={disabled} />:<p role="alert">Nenhum subitem ativo disponível. Reative uma folha no Banco Mestre antes de planejar.</p>)}
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => setPlannedDate(data.today)}>Hoje</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => setPlannedDate(data.tomorrow)}>Amanhã</Button></div>
            <div className="space-y-1"><Label htmlFor="plan-date">Data planejada</Label><Input id="plan-date" type="date" required value={plannedDate} disabled={disabled} onChange={event => setPlannedDate(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="plan-time">Horário aproximado (opcional)</Label><Input id="plan-time" type="time" step={60} value={plannedTime} disabled={disabled} onChange={event=>setPlannedTime(event.target.value)} /><p className="text-sm text-muted-foreground">Estimativa para esta ocorrência, sem reserva de horário.</p></div>
            <Button type="submit" disabled={disabled||Boolean(selectedActivity?.subitems&&!subitems.length)}>{pending ? 'Salvando…' : 'Confirmar planejamento'}</Button>
          </form>}
      </CardContent></Card>
    </>}
    {pending && <p role="status" aria-live="polite">Salvando…</p>}
    {result && <div className="space-y-2" role={result.ok ? 'status' : 'alert'}><p>{result.ok ? 'Operação confirmada. Atualizando os dados salvos…' : result.message}</p>
      {!result.ok && result.kind === 'Unauthorized' && <Button asChild><Link href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente</Link></Button>}
      <Button type="button" variant="outline" onClick={reload}>Recarregar dados salvos</Button>
    </div>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">{todayMode ? 'Para hoje' : 'Planejados para a data'}</h2>
      {!!timed.length&&<ul className="space-y-3">{timed.map(renderItem)}</ul>}
      {!!untimed.length&&<><h3 className="font-semibold">Sem horário</h3><ul className="space-y-3">{untimed.map(renderItem)}</ul></>}
      {!visible.length&&<p className="text-muted-foreground">Nenhum item a concluir nesta data.</p>}
      <p className="text-sm text-muted-foreground">Concluídos: {done.length} de {todayMode?visible.length+done.length:ordered.length}. Ordem cronológica preservada em cada seção.</p>
    </section>
    {todayMode && <section className="space-y-3"><h2 className="text-lg font-semibold">Pendências</h2>
      {data.pending.length ? <ul className="space-y-3">{data.pending.map(renderItem)}</ul> : <p className="text-muted-foreground">Nenhuma pendência.</p>}
    </section>}
    {todayMode&&<section className="space-y-3"><h2 className="text-lg font-semibold">Concluídas</h2>{done.length?<ul className="space-y-3">{done.map(renderItem)}</ul>:<p className="text-muted-foreground">Nenhuma ocorrência concluída hoje.</p>}</section>}
  </div>;
}
