"use client";

import Link from 'next/link';
import { use } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBancoMestre } from './BancoMestreProvider';
import { ActivityForm } from './ActivityForm';
import { activityTypeLabels, trackingModeLabels, goalMetricLabels, importanceLabels, statusLabels, formatDuration, formatGoal, formatRecurrence } from '@/lib/banco-mestre/presentation';
import type { TimeWindow, Weekday } from '@/types/banco-mestre';

const dayLabels: Record<Weekday, string> = { monday: 'segunda', tuesday: 'terça', wednesday: 'quarta', thursday: 'quinta', friday: 'sexta', saturday: 'sábado', sunday: 'domingo' };
const durationLabels = { fixed: 'Fixa', range: 'Intervalo', minimum: 'Mínima', minimumIdeal: 'Mínima + ideal', unknown: 'Desconhecida' };
function windowSummary(window: TimeWindow) {
  const effect = { preferred: 'Preferência', allowed: 'Permitido', forbidden: 'Proibido' }[window.effect];
  const days = 'weekdays' in window && window.weekdays?.length ? window.weekdays.map(day => dayLabels[day]).join(', ') : 'Todos os dias';
  const hours = window.kind === 'timeRange' ? window.startTime + '–' + window.endTime + (window.endDayOffset ? ' (dia seguinte)' : '') : window.kind === 'fixedStart' ? 'Início às ' + window.startTime : 'Dias definidos';
  return effect + ' · ' + days + ' · ' + hours + ' · ' + (window.coverage === 'startOnly' ? 'apenas início' : 'atividade inteira');
}

export function ActivityRouteView({ params, edit = false }: { params: Promise<{ id: string }>; edit?: boolean }) {
  const { id } = use(params);
  const master = useBancoMestre();
  const activity = master.activities.find(item => item.id === id);
  if (!activity) return <Card><CardContent className="space-y-3 p-5"><h2 className="text-lg font-semibold">Atividade não encontrada</h2><p className="text-sm text-muted-foreground">Atividades criadas nesta demonstração não sobrevivem ao recarregamento da página.</p><Button asChild variant="outline"><Link href="/banco-mestre">Voltar ao Banco Mestre</Link></Button></CardContent></Card>;
  const goals = master.goals.filter(item => item.activityId === id);
  const rules = master.rules.filter(item => item.activityId === id);
  const windows = master.windows.filter(item => item.activityId === id);
  if (edit) return <ActivityForm key={id + activity.updatedAt} initial={{ activity, goals, rules, windows }} />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold">{activity.name}</h2><div className="flex flex-wrap gap-2"><Button asChild><Link href={'/banco-mestre/' + id + '/editar'}>Editar atividade</Link></Button><Button asChild variant="outline"><Link href="/banco-mestre">Voltar à lista</Link></Button></div></div>
    <p className="text-sm text-muted-foreground">Dados locais desta sessão, sem persistência.</p>
    <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Geral</h3><dl className="grid gap-4 sm:grid-cols-2">{[
      ['Nome', activity.name], ['Descrição', activity.description || 'Sem descrição'], ['Área', master.areas.find(area => area.id === activity.areaId)?.name || 'Área não definida'], ['Status', statusLabels[activity.status]], ['Tipo', activityTypeLabels[activity.type]], ['Acompanhamento', trackingModeLabels[activity.trackingMode]], ['Importância', importanceLabels[activity.defaultImportance]],
    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{value}</dd></div>)}</dl></CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-2 p-5"><h3 className="font-semibold">Duração</h3><p className="text-sm">{durationLabels[activity.duration.mode]}</p><p className="text-sm text-muted-foreground">{formatDuration(activity.duration)}</p></CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><h3 className="font-semibold">Metas</h3>{!goals.length ? <p className="text-sm text-muted-foreground">Nenhuma meta associada.</p> : <ul className="space-y-3">{goals.map(goal => <li key={goal.id} className="space-y-1 rounded-xl border p-3"><p className="text-sm">{formatGoal(goal)}</p><p className="text-xs text-muted-foreground">Acompanhar: {goalMetricLabels[goal.metric]} · Unidade: {goal.metric === 'count' ? 'execução' : goal.metric === 'duration' ? 'minuto' : goal.unit}</p><p className="text-xs text-muted-foreground">Desde {goal.startsOn}{goal.endsOn ? ' até ' + goal.endsOn : ''}</p><Badge variant="outline">{goal.enabled ? 'Ativa' : 'Inativa'}</Badge></li>)}</ul>}</CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><h3 className="font-semibold">Recorrências</h3>{!rules.length ? <p className="text-sm text-muted-foreground">Sem recorrência automática.</p> : <ul className="space-y-3">{rules.map(rule => <li key={rule.id} className="space-y-1 rounded-xl border p-3"><p className="text-sm">{formatRecurrence(rule)}</p><p className="text-xs text-muted-foreground">{rule.basis === 'calendar' ? 'Pelo calendário' : 'Após a última realização'} · Desde {rule.startsOn}{rule.endsOn ? ' até ' + rule.endsOn : ''}</p>{'anchorDate' in rule && rule.anchorDate && <p className="text-xs text-muted-foreground">Referência: {rule.anchorDate}</p>}{'invalidDatePolicy' in rule && <p className="text-xs text-muted-foreground">Data inexistente: {rule.invalidDatePolicy === 'skip' ? 'ignorar mês' : 'usar último dia válido'}</p>}<Badge variant="outline">{rule.enabled ? 'Ativa' : 'Inativa'}</Badge></li>)}</ul>}</CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><h3 className="font-semibold">Janelas e preferências</h3>{!windows.length ? <p className="text-sm text-muted-foreground">Nenhuma janela definida.</p> : <ul className="space-y-3">{windows.map(window => <li key={window.id} className="space-y-1 rounded-xl border p-3"><p className="text-sm">{windowSummary(window)}</p><p className="text-xs text-muted-foreground">Aplicação: {window.recurrenceRuleId ? rules.find(rule => rule.id === window.recurrenceRuleId)?.label || 'Regra específica' : 'atividade inteira'}</p><p className="text-xs text-muted-foreground">Desde {window.startsOn}{window.endsOn ? ' até ' + window.endsOn : ''}</p></li>)}</ul>}<p className="text-xs text-muted-foreground">Preferências não impedem outros horários.</p></CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-2 p-5"><h3 className="font-semibold">Dependências — futuramente</h3><p className="text-sm text-muted-foreground">Sem editor ou execução de dependências nesta etapa.</p></CardContent></Card>
  </div>;
}
