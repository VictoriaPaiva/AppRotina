"use client";

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBancoMestre } from './BancoMestreProvider';
import { buildBundle, createDraft, type ActivityBundle, type ActivityDraft, type FieldErrors, type GoalDraft, type RuleDraft, type WindowDraft } from '@/lib/banco-mestre/editor';
import { activityTypeLabels, importanceLabels, statusLabels } from '@/lib/banco-mestre/presentation';
import type { Weekday, MonthOrdinal } from '@/types/banco-mestre';

const weekdays: Record<Weekday, string> = { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' };
const durationLabels = { fixed: 'Fixa', range: 'Intervalo', minimum: 'Mínima', minimumIdeal: 'Mínima + ideal', unknown: 'Desconhecida' };
const ruleLabels = { interval: 'A cada X dias / semanas / meses', weekdays: 'Dias específicos da semana', monthDay: 'Dia específico do mês', monthWeekday: 'Dia ordinal do mês', completion: 'Após conclusão' };
const policyLabels = { lastValidDay: 'Usar último dia válido', skip: 'Ignorar aquele mês' };
const typeHelp = { punctual: 'Sem repetição automática.', routine: 'Habitual, com recorrência, meta ou comportamento flexível.', desired: 'Quando houver oportunidade, sem expectativa obrigatória regular.' };
function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }

