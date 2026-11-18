import Link from 'next/link';
import type { CalendarReadResult } from '@/lib/planning/calendar-server';
import { formatPlanDate } from '@/lib/planning/dates';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReloadPageButton } from '@/components/ui/ReloadPageButton';
import {PlanningBoard} from '@/components/planning/PlanningBoard';
import {StandalonePlanForm} from './StandalonePlanForm';
import {orderPlanItems} from '@/lib/planning/order';

export function CalendarBoard({data}: {data: CalendarReadResult}) {
  if (data.status === 'error') return <div role="alert" className="space-y-4"><h1 className="text-2xl font-semibold">Calendário</h1><p>{data.message}</p>{data.kind !== 'Unauthorized' && <ReloadPageButton />}<Link className="block underline" href={data.kind === 'Unauthorized' ? '/auth/login' : '/calendario'}>{data.kind === 'Unauthorized' ? 'Entrar novamente' : 'Voltar ao calendário'}</Link></div>;
  const {month, date, today, items} = data;
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.plannedDate, (counts.get(item.plannedDate) ?? 0) + 1);
  const selected = orderPlanItems(items.filter(item => item.plannedDate === date));
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Calendário</h1><p className="text-muted-foreground">Consulte, conclua e reabra seus itens ou adicione um item avulso na data selecionada.</p></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
      <Card className="min-w-0"><CardContent className="space-y-4 p-3 sm:p-6">
        <nav aria-label="Navegação do mês" className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-between sm:gap-3">
          {month.previous ? <Button asChild variant="outline"><Link href={`/calendario?date=${month.previous}`}>Mês anterior</Link></Button> : <span />}
          <h2 className="order-first col-span-2 text-center font-semibold capitalize sm:order-none">{month.label}</h2>
          {month.next && <Button asChild variant="outline"><Link href={`/calendario?date=${month.next}`}>Próximo mês</Link></Button>}
        </nav>
        <Link className="inline-block text-sm underline" href={`/calendario?date=${today}`}>Ir para hoje</Link>
        <div className="grid grid-cols-7 gap-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => <div key={day} className="py-2 text-center text-xs text-muted-foreground">{day}</div>)}
          {Array.from({length: month.offset}, (_, i) => <div key={`blank-${i}`} />)}
          {month.days.map(day => <Link key={day} href={`/calendario?date=${day}`} aria-current={day === today ? 'date' : undefined} aria-label={`${formatPlanDate(day)}: ${counts.get(day) ?? 0} itens planejados${day === date ? ', selecionado' : ''}`} className={`min-h-14 rounded-md border p-1 text-center focus-visible:outline focus-visible:outline-2 sm:min-h-16 sm:p-2 xl:min-h-20 ${day === date ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${day === today ? 'ring-2 ring-inset ring-ring' : ''}`}>
            <span className="font-medium">{Number(day.slice(-2))}</span>
            {!!counts.get(day) && <span className="mt-2 block text-xs">{counts.get(day)} <span className="hidden sm:inline">itens</span></span>}
          </Link>)}
        </div>
        {!items.length && <p className="text-sm text-muted-foreground">Nenhum item planejado neste mês.</p>}
        <p className="text-xs text-muted-foreground">Hoje: contorno • Data selecionada: fundo destacado</p>
      </CardContent></Card>
      <section aria-labelledby="selected-date" className="min-w-0 space-y-4">
        <h2 id="selected-date" className="text-lg font-semibold">Itens de {formatPlanDate(date)}</h2>
        <Button asChild><Link href={`/planejamento?date=${date}`}>Planejar nesta data</Link></Button>
        <StandalonePlanForm key={date} date={date} />
        {!selected.length && <p className="text-muted-foreground">Nenhum item planejado nesta data.</p>}
        <PlanningBoard key={date+'|'+selected.map(n=>n.id+n.updatedAt).join('|')} embedded data={{status:'ready',date,today,tomorrow:date,items:selected,pending:[],activities:[]}} />
      </section>
    </div>
  </div>;
}
