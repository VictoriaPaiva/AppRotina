'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createDailyPlan, setDailyPlanCompleted, rescheduleDailyPlan } from '@/app/planejamento/actions';
import { planSnapshot, type PlanReadResult, type PlanResult, type PlanViewItem } from '@/lib/planning/contracts';
import { formatPlanDate } from '@/lib/planning/dates';

export function PlanningBoard({data, todayMode = false, initialActivityId = ''}: {data: PlanReadResult; todayMode?: boolean; initialActivityId?: string}) {
  const router = useRouter();
  const [activityId, setActivityId] = useState(initialActivityId);
  const [plannedDate, setPlannedDate] = useState(data.status === 'ready' ? data.date : '');
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const busy = useRef(false);
  const attempt = useRef<{id: string; activityId: string; plannedDate: string} | null>(null);
  const disabled = pending || confirmed;
  async function run(save: () => Promise<PlanResult>, destination?: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setResult(null);
    try {
      const saved = await save(); setResult(saved);
      if (saved.ok) {
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
    const input = {...attempt.current};
    void run(() => createDailyPlan(input), '/planejamento?date=' + encodeURIComponent(input.plannedDate));
  }
  function renderItem(item: PlanViewItem) {
    return <li key={item.id}><Card><CardContent className="space-y-3 p-4">
      <div><Link className="font-medium underline" href={'/banco-mestre/' + item.activityId}>{item.name}</Link>
        <p className="text-sm text-muted-foreground">Planejado para {formatPlanDate(item.plannedDate)}{!item.active && ' · Atividade inativa no Banco Mestre'}</p></div>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => void run(() => setDailyPlanCompleted({id: item.id, expected: planSnapshot(item), completed: item.completedAt === null}))}>
        {item.completedAt === null ? 'Concluir' : 'Desfazer conclusão'}
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
  if (data.status === 'error') return <Card><CardContent className="space-y-3 p-5"><p role="alert">{data.message}</p>
    {data.kind === 'Unauthorized' ? <Button asChild><Link href="/auth/login">Entrar novamente</Link></Button> : <Button onClick={reload}>Tentar novamente</Button>}
    <Button asChild variant="outline"><Link href="/planejamento">Abrir planejamento de hoje</Link></Button>
  </CardContent></Card>;
  const active = data.activities.filter(activity => activity.active);
  const open = data.items.filter(item => item.completedAt === null), done = data.items.filter(item => item.completedAt !== null);
  return <div className="space-y-6">
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
            <div className="space-y-1"><Label htmlFor="plan-activity">Atividade</Label><select id="plan-activity" className="h-10 w-full rounded-md border bg-background px-3" required value={activityId} disabled={disabled} onChange={event => setActivityId(event.target.value)}>
              <option value="">Escolha uma atividade</option>{active.map(activity => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
            </select></div>
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => setPlannedDate(data.today)}>Hoje</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => setPlannedDate(data.tomorrow)}>Amanhã</Button></div>
            <div className="space-y-1"><Label htmlFor="plan-date">Data planejada</Label><Input id="plan-date" type="date" required value={plannedDate} disabled={disabled} onChange={event => setPlannedDate(event.target.value)} /></div>
            <Button type="submit" disabled={disabled}>{pending ? 'Salvando…' : 'Confirmar planejamento'}</Button>
          </form>}
      </CardContent></Card>
    </>}
    {pending && <p role="status" aria-live="polite">Salvando…</p>}
    {result && <div className="space-y-2" role={result.ok ? 'status' : 'alert'}><p>{result.ok ? 'Operação confirmada. Atualizando os dados salvos…' : result.message}</p>
      {!result.ok && result.kind === 'Unauthorized' && <Button asChild><Link href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente</Link></Button>}
      <Button type="button" variant="outline" onClick={reload}>Recarregar dados salvos</Button>
    </div>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">{todayMode ? 'Para hoje' : 'Planejados para a data'}</h2>
      {open.length ? <ul className="space-y-3">{open.map(renderItem)}</ul> : <p className="text-muted-foreground">Nenhum item a concluir nesta data.</p>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Concluídos</h2>
      {done.length ? <ul className="space-y-3">{done.map(renderItem)}</ul> : <p className="text-muted-foreground">Nenhum item concluído nesta data.</p>}
    </section>
    {todayMode && <section className="space-y-3"><h2 className="text-lg font-semibold">Pendências</h2>
      {data.pending.length ? <ul className="space-y-3">{data.pending.map(renderItem)}</ul> : <p className="text-muted-foreground">Nenhuma pendência.</p>}
    </section>}
  </div>;
}
