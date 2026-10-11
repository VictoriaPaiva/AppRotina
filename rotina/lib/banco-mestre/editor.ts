import type { Activity, Area, Duration, Goal, RecurrenceRule, TimeWindow, Weekday, MonthOrdinal, InvalidDatePolicy } from '@/types/banco-mestre';

export interface ActivityBundle { activity: Activity; goals: Goal[]; rules: RecurrenceRule[]; windows: TimeWindow[] }
export interface GoalDraft { id: string; enabled: boolean; metric: Goal['metric']; unit: string; minimum: string; ideal: string; period: Goal['period']; startsOn: string; endsOn: string }
export interface RuleDraft { id: string; enabled: boolean; label: string; kind: 'interval' | 'weekdays' | 'monthDay' | 'monthWeekday' | 'completion'; interval: string; unit: 'day' | 'week' | 'month'; anchorDate: string; weekdays: Weekday[]; dayOfMonth: string; ordinal: MonthOrdinal; weekday: Weekday; invalidDatePolicy: InvalidDatePolicy; startsOn: string; endsOn: string }
export interface WindowDraft { id: string; recurrenceRuleId: string; kind: TimeWindow['kind']; effect: TimeWindow['effect']; coverage: TimeWindow['coverage']; weekdays: Weekday[]; startTime: string; endTime: string; endDayOffset: '0' | '1'; startsOn: string; endsOn: string }
export interface ActivityDraft { name: string; description: string; areaId: string; status: Activity['status']; type: Activity['type']; importance: Activity['defaultImportance']; durationMode: Duration['mode']; minutes: string; minimum: string; maximum: string; ideal: string; goals: GoalDraft[]; rules: RuleDraft[]; windows: WindowDraft[] }
export type FieldErrors = Record<string, string>;

