"use client";

import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {useDraftProtection,confirmPageLeave} from '@/lib/forms/draft-protection';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveMasterActivity } from '@/app/banco-mestre/actions';
import type { SaveActivityResult } from '@/lib/banco-mestre/data/write-model';
import type { ReadFailure } from '@/lib/banco-mestre/data/read-model';
import { toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { buildBundle, createDraft, changeItemType, hasSpecificData, type ActivityBundle, type ActivityDraft, type FieldErrors, type GoalDraft, type RuleDraft, type WindowDraft, type ScheduleDraft } from '@/lib/banco-mestre/editor';
import { activityTypeLabels, itemTypeDescriptions, importanceLabels, statusLabels } from '@/lib/banco-mestre/presentation';
import type { Weekday, MonthOrdinal, Area } from '@/types/banco-mestre';

const weekdays: Record<Weekday, string> = { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' };
const ruleLabels = { annual: 'Anual', interval: 'A cada dias, semanas ou meses', weekdays: 'Dias da semana', monthDay: 'Dia do mês', monthWeekday: 'Dia e posição no mês', completion: 'Após a última realização' };
const policyLabels = { lastValidDay: 'Usar último dia válido', skip: 'Pular aquele mês' };
const durationLabels = { unknown: 'Desconhecida', fixed: 'Fixa', minimumIdeal: 'Mínima + ideal' };
function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }

export function ActivityForm({initial,expectedRevision,areas,failure}:{initial?:ActivityBundle;expectedRevision?:number;areas:Area[];failure?:ReadFailure}) {
  const router = useRouter();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<ActivityDraft>(() => createDraft(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState<Extract<SaveActivityResult,{ok:false}>|null>(null);
  const [saved,setSaved]=useState<Extract<SaveActivityResult,{ok:true}>|null>(null);
  const inFlight=useRef(false);
  const completed=useRef(false);
  const activityId=useRef<string|null>(initial?.activity.id??null);
  const originalDraft=useRef(JSON.stringify(draft));
  useLayoutEffect(() => () => {
    // Cache Components hides routes with Activity, preserving state and refs.
    // Retire a completed creation on hide; keep unsaved drafts and edits intact.
    if (initial || !completed.current) return;
    const fresh = createDraft();
    originalDraft.current = JSON.stringify(fresh);
    activityId.current = null;
    completed.current = false;
    inFlight.current = false;
    setDraft(fresh);
    setErrors({});
    setSubmitted(false);
    setSaving(false);
    setSaveError(null);
    setSaved(null);
  }, [initial]);
  const dirty=JSON.stringify(draft)!==originalDraft.current;
  const allowNavigation=useDraftProtection(dirty&&!saved,saving);
  const change = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const patchGoal = (index: number, patch: Partial<GoalDraft>) => setDraft(current => ({ ...current, goals: current.goals.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const patchRule = (index: number, patch: Partial<RuleDraft>) => setDraft(current => ({ ...current, rules: current.rules.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const patchWindow = (index: number, patch: Partial<WindowDraft>) => setDraft(current => ({ ...current, windows: current.windows.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const patchSchedule = (index: number, patch: Partial<ScheduleDraft>) => setDraft(current => ({ ...current, schedules: current.schedules.map((row, i) => i === index ? { ...row, ...patch } : row) }));

  function field(key: string, label: string, value: string, onChange: (value: string) => void, options?: Record<string, string>, type = 'text') {
    const id = formId + '-' + key;
    const props = { id, value, 'data-field': key, 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? id + '-error' : undefined };
    return <div key={key} className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{options ? <select {...props} onChange={event => onChange(event.target.value)} className="min-h-10 w-full min-w-0 rounded-xl border border-input bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(options).map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select> : type === 'textarea' ? <textarea {...props} rows={3} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-input bg-surface p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /> : <Input {...props} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} onChange={event => onChange(event.target.value)} className="min-h-10 rounded-xl" />}{errors[key] && <p id={id + '-error'} className="text-sm text-destructive">{errors[key]}</p>}</div>;
  }
  function days(key: string, values: Weekday[], onChange: (value: Weekday[]) => void) {
    return <fieldset className="space-y-2"><legend className="text-sm font-medium">Dias da semana</legend><div className="flex flex-wrap gap-x-4 gap-y-3">{Object.entries(weekdays).map(([day, label]) => { const value = day as Weekday; const id = formId + '-' + key + '-' + day; return <div key={day} className="flex items-center gap-2"><Checkbox id={id} data-field={key} data-day={day} checked={values.includes(value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? formId + '-' + key + '-error' : undefined} onCheckedChange={checked => onChange(checked === true ? [...values, value] : values.filter(item => item !== value))} /><Label htmlFor={id} className="cursor-pointer font-normal">{label}</Label></div>; })}</div>{errors[key] && <p id={formId + '-' + key + '-error'} className="text-sm text-destructive">{errors[key]}</p>}</fieldset>;
  }
  function enabled(key: string, value: boolean, onChange: (value: boolean) => void) { return <div className="flex items-center gap-2"><Checkbox id={formId + '-' + key} checked={value} onCheckedChange={checked => onChange(checked === true)} /><Label htmlFor={formId + '-' + key}>Ativa</Label></div>; }
  function validity(key: string, row: { startsOn: string; endsOn: string }, onChange: (patch: { startsOn?: string; endsOn?: string }) => void) { return <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">Período de validade (opcional)</summary><div className="grid gap-4 pt-3 sm:grid-cols-2">{field(key + '.startsOn', 'Válida a partir de', row.startsOn, value => onChange({ startsOn: value }), undefined, 'date')}{field(key + '.endsOn', 'Válida até (opcional)', row.endsOn, value => onChange({ endsOn: value }), undefined, 'date')}</div></details>; }
  function timeFields(label: string, hoursKey: string, minutesKey: string, h: string, m: string, onHours: (v: string) => void, onMinutes: (v: string) => void) { return <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-medium">{label}</legend><div className="grid grid-cols-2 gap-3">{field(hoursKey, 'Horas', h, onHours, undefined, 'number')}{field(minutesKey, 'Minutos', m, onMinutes, undefined, 'number')}</div></fieldset>; }
  function durationFields(label: string, h: 'hours' | 'minimumHours' | 'idealHours', m: 'minutes' | 'minimum' | 'ideal') { return timeFields(label, h, m, draft[h], draft[m], v => change(h, v), v => change(m, v)); }
  function section(title: string, children: ReactNode) { return <Card className="rounded-2xl"><CardContent className="space-y-4 p-5"><h2 className="font-semibold">{title}</h2>{children}</CardContent></Card>; }
  function switchType(value: string) {
    const type = value as ActivityDraft['type'];
    if (type === draft.type) return;
    if (hasSpecificData(draft) && !window.confirm('Trocar o tipo limpará metas, repetição, horários, local e tempos de preparação/transporte deste formulário. Nome, descrição, área, importância, duração e status serão preservados. Continuar?')) return;
    setDraft(changeItemType(draft, type)); setErrors({}); setSubmitted(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(inFlight.current || completed.current || saveError?.kind==='Conflict') return;
    if(activityId.current===null) activityId.current=crypto.randomUUID();
    const result = buildBundle(draft, areas, activityId.current, new Date().toISOString(), initial?.activity);
    if (!result.ok) {
      setErrors(result.errors); setSubmitted(true);
      requestAnimationFrame(() => {
        const field = formRef.current?.querySelector<HTMLElement>('[data-field="' + Object.keys(result.errors)[0] + '"]');
        for (let parent = field?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        field?.focus();
      });
      return;
    }
    inFlight.current=true;setSaving(true);setSaveError(null);setErrors({});setSubmitted(false);
    try {
      const response=await saveMasterActivity(initial?{mode:'edit',bundle:result.bundle,expectedRevision}:{mode:'create',bundle:result.bundle});
      if(!response.ok) {setSaveError(response);return;}
      completed.current=true;setSaved(response);
      // Navigate using the authoritative result, never an optimistic local item.
      router.replace('/banco-mestre/'+response.activityId);
    } catch(error) {
      if(!completed.current) {
        const mapped=toPersistenceError(error);
        setSaveError({ok:false,kind:mapped.kind,message:mapped.message});
      }
    } finally {inFlight.current=false;setSaving(false);}
  }
  const agenda = ['commitment', 'fixedActivity', 'variableActivity'].includes(draft.type);
  const metas = draft.type === 'variableActivity' || draft.type === 'checklistGoal';
  const repetition = draft.type === 'reminder' || draft.type === 'commitment';

  if(failure) return <Card><CardContent className="space-y-3 p-5"><h1 className="text-xl font-semibold">Não foi possível carregar o formulário</h1><p role="alert">{failure.message}</p>{failure.kind==='Unauthorized'?<Button asChild><Link href="/auth/login">Entrar</Link></Button>:<Button type="button" variant="outline" onClick={()=>router.refresh()}>Tentar novamente</Button>}</CardContent></Card>;
  if(saved) return <Card><CardContent className="space-y-3 p-5"><p role="status">Item salvo.</p><Button asChild><Link href={'/banco-mestre/'+saved.activityId}>Ver item salvo</Link></Button></CardContent></Card>;
  if(!areas.some(area=>area.active || initial?.activity.areaId===area.id)) {
    const noAreas=areas.length===0;
    return <Card><CardContent className="space-y-3 p-5">
      <h1 className="text-xl font-semibold">{noAreas?'Crie sua primeira área':'Todas as áreas estão inativas'}</h1>
      <p>{noAreas?'Para cadastrar seu primeiro item, é necessário criar uma área no Banco Mestre.':'Para cadastrar um novo item, crie uma área ou reative uma das áreas existentes.'}</p>
      <Button asChild><Link href="/banco-mestre/areas?returnTo=/banco-mestre/nova">{noAreas?'Criar primeira área':'Criar ou reativar área'}</Link></Button>
      <Button asChild variant="outline"><Link href="/banco-mestre">Voltar ao Banco Mestre</Link></Button>
    </CardContent></Card>;
  }

  return <form ref={formRef} onSubmit={submit} noValidate aria-busy={saving} className="mx-auto w-full max-w-4xl space-y-5">
    {dirty && <p aria-live="polite" className="text-sm text-muted-foreground">Alterações não salvas.</p>}
    {saving && <p role="status" aria-live="polite">Salvando item…</p>}
    {saveError && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"><p>{saveError.message}</p>{saveError.kind==='Conflict' ? <><p>Suas alterações foram mantidas neste formulário. Confira a versão salva antes de continuar; recarregar descartará este rascunho.</p><Button type="button" variant="outline" onClick={()=>{if(window.confirm('Recarregar a versão salva e descartar as alterações deste formulário?')){allowNavigation();window.location.reload();}}}>Recarregar versão salva</Button><Button asChild variant="outline"><Link href={'/banco-mestre/'+activityId.current}>Verificar item salvo</Link></Button></> : saveError.kind==='Unauthorized'?<Button asChild variant="outline"><Link href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link></Button> : saveError.kind==='Unknown'?<p>Antes de tentar novamente, confira o Banco Mestre caso a conexão tenha sido interrompida durante o salvamento.</p>:null}</div>}
    <fieldset disabled={saving} className="min-w-0 space-y-5">
    <div className="space-y-2"><h1 className="text-xl font-semibold">{initial ? 'Editar item da rotina' : 'Novo item da rotina'}</h1><p className="text-sm text-muted-foreground">As alterações serão salvas na sua conta ao confirmar.</p></div>
    {submitted && Object.keys(errors).length > 0 && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Revise os campos indicados antes de salvar.</p>}
    {section('Sobre o item', <>
      {field('name', 'Nome', draft.name, v => change('name', v))}
      {field('description', 'Descrição (opcional)', draft.description, v => change('description', v), undefined, 'textarea')}
      {field('areaId', 'Área', draft.areaId, v => change('areaId', v), { '': 'Selecione uma área', ...Object.fromEntries(areas.filter(area => area.active || area.id === initial?.activity.areaId).map(area => [area.id, area.name])) })}
      {field('type', 'Tipo', draft.type, switchType, activityTypeLabels)}
      <p className="text-sm text-muted-foreground">{itemTypeDescriptions[draft.type]}</p>
      {field('importance', 'Importância', draft.importance, v => change('importance', v as ActivityDraft['importance']), importanceLabels)}
      {initial && field('status', 'Status', draft.status, v => change('status', v as ActivityDraft['status']), statusLabels)}
    </>)}
    {section('Duração', <>
      {field('durationMode', 'Duração estimada', draft.durationMode, v => change('durationMode', v as ActivityDraft['durationMode']), durationLabels)}
      <div className="grid gap-4 sm:grid-cols-2">{draft.durationMode === 'fixed' && durationFields('Duração', 'hours', 'minutes')}{draft.durationMode === 'minimumIdeal' && <>{durationFields('Mínimo', 'minimumHours', 'minimum')}{durationFields('Ideal', 'idealHours', 'ideal')}</>}</div>
    </>)}
    {draft.type === 'reminder' && section('Data do lembrete', <>
      <div className="grid gap-4 sm:grid-cols-2">{field('referenceDate', 'Data / referência', draft.referenceDate, v => change('referenceDate', v), undefined, 'date')}{field('reminderTime', 'Hora do lembrete (opcional)', draft.reminderTime, v => change('reminderTime', v), undefined, 'time')}</div>
      <p className="text-sm text-muted-foreground">A hora de aviso não reserva tempo. Avisos reais serão implementados futuramente.</p>
    </>)}
    {draft.type === 'commitment' && section('Data e horário', <div className="grid gap-4 sm:grid-cols-2">{field('date', 'Data', draft.date, v => change('date', v), undefined, 'date')}{field('startTime', 'Hora de início', draft.startTime, v => change('startTime', v), undefined, 'time')}{field('endTime', 'Hora de fim', draft.endTime, v => change('endTime', v), undefined, 'time')}</div>)}
    {draft.type === 'fixedActivity' && section('Dias e horários recorrentes', <>
      <p className="text-sm text-muted-foreground">Agrupe os dias que compartilham o mesmo horário.</p>
      {draft.schedules.map((row, index) => <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Grupo {index + 1}</legend>{days('schedules.' + index + '.weekdays', row.weekdays, v => patchSchedule(index, { weekdays: v }))}<div className="grid gap-4 sm:grid-cols-2">{field('schedules.' + index + '.startTime', 'Início', row.startTime, v => patchSchedule(index, { startTime: v }), undefined, 'time')}{field('schedules.' + index + '.endTime', 'Fim', row.endTime, v => patchSchedule(index, { endTime: v }), undefined, 'time')}</div><Button type="button" variant="outline" onClick={() => change('schedules', draft.schedules.filter(group => group.id !== row.id))}>Remover grupo {index + 1}</Button></fieldset>)}
      {errors.schedules && <p className="text-sm text-destructive">{errors.schedules}</p>}<Button type="button" variant="outline" data-field="schedules" onClick={() => change('schedules', [...draft.schedules, { id: crypto.randomUUID(), weekdays: [], startTime: '', endTime: '' }])}>Adicionar grupo de horários</Button>
    </>)}
    {metas && section(draft.type === 'checklistGoal' ? 'Meta / Checklist' : 'Frequência / metas', <>
      <p className="text-sm text-muted-foreground">{draft.type === 'checklistGoal' ? 'Acompanhamento por marcações ou contagem, fora da grade principal do Calendário.' : 'Quanto você quer realizar no período. Uma meta semanal não define dias obrigatórios.'}</p>
      {draft.goals.map((row, index) => { const key = 'goals.' + index; return <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Meta {index + 1}</legend>
        <div className="grid gap-4 sm:grid-cols-2">{field(key + '.metric', 'O que será acompanhado?', row.metric, v => patchGoal(index, { metric: v as GoalDraft['metric'], unit: v === 'count' ? 'execution' : v === 'duration' ? 'minute' : '', minimum: '', ideal: '', minimumHours: v === 'duration' ? '0' : '', idealHours: '' }), { count: 'Vezes', quantity: 'Quantidade', duration: 'Tempo' })}{field(key + '.period', 'Frequência', row.period, v => patchGoal(index, { period: v as GoalDraft['period'] }), { day: 'Por dia', week: 'Por semana', month: 'Por mês' })}</div>
        {row.metric === 'quantity' && field(key + '.unit', 'Unidade (ex.: garrafas, páginas)', row.unit, v => patchGoal(index, { unit: v }))}
        <div className="grid gap-4 sm:grid-cols-2">{row.metric === 'duration' ? <>{timeFields('Mínimo', key + '.minimumHours', key + '.minimum', row.minimumHours, row.minimum, v => patchGoal(index, { minimumHours: v }), v => patchGoal(index, { minimum: v }))}{timeFields('Ideal (opcional)', key + '.idealHours', key + '.ideal', row.idealHours, row.ideal, v => patchGoal(index, { idealHours: v }), v => patchGoal(index, { ideal: v }))}</> : <>{field(key + '.minimum', 'Mínimo', row.minimum, v => patchGoal(index, { minimum: v }), undefined, 'number')}{field(key + '.ideal', 'Ideal (opcional)', row.ideal, v => patchGoal(index, { ideal: v }), undefined, 'number')}</>}</div>
        <p className="text-xs text-muted-foreground">{row.metric === 'count' ? 'Quantas vezes você quer realizar.' : row.metric === 'quantity' ? 'Quanto quer acumular na unidade escolhida.' : 'Quanto tempo quer dedicar no período.'}</p>
        {validity(key, row, patch => patchGoal(index, patch))}{enabled(key + '.enabled', row.enabled, v => patchGoal(index, { enabled: v }))}<Button type="button" variant="outline" onClick={() => change('goals', draft.goals.filter(goal => goal.id !== row.id))}>Remover meta {index + 1}</Button>
      </fieldset>; })}
      {errors.goals && <p className="text-sm text-destructive">{errors.goals}</p>}<Button type="button" variant="outline" data-field="goals" onClick={() => change('goals', [...draft.goals, { id: crypto.randomUUID(), enabled: true, metric: 'count', unit: 'execution', minimum: '', ideal: '', minimumHours: '', idealHours: '', period: draft.type === 'checklistGoal' ? 'day' : 'week', startsOn: today(), endsOn: '' }])}>Adicionar meta</Button>
    </>)}
    {draft.type === 'variableActivity' && section('Janelas preferenciais', <>
      <p className="text-sm text-muted-foreground">Preferências, sem obrigar dias ou horários. O planejamento atual permite escolher a data, sem reservar horários.</p>
      {draft.windows.map((row, index) => { const key = 'windows.' + index; return <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Preferência {index + 1}</legend>{field(key + '.kind', 'Preferir', row.kind, v => patchWindow(index, { kind: v as WindowDraft['kind'], startTime: '', endTime: '' }), { weekdays: 'Dias da semana', timeRange: 'Dias e intervalo de horário' })}{days(key + '.weekdays', row.weekdays, v => patchWindow(index, { weekdays: v }))}{row.kind === 'timeRange' && <div className="grid gap-4 sm:grid-cols-2">{field(key + '.startTime', 'Horário inicial', row.startTime, v => patchWindow(index, { startTime: v }), undefined, 'time')}{field(key + '.endTime', 'Horário final', row.endTime, v => patchWindow(index, { endTime: v }), undefined, 'time')}{field(key + '.endDayOffset', 'Término', row.endDayOffset, v => patchWindow(index, { endDayOffset: v as WindowDraft['endDayOffset'] }), { '0': 'Mesmo dia', '1': 'Dia seguinte' })}</div>}<p className="text-xs text-muted-foreground">Sem dias selecionados, um intervalo vale para todos os dias.</p>{validity(key, row, patch => patchWindow(index, patch))}<Button type="button" variant="outline" onClick={() => change('windows', draft.windows.filter(window => window.id !== row.id))}>Remover preferência {index + 1}</Button></fieldset>; })}
      <Button type="button" variant="outline" onClick={() => change('windows', [...draft.windows, { id: crypto.randomUUID(), recurrenceRuleId: '', kind: 'timeRange', effect: 'preferred', coverage: 'startOnly', weekdays: [], startTime: '', endTime: '', endDayOffset: '0', startsOn: today(), endsOn: '' }])}>Adicionar preferência</Button>
    </>)}
    {repetition && section('Repetição', <>
      {!draft.rules.length && <p className="text-sm text-muted-foreground">Não repetir.</p>}
      {draft.rules.map((row, index) => { const key = 'rules.' + index; const monthly = row.kind === 'annual' || row.unit === 'month'; return <fieldset key={row.id} className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-medium">Repetição {index + 1}</legend>
        {draft.rules.length > 1 && field(key + '.label', 'Identificador opcional', row.label, v => patchRule(index, { label: v }))}
        {field(key + '.kind', 'Quando volta a acontecer?', row.kind, v => patchRule(index, { kind: v as RuleDraft['kind'], unit: v === 'weekdays' ? 'week' : ['annual', 'monthDay', 'monthWeekday'].includes(v) ? 'month' : v === 'completion' && row.unit === 'week' ? 'day' : row.unit }), ruleLabels)}
        <div className="grid gap-4 sm:grid-cols-2">{row.kind !== 'annual' && field(key + '.interval', 'A cada', row.interval, v => patchRule(index, { interval: v }), undefined, 'number')}{['interval', 'completion'].includes(row.kind) && field(key + '.unit', 'Período', row.unit, v => patchRule(index, { unit: v as RuleDraft['unit'] }), row.kind === 'completion' ? { day: 'Dias', month: 'Meses' } : { day: 'Dias', week: 'Semanas', month: 'Meses' })}{row.kind !== 'completion' && field(key + '.anchorDate', 'Data de referência da repetição', row.anchorDate, v => patchRule(index, { anchorDate: v }), undefined, 'date')}{row.kind === 'monthDay' && field(key + '.dayOfMonth', 'Dia do mês', row.dayOfMonth, v => patchRule(index, { dayOfMonth: v }), undefined, 'number')}{row.kind === 'monthWeekday' && <>{field(key + '.ordinal', 'Posição no mês', String(row.ordinal), v => patchRule(index, { ordinal: (v === 'last' ? 'last' : Number(v)) as MonthOrdinal }), { '1': 'Primeira', '2': 'Segunda', '3': 'Terceira', '4': 'Quarta', '5': 'Quinta', last: 'Última' })}{field(key + '.weekday', 'Dia', row.weekday, v => patchRule(index, { weekday: v as Weekday }), weekdays)}</>}{monthly && field(key + '.invalidDatePolicy', 'Se a data não existir', row.invalidDatePolicy, v => patchRule(index, { invalidDatePolicy: v as RuleDraft['invalidDatePolicy'] }), policyLabels)}</div>
        {row.kind === 'weekdays' && days(key + '.weekdays', row.weekdays, v => patchRule(index, { weekdays: v }))}<p className="text-xs text-muted-foreground">{row.kind === 'completion' ? 'O intervalo começa após a última realização.' : 'Pelo calendário, mesmo se uma realização atrasar.'}</p>{validity(key, row, patch => patchRule(index, patch))}{enabled(key + '.enabled', row.enabled, v => patchRule(index, { enabled: v }))}<Button type="button" variant="outline" onClick={() => change('rules', draft.rules.filter(rule => rule.id !== row.id))}>Remover repetição {index + 1}</Button>
      </fieldset>; })}
      <Button type="button" variant="outline" onClick={() => { const date = today(); change('rules', [...draft.rules, { id: crypto.randomUUID(), enabled: true, label: '', kind: 'interval', interval: '1', unit: 'month', anchorDate: draft.type === 'reminder' ? draft.referenceDate || date : draft.date || date, weekdays: [], dayOfMonth: '1', ordinal: 1, weekday: 'thursday', invalidDatePolicy: 'lastValidDay', startsOn: date, endsOn: '' }]); }}>Adicionar repetição</Button>
    </>)}
    {agenda && section('Local, preparação e deslocamento', <>
      {field('location', 'Local (opcional)', draft.location, v => change('location', v))}
      <p className="text-sm text-muted-foreground">Tempos opcionais, registrados para uso futuro no planejamento. Não reservam horário nesta etapa.</p>
      <div className="grid gap-4 sm:grid-cols-2">{timeFields('Preparação (opcional)', 'preparationHours', 'preparationMinutes', draft.preparationHours, draft.preparationMinutes, v => change('preparationHours', v), v => change('preparationMinutes', v))}{timeFields('Ida (opcional)', 'outboundHours', 'outboundMinutes', draft.outboundHours, draft.outboundMinutes, v => change('outboundHours', v), v => change('outboundMinutes', v))}{timeFields('Volta (opcional)', 'returnHours', 'returnMinutes', draft.returnHours, draft.returnMinutes, v => change('returnHours', v), v => change('returnMinutes', v))}</div>
    </>)}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving || saveError?.kind==='Conflict'}>{saving?'Salvando…':'Salvar item'}</Button><Button type="button" variant="outline" onClick={() => { if(confirmPageLeave()){allowNavigation();router.push(initial ? '/banco-mestre/' + initial.activity.id : '/banco-mestre');} }}>Cancelar</Button></div>
    </fieldset>
  </form>;
}