export function ActivityForm({ initial }: { initial?: ActivityBundle }) {
  const master = useBancoMestre();
  const router = useRouter();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<ActivityDraft>(() => createDraft(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const change = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const patchGoal = (index: number, patch: Partial<GoalDraft>) => setDraft(current => ({ ...current, goals: current.goals.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const patchRule = (index: number, patch: Partial<RuleDraft>) => setDraft(current => ({ ...current, rules: current.rules.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const patchWindow = (index: number, patch: Partial<WindowDraft>) => setDraft(current => ({ ...current, windows: current.windows.map((row, i) => i === index ? { ...row, ...patch } : row) }));

  // Campos específicos desta tela; reutilizam as primitivas existentes.
  function field(key: string, label: string, value: string, onChange: (value: string) => void, options?: Record<string, string>, type = 'text') {
    const id = formId + '-' + key;
    const props = { id, value, 'data-field': key, 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? id + '-error' : undefined };
    return <div key={key} className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{options ? <select {...props} onChange={event => onChange(event.target.value)} className="min-h-10 w-full min-w-0 rounded-xl border border-input bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(options).map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select> : type === 'textarea' ? <textarea {...props} rows={3} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-input bg-surface p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /> : <Input {...props} type={type} step={type === 'number' ? 'any' : undefined} onChange={event => onChange(event.target.value)} className="min-h-10 rounded-xl" />}{errors[key] && <p id={id + '-error'} className="text-sm text-destructive">{errors[key]}</p>}</div>;
  }
  function days(key: string, values: Weekday[], onChange: (value: Weekday[]) => void) {
    return <fieldset className="space-y-2"><legend className="text-sm font-medium">Dias da semana</legend><div className="flex flex-wrap gap-x-4 gap-y-3">{Object.entries(weekdays).map(([day, label]) => { const value = day as Weekday; const id = formId + '-' + key + '-' + day; return <div key={day} className="flex items-center gap-2"><Checkbox id={id} data-field={key} data-day={day} checked={values.includes(value)} aria-describedby={errors[key] ? formId + '-' + key + '-error' : undefined} onCheckedChange={checked => onChange(checked === true ? [...values, value] : values.filter(item => item !== value))} /><Label htmlFor={id} className="cursor-pointer font-normal">{label}</Label></div>; })}</div>{errors[key] && <p id={formId + '-' + key + '-error'} className="text-sm text-destructive">{errors[key]}</p>}</fieldset>;
  }
  function enabled(key: string, value: boolean, onChange: (value: boolean) => void) { return <div className="flex items-center gap-2"><Checkbox id={formId + '-' + key} checked={value} onCheckedChange={checked => onChange(checked === true)} /><Label htmlFor={formId + '-' + key}>Regra ativa</Label></div>; }
  function validity(key: string, row: { startsOn: string; endsOn: string }, onChange: (patch: { startsOn?: string; endsOn?: string }) => void) { return <div className="grid gap-4 sm:grid-cols-2">{field(key + '.startsOn', 'Válida a partir de', row.startsOn, value => onChange({ startsOn: value }), undefined, 'date')}{field(key + '.endsOn', 'Válida até (opcional)', row.endsOn, value => onChange({ endsOn: value }), undefined, 'date')}</div>; }
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = buildBundle(draft, master.areas, initial?.activity.id ?? crypto.randomUUID(), new Date().toISOString(), initial?.activity);
    if (!result.ok) {
      setErrors(result.errors); setSubmitted(true);
      const key = Object.keys(result.errors)[0];
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[data-field="' + key + '"]')?.focus());
      return;
    }
    master.save(result.bundle);
    if (!initial) setDraft(createDraft());
    setErrors({}); setSubmitted(false);
    router.push('/banco-mestre/' + result.bundle.activity.id);
  }

  return <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
    <div className="space-y-2"><h2 className="text-xl font-semibold">{initial ? 'Editar atividade' : 'Nova atividade'}</h2><p className="text-sm text-muted-foreground">Alterações apenas nesta sessão; recarregar a página restaura os dados de demonstração.</p></div>
    {submitted && Object.keys(errors).length > 0 && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Revise os campos indicados antes de salvar.</p>}
    <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Geral</h3>
      {field('name', 'Nome', draft.name, value => change('name', value))}
      {field('description', 'Descrição (opcional)', draft.description, value => change('description', value), undefined, 'textarea')}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('areaId', 'Área', draft.areaId, value => change('areaId', value), { '': 'Selecione uma área', ...Object.fromEntries(master.areas.filter(area => area.active || area.id === draft.areaId).map(area => [area.id, area.name])) })}
        {field('status', 'Status', draft.status, value => change('status', value as ActivityDraft['status']), statusLabels)}
        {field('type', 'Tipo', draft.type, value => change('type', value as ActivityDraft['type']), activityTypeLabels)}
        {field('importance', 'Importância', draft.importance, value => change('importance', value as ActivityDraft['importance']), importanceLabels)}
      </div><p className="text-sm text-muted-foreground">{typeHelp[draft.type]} Tipo e importância são independentes.</p>
    </CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Duração</h3>
      {field('durationMode', 'Modo de duração', draft.durationMode, value => change('durationMode', value as ActivityDraft['durationMode']), durationLabels)}
      <div className="grid gap-4 sm:grid-cols-2">
        {draft.durationMode === 'fixed' && field('minutes', 'Duração em minutos', draft.minutes, value => change('minutes', value), undefined, 'number')}
        {['range', 'minimum', 'minimumIdeal'].includes(draft.durationMode) && field('minimum', 'Mínimo em minutos', draft.minimum, value => change('minimum', value), undefined, 'number')}
        {draft.durationMode === 'range' && field('maximum', 'Máximo em minutos', draft.maximum, value => change('maximum', value), undefined, 'number')}
        {draft.durationMode === 'minimumIdeal' && field('ideal', 'Ideal em minutos', draft.ideal, value => change('ideal', value), undefined, 'number')}
      </div>
    </CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Metas</h3><p className="text-sm text-muted-foreground">Uma meta de 3 execuções por semana não define dias fixos nem gera dívida diária.</p>
      {!draft.goals.length && <p className="text-sm text-muted-foreground">Nenhuma meta associada.</p>}
      {draft.goals.map((row, index) => { const key = 'goals.' + index; return <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Meta {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2">
        {field(key + '.metric', 'Métrica', row.metric, value => patchGoal(index, { metric: value as GoalDraft['metric'], unit: value === 'count' ? 'execution' : value === 'duration' ? 'minute' : '' }), { count: 'Execuções', duration: 'Duração', quantity: 'Quantidade' })}
        {field(key + '.period', 'Período', row.period, value => patchGoal(index, { period: value as GoalDraft['period'] }), { day: 'Dia', week: 'Semana', month: 'Mês' })}
        {field(key + '.minimum', 'Mínimo', row.minimum, value => patchGoal(index, { minimum: value }), undefined, 'number')}
        {field(key + '.ideal', 'Ideal (opcional)', row.ideal, value => patchGoal(index, { ideal: value }), undefined, 'number')}
        {row.metric === 'quantity' ? field(key + '.unit', 'Unidade (ex.: ml)', row.unit, value => patchGoal(index, { unit: value })) : <p className="text-sm text-muted-foreground">Unidade: {row.metric === 'count' ? 'execução' : 'minuto'}</p>}
      </div>{validity(key, row, patch => patchGoal(index, patch))}{enabled(key + '.enabled', row.enabled, value => patchGoal(index, { enabled: value }))}<Button type="button" variant="outline" onClick={() => change('goals', draft.goals.filter((_, i) => i !== index))}>Remover meta {index + 1}</Button></fieldset>; })}
      <Button type="button" variant="outline" onClick={() => change('goals', [...draft.goals, { id: crypto.randomUUID(), enabled: true, metric: 'count', unit: 'execution', minimum: '', ideal: '', period: 'week', startsOn: today(), endsOn: '' }])}>Adicionar meta</Button>
    </CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Recorrência</h3><p className="text-sm text-muted-foreground">Regras de demonstração, sem geração automática de ocorrências. Sem regras, não há repetição automática.</p>
      {!draft.rules.length && <p className="text-sm text-muted-foreground">Sem recorrência.</p>}
      {draft.rules.map((row, index) => { const key = 'rules.' + index; const monthly = row.unit === 'month' || row.kind === 'monthDay' || row.kind === 'monthWeekday'; return <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Recorrência {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2">
        {field(key + '.label', 'Nome da regra (opcional)', row.label, value => patchRule(index, { label: value }))}
        {field(key + '.kind', 'Repetição', row.kind, value => patchRule(index, { kind: value as RuleDraft['kind'], unit: value === 'weekdays' ? 'week' : value === 'monthDay' || value === 'monthWeekday' ? 'month' : value === 'completion' && row.unit === 'week' ? 'day' : row.unit }), ruleLabels)}
        {field(key + '.interval', 'Intervalo (inteiro)', row.interval, value => patchRule(index, { interval: value }), undefined, 'number')}
        {(row.kind === 'interval' || row.kind === 'completion') && field(key + '.unit', 'Unidade do intervalo', row.unit, value => patchRule(index, { unit: value as RuleDraft['unit'] }), row.kind === 'completion' ? { day: 'Dias', month: 'Meses' } : { day: 'Dias', week: 'Semanas', month: 'Meses' })}
        {row.kind !== 'completion' && field(key + '.anchorDate', 'Data de referência', row.anchorDate, value => patchRule(index, { anchorDate: value }), undefined, 'date')}
        {row.kind === 'monthDay' && field(key + '.dayOfMonth', 'Dia do mês (1 a 31)', row.dayOfMonth, value => patchRule(index, { dayOfMonth: value }), undefined, 'number')}
        {row.kind === 'monthWeekday' && <>{field(key + '.ordinal', 'Posição no mês', String(row.ordinal), value => patchRule(index, { ordinal: (value === 'last' ? 'last' : Number(value)) as MonthOrdinal }), { '1': 'Primeira', '2': 'Segunda', '3': 'Terceira', '4': 'Quarta', '5': 'Quinta', last: 'Última' })}{field(key + '.weekday', 'Dia da semana', row.weekday, value => patchRule(index, { weekday: value as Weekday }), weekdays)}</>}
        {monthly && field(key + '.invalidDatePolicy', 'Se a data não existir no mês', row.invalidDatePolicy, value => patchRule(index, { invalidDatePolicy: value as RuleDraft['invalidDatePolicy'] }), policyLabels)}
      </div>{row.kind === 'weekdays' && days(key + '.weekdays', row.weekdays, value => patchRule(index, { weekdays: value }))}{validity(key, row, patch => patchRule(index, patch))}{enabled(key + '.enabled', row.enabled, value => patchRule(index, { enabled: value }))}<Button type="button" variant="outline" onClick={() => change('rules', draft.rules.filter((_, i) => i !== index))}>Remover recorrência {index + 1}</Button></fieldset>; })}
      <Button type="button" variant="outline" onClick={() => { const date = today(); change('rules', [...draft.rules, { id: crypto.randomUUID(), enabled: true, label: '', kind: 'interval', interval: '1', unit: 'day', anchorDate: date, weekdays: [], dayOfMonth: '2', ordinal: 1, weekday: 'wednesday', invalidDatePolicy: 'lastValidDay', startsOn: date, endsOn: '' }]); }}>Adicionar recorrência</Button>
    </CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Horários</h3><p className="text-sm text-muted-foreground">Preferências orientam sugestões futuras; não são restrições obrigatórias. Nenhum horário é planejado automaticamente.</p>
      {!draft.windows.length && <p className="text-sm text-muted-foreground">Nenhuma janela definida.</p>}
      {draft.windows.map((row, index) => { const key = 'windows.' + index; return <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Janela {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2">
        {field(key + '.effect', 'Efeito', row.effect, value => patchWindow(index, { effect: value as WindowDraft['effect'] }), { preferred: 'Preferência', allowed: 'Permitido', forbidden: 'Proibido' })}
        {field(key + '.kind', 'Condição', row.kind, value => patchWindow(index, { kind: value as WindowDraft['kind'] }), { weekdays: 'Dias da semana', timeRange: 'Intervalo de horário', fixedStart: 'Início fixo' })}
        {field(key + '.recurrenceRuleId', 'Aplicar a', row.recurrenceRuleId, value => patchWindow(index, { recurrenceRuleId: value }), { '': 'Atividade inteira', ...Object.fromEntries(draft.rules.map((rule, i) => [rule.id, rule.label || 'Recorrência ' + (i + 1)])), ...(row.recurrenceRuleId && !draft.rules.some(rule => rule.id === row.recurrenceRuleId) ? { [row.recurrenceRuleId]: 'Regra removida — selecione outra' } : {}) })}
        {row.kind !== 'fixedStart' && field(key + '.coverage', 'Cobertura', row.coverage, value => patchWindow(index, { coverage: value as WindowDraft['coverage'] }), { startOnly: 'Apenas início dentro da janela', wholeActivity: 'Atividade inteira dentro da janela' })}
        {row.kind !== 'weekdays' && field(key + '.startTime', 'Horário inicial', row.startTime, value => patchWindow(index, { startTime: value }), undefined, 'time')}
        {row.kind === 'timeRange' && <>{field(key + '.endTime', 'Horário final', row.endTime, value => patchWindow(index, { endTime: value }), undefined, 'time')}{field(key + '.endDayOffset', 'Dia do término', row.endDayOffset, value => patchWindow(index, { endDayOffset: value as WindowDraft['endDayOffset'] }), { '0': 'Mesmo dia', '1': 'Dia seguinte' })}</>}
      </div>{days(key + '.weekdays', row.weekdays, value => patchWindow(index, { weekdays: value }))}{row.kind !== 'weekdays' && <p className="text-xs text-muted-foreground">Sem dias selecionados, o horário se aplica a todos os dias.</p>}{validity(key, row, patch => patchWindow(index, patch))}<Button type="button" variant="outline" onClick={() => change('windows', draft.windows.filter((_, i) => i !== index))}>Remover janela {index + 1}</Button></fieldset>; })}
      <Button type="button" variant="outline" onClick={() => change('windows', [...draft.windows, { id: crypto.randomUUID(), recurrenceRuleId: '', kind: 'timeRange', effect: 'preferred', coverage: 'startOnly', weekdays: [], startTime: '', endTime: '', endDayOffset: '0', startsOn: today(), endsOn: '' }])}>Adicionar janela</Button>
    </CardContent></Card>
    <div className="flex flex-wrap gap-3"><Button type="submit">Salvar atividade</Button><Button type="button" variant="outline" onClick={() => { setDraft(createDraft(initial)); setErrors({}); setSubmitted(false); router.push(initial ? '/banco-mestre/' + initial.activity.id : '/banco-mestre'); }}>Cancelar</Button></div>
  </form>;
}