export function createDraft(bundle?: ActivityBundle): ActivityDraft {
  const activity = bundle?.activity;
  const duration = activity?.duration;
  return {
    name: activity?.name ?? '', description: activity?.description ?? '', areaId: activity?.areaId ?? '',
    status: activity?.status ?? 'active', type: activity?.type ?? 'routine', importance: activity?.defaultImportance ?? 'important',
    durationMode: duration?.mode ?? 'unknown', minutes: duration && 'minutes' in duration ? String(duration.minutes) : '',
    minimum: duration && 'minMinutes' in duration ? String(duration.minMinutes) : '', maximum: duration && 'maxMinutes' in duration ? String(duration.maxMinutes) : '', ideal: duration && 'idealMinutes' in duration ? String(duration.idealMinutes) : '',
    goals: bundle?.goals.map(goal => ({ id: goal.id, enabled: goal.enabled, metric: goal.metric, unit: goal.unit, minimum: String(goal.minimumTarget), ideal: goal.idealTarget === undefined ? '' : String(goal.idealTarget), period: goal.period, startsOn: goal.startsOn, endsOn: goal.endsOn ?? '' })) ?? [],
    rules: bundle?.rules.map(rule => ({ id: rule.id, enabled: rule.enabled, label: rule.label ?? '', kind: rule.basis === 'completion' ? 'completion' : rule.pattern, interval: String(rule.interval), unit: rule.unit, anchorDate: 'anchorDate' in rule ? rule.anchorDate ?? '' : '', weekdays: 'weekdays' in rule ? [...rule.weekdays] : [], dayOfMonth: 'dayOfMonth' in rule ? String(rule.dayOfMonth) : '2', ordinal: 'ordinal' in rule ? rule.ordinal : 1, weekday: 'weekday' in rule ? rule.weekday : 'wednesday', invalidDatePolicy: 'invalidDatePolicy' in rule ? rule.invalidDatePolicy : 'lastValidDay', startsOn: rule.startsOn, endsOn: rule.endsOn ?? '' })) ?? [],
    windows: bundle?.windows.map(window => ({ id: window.id, recurrenceRuleId: window.recurrenceRuleId ?? '', kind: window.kind, effect: window.effect, coverage: window.coverage, weekdays: 'weekdays' in window ? [...(window.weekdays ?? [])] : [], startTime: 'startTime' in window ? window.startTime : '', endTime: 'endTime' in window ? window.endTime : '', endDayOffset: 'endDayOffset' in window && window.endDayOffset === 1 ? '1' : '0', startsOn: window.startsOn, endsOn: window.endsOn ?? '' })) ?? [],
  };
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validação e conversão sem efeitos colaterais; nenhuma ocorrência é gerada. */
export function buildBundle(draft: ActivityDraft, areas: readonly Area[], id: string, timestamp: string, original?: Activity): { ok: true; bundle: ActivityBundle } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const positive = (value: string, key: string, integer = false) => {
    const number = Number(value.trim().replace(',', '.'));
    if (!value.trim() || !Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) errors[key] = integer ? 'Informe um número inteiro maior que zero.' : 'Informe um valor maior que zero.';
    return number;
  };
  const validity = (row: { startsOn: string; endsOn: string }, key: string) => {
    if (!validDate(row.startsOn)) errors[key + '.startsOn'] = 'Informe uma data inicial válida.';
    if (row.endsOn && (!validDate(row.endsOn) || row.endsOn < row.startsOn)) errors[key + '.endsOn'] = 'O fim deve ser uma data válida igual ou posterior ao início.';
    return { startsOn: row.startsOn, ...(row.endsOn ? { endsOn: row.endsOn } : {}) };
  };
  if (!draft.name.trim()) errors.name = 'Informe o nome da atividade.';
  if (!areas.some(area => area.id === draft.areaId && (area.active || original?.areaId === area.id))) errors.areaId = 'Selecione uma área válida.';
  if (draft.type === 'punctual' && draft.rules.length) errors.type = 'Atividades pontuais não possuem repetição automática. Remova as recorrências ou revise o tipo.';
  let duration: Duration = { mode: 'unknown' };
  if (draft.durationMode === 'fixed') duration = { mode: 'fixed', minutes: positive(draft.minutes, 'minutes') };
  if (draft.durationMode === 'minimum') duration = { mode: 'minimum', minMinutes: positive(draft.minimum, 'minimum') };
  if (draft.durationMode === 'range') {
    const minMinutes = positive(draft.minimum, 'minimum'), maxMinutes = positive(draft.maximum, 'maximum');
    if (maxMinutes < minMinutes) errors.maximum = 'O máximo deve ser igual ou maior que o mínimo.';
    duration = { mode: 'range', minMinutes, maxMinutes };
  }
  if (draft.durationMode === 'minimumIdeal') {
    const minMinutes = positive(draft.minimum, 'minimum'), idealMinutes = positive(draft.ideal, 'ideal');
    if (idealMinutes < minMinutes) errors.ideal = 'O ideal deve ser igual ou maior que o mínimo.';
    duration = { mode: 'minimumIdeal', minMinutes, idealMinutes };
  }
  const goals: Goal[] = draft.goals.map((row, index) => {
    const key = 'goals.' + index;
    const minimumTarget = positive(row.minimum, key + '.minimum', row.metric === 'count');
    const idealTarget = row.ideal.trim() ? positive(row.ideal, key + '.ideal', row.metric === 'count') : undefined;
    if (idealTarget !== undefined && idealTarget < minimumTarget) errors[key + '.ideal'] = 'O ideal deve ser igual ou maior que o mínimo.';
    if (row.metric === 'quantity' && !row.unit.trim()) errors[key + '.unit'] = 'Informe a unidade da quantidade.';
    const base = { id: row.id, activityId: id, enabled: row.enabled, minimumTarget, ...(idealTarget === undefined ? {} : { idealTarget }), period: row.period, ...validity(row, key) };
    if (row.metric === 'count') return { ...base, metric: 'count', unit: 'execution' };
    if (row.metric === 'duration') return { ...base, metric: 'duration', unit: 'minute' };
    return { ...base, metric: 'quantity', unit: row.unit.trim() };
  });
  const rules: RecurrenceRule[] = draft.rules.map((row, index) => {
    const key = 'rules.' + index;
    const interval = positive(row.interval, key + '.interval', true);
    const base = { id: row.id, activityId: id, enabled: row.enabled, ...(row.label.trim() ? { label: row.label.trim() } : {}), ...validity(row, key) };
    if (row.kind === 'completion') {
      if (row.unit === 'week') errors[key + '.unit'] = 'Use dias ou meses para intervalos após conclusão.';
      return row.unit === 'month' ? { ...base, basis: 'completion', pattern: 'interval', interval, unit: 'month', invalidDatePolicy: row.invalidDatePolicy } : { ...base, basis: 'completion', pattern: 'interval', interval, unit: 'day' };
    }
    if (!validDate(row.anchorDate)) errors[key + '.anchorDate'] = 'Informe a data de referência do calendário.';
    const calendar = { ...base, basis: 'calendar' as const, interval, anchorDate: row.anchorDate };
    if (row.kind === 'weekdays') {
      if (!row.weekdays.length) errors[key + '.weekdays'] = 'Selecione pelo menos um dia.';
      return { ...calendar, pattern: 'weekdays', unit: 'week', weekdays: [...row.weekdays] };
    }
    if (row.kind === 'monthDay') {
      const dayOfMonth = positive(row.dayOfMonth, key + '.dayOfMonth', true);
      if (dayOfMonth > 31) errors[key + '.dayOfMonth'] = 'O dia deve estar entre 1 e 31.';
      return { ...calendar, pattern: 'monthDay', unit: 'month', dayOfMonth, invalidDatePolicy: row.invalidDatePolicy };
    }
    if (row.kind === 'monthWeekday') return { ...calendar, pattern: 'monthWeekday', unit: 'month', ordinal: row.ordinal, weekday: row.weekday, invalidDatePolicy: row.invalidDatePolicy };
    return row.unit === 'month' ? { ...calendar, pattern: 'interval', unit: 'month', invalidDatePolicy: row.invalidDatePolicy } : { ...calendar, pattern: 'interval', unit: row.unit };
  });
  const windows: TimeWindow[] = draft.windows.map((row, index) => {
    const key = 'windows.' + index;
    if (row.recurrenceRuleId && !rules.some(rule => rule.id === row.recurrenceRuleId)) errors[key + '.recurrenceRuleId'] = 'Selecione uma regra existente ou aplique à atividade inteira.';
    const base = { id: row.id, activityId: id, ...(row.recurrenceRuleId ? { recurrenceRuleId: row.recurrenceRuleId } : {}), effect: row.effect, coverage: row.coverage, ...validity(row, key) };
    if (row.kind === 'weekdays') {
      if (!row.weekdays.length) errors[key + '.weekdays'] = 'Selecione pelo menos um dia.';
      return { ...base, kind: 'weekdays', weekdays: [...row.weekdays] };
    }
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validTime(row.startTime)) errors[key + '.startTime'] = 'Informe um horário inicial válido.';
    const weekdays = row.weekdays.length ? { weekdays: [...row.weekdays] } : {};
    if (row.kind === 'fixedStart') return { ...base, kind: 'fixedStart', ...weekdays, startTime: row.startTime, coverage: 'startOnly' };
    if (!validTime(row.endTime) || (row.endDayOffset === '0' && row.endTime <= row.startTime) || (row.endDayOffset === '1' && row.endTime > row.startTime)) errors[key + '.endTime'] = 'Informe um fim posterior ao início, com janela de no máximo 24 horas. Para atravessar a meia-noite, selecione o dia seguinte.';
    return { ...base, kind: 'timeRange', ...weekdays, startTime: row.startTime, endTime: row.endTime, endDayOffset: row.endDayOffset === '1' ? 1 : 0 };
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  const activity: Activity = { id, name: draft.name.trim(), ...(draft.description.trim() ? { description: draft.description.trim() } : {}), areaId: draft.areaId, status: draft.status, type: draft.type, defaultImportance: draft.importance, duration, createdAt: original?.createdAt ?? timestamp, updatedAt: timestamp };
  return { ok: true, bundle: { activity, goals, rules, windows } };
}

export interface MasterState { activities: Activity[]; goals: Goal[]; rules: RecurrenceRule[]; windows: TimeWindow[] }
/** Uma única substituição atômica preserva relações de outras atividades. */
export function saveBundle(state: MasterState, bundle: ActivityBundle): MasterState {
  const id = bundle.activity.id;
  return {
    activities: state.activities.some(activity => activity.id === id) ? state.activities.map(activity => activity.id === id ? bundle.activity : activity) : [...state.activities, bundle.activity],
    goals: [...state.goals.filter(goal => goal.activityId !== id), ...bundle.goals],
    rules: [...state.rules.filter(rule => rule.activityId !== id), ...bundle.rules],
    windows: [...state.windows.filter(window => window.activityId !== id), ...bundle.windows],
  };
}
