import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DetailReadResult } from '@/lib/banco-mestre/data/read-model';
import { activityTypeLabels, itemTypeDescriptions, importanceLabels, statusLabels, formatDuration, formatGoal, formatRecurrence, formatLocalDate, minutesLabel, weekdayShort } from '@/lib/banco-mestre/presentation';
import type { TimeWindow } from '@/types/banco-mestre';

function windowSummary(window: TimeWindow) {
  const days = 'weekdays' in window && window.weekdays?.length ? window.weekdays.map(day => weekdayShort[day]).join('/') : 'Todos os dias';
  return days + (window.kind === 'timeRange' ? ' · ' + window.startTime + '–' + window.endTime + (window.endDayOffset ? ' (dia seguinte)' : '') : '');
}
function section(title: string, content: ReactNode) { return <Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><h3 className="font-semibold">{title}</h3>{content}</CardContent></Card>; }

export function ActivityRouteView({result}:{result:DetailReadResult}) {
  if(result.status==='error') return <Card><CardContent className="space-y-3 p-5"><h2 className="text-lg font-semibold">{result.kind==='NotFound'?'Item não encontrado':result.kind==='Validation'?'Item indisponível':'Não foi possível carregar o item'}</h2><p role="alert" className="text-sm text-muted-foreground">{result.message}</p><Button asChild variant="outline"><Link href={result.kind==='Unauthorized'?'/auth/login':'/banco-mestre'}>{result.kind==='Unauthorized'?'Entrar':'Voltar ao Banco Mestre'}</Link></Button></CardContent></Card>;
  const {activity,goals,rules,windows}=result.item.bundle;
  const context = activity.type === 'commitment' || activity.type === 'fixedActivity' || activity.type === 'variableActivity' ? activity.config : undefined;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold">{activity.name}</h2><div className="flex flex-wrap gap-2"><Button asChild><Link href={'/banco-mestre/'+activity.id+'/editar'}>Editar item</Link></Button><Button asChild variant="outline"><Link href="/banco-mestre">Voltar à lista</Link></Button></div></div>
    {section('Geral', <><dl className="grid gap-4 sm:grid-cols-2">{[
      ['Área', result.areas.find(area => area.id === activity.areaId)?.name || 'Área não definida'], ['Tipo', activityTypeLabels[activity.type]], ['Importância', importanceLabels[activity.defaultImportance]], ['Status', statusLabels[activity.status]],
    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{value}</dd></div>)}</dl><p className="text-sm text-muted-foreground">{itemTypeDescriptions[activity.type]}</p>{activity.description && <p className="whitespace-pre-wrap break-words text-sm">{activity.description}</p>}</>)}
    {activity.duration.mode !== 'unknown' && section('Duração estimada', <p className="text-sm">{formatDuration(activity.duration)}</p>)}
    {activity.type === 'reminder' && section('Lembrete', <><p className="text-sm">Data / referência: {formatLocalDate(activity.config.referenceDate)}</p>{activity.config.reminderTime && <p className="text-sm">Hora de aviso: {activity.config.reminderTime}</p>}<p className="text-xs text-muted-foreground">Não reserva um bloco de tempo. Avisos reais ainda não estão disponíveis.</p></>)}
    {activity.type === 'commitment' && section('Data e horário', <p className="text-sm">{formatLocalDate(activity.config.date)} · {activity.config.startTime}–{activity.config.endTime}</p>)}
    {activity.type === 'fixedActivity' && section('Dias e horários', <ul className="space-y-2">{activity.config.schedules.map(group => <li key={group.id} className="rounded-xl border p-3 text-sm">{group.weekdays.map(day => weekdayShort[day]).join('/')} · {group.startTime}–{group.endTime}</li>)}</ul>)}
    {(activity.type === 'checklistGoal' || activity.type === 'variableActivity') && goals.length > 0 && section(activity.type === 'checklistGoal' ? 'Meta e frequência' : 'Frequência / metas', <><ul className="space-y-3">{goals.map(goal => <li key={goal.id} className="space-y-1 rounded-xl border p-3"><p className="text-sm">{formatGoal(goal)}</p><p className="text-xs text-muted-foreground">Desde {formatLocalDate(goal.startsOn)}{goal.endsOn ? ' até ' + formatLocalDate(goal.endsOn) : ''}</p>{!goal.enabled && <Badge variant="outline">Inativa</Badge>}</li>)}</ul><p className="text-xs text-muted-foreground">{activity.type === 'checklistGoal' ? 'Acompanhamento fora da grade principal do Calendário, sem progresso real nesta etapa.' : 'Metas não definem dias obrigatórios nem planejam horários.'}</p></>)}
    {(activity.type === 'reminder' || activity.type === 'commitment') && rules.length > 0 && section('Repetição', <ul className="space-y-3">{rules.map(rule => <li key={rule.id} className="space-y-1 rounded-xl border p-3"><p className="text-sm">{formatRecurrence(rule)}</p><p className="text-xs text-muted-foreground">Desde {formatLocalDate(rule.startsOn)}{rule.endsOn ? ' até ' + formatLocalDate(rule.endsOn) : ''}</p>{'invalidDatePolicy' in rule && <p className="text-xs text-muted-foreground">Se a data não existir: {rule.invalidDatePolicy === 'skip' ? 'pular o mês' : 'usar o último dia válido'}</p>}{!rule.enabled && <Badge variant="outline">Inativa</Badge>}</li>)}</ul>)}
    {activity.type === 'variableActivity' && windows.length > 0 && section('Janelas preferenciais', <><ul className="space-y-2">{windows.map(window => <li key={window.id} className="rounded-xl border p-3 text-sm">{windowSummary(window)}</li>)}</ul><p className="text-xs text-muted-foreground">Preferências, sem obrigar horários. A escolha concreta acontece futuramente no Planejamento.</p></>)}
    {context?.location && section('Local', <p className="break-words text-sm">{context.location}</p>)}
    {context?.preparationMinutes !== undefined && section('Preparação', <p className="text-sm">{minutesLabel(context.preparationMinutes)}</p>)}
    {context?.travel && section('Deslocamento', <div className="space-y-2 text-sm">{context.travel.outboundMinutes !== undefined && <p>Ida: {minutesLabel(context.travel.outboundMinutes)}</p>}{context.travel.returnMinutes !== undefined && <p>Volta: {minutesLabel(context.travel.returnMinutes)}</p>}</div>)}
    {(activity.type === 'reminder' || activity.type === 'commitment') && section('Itens relacionados', <p className="text-sm text-muted-foreground">{activity.type === 'reminder' ? 'Adicionar ação relacionada — em breve' : 'Adicionar lembrete/tarefa relacionada — em breve'}</p>)}
  </div>;
}
