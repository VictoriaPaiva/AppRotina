import type { Activity, Area, Duration, Goal, RecurrenceRule, TimeWindow, Weekday, MonthOrdinal, InvalidDatePolicy } from '@/types/banco-mestre';

export interface ActivityBundle { activity: Activity; goals: Goal[]; rules: RecurrenceRule[]; windows: TimeWindow[] }
export interface GoalDraft { id: string; enabled: boolean; metric: Goal['metric']; unit: string; minimum: string; ideal: string; minimumHours: string; idealHours: string; period: Goal['period']; startsOn: string; endsOn: string }
export interface RuleDraft { id: string; enabled: boolean; label: string; kind: 'annual' | 'interval' | 'weekdays' | 'monthDay' | 'monthWeekday' | 'completion'; interval: string; unit: 'day' | 'week' | 'month'; anchorDate: string; weekdays: Weekday[]; dayOfMonth: string; ordinal: MonthOrdinal; weekday: Weekday; invalidDatePolicy: InvalidDatePolicy; startsOn: string; endsOn: string }
export interface WindowDraft { id: string; recurrenceRuleId: string; kind: TimeWindow['kind']; effect: TimeWindow['effect']; coverage: TimeWindow['coverage']; weekdays: Weekday[]; startTime: string; endTime: string; endDayOffset: '0' | '1'; startsOn: string; endsOn: string }
export interface ScheduleDraft { id: string; weekdays: Weekday[]; startTime: string; endTime: string }
export interface ActivityDraft {
  name: string; description: string; areaId: string; status: Activity['status']; type: Activity['type']; importance: Activity['defaultImportance'];
  durationMode: Duration['mode']; hours: string; minutes: string; minimumHours: string; minimum: string; idealHours: string; ideal: string;
  referenceDate: string; reminderTime: string; date: string; startTime: string; endTime: string; location: string;
  preparationHours: string; preparationMinutes: string; outboundHours: string; outboundMinutes: string; returnHours: string; returnMinutes: string;
  schedules: ScheduleDraft[]; goals: GoalDraft[]; rules: RuleDraft[]; windows: WindowDraft[];
}
export function changeItemType(draft: ActivityDraft, type: Activity['type']): ActivityDraft {
  const empty = createDraft();
  return { ...empty, name: draft.name, description: draft.description, areaId: draft.areaId, status: draft.status, importance: draft.importance,
    durationMode: draft.durationMode, hours: draft.hours, minutes: draft.minutes, minimumHours: draft.minimumHours, minimum: draft.minimum, idealHours: draft.idealHours, ideal: draft.ideal, type };
}
/** Usado para pedir confirmação antes de descartar dados específicos. */
export function hasSpecificData(draft: ActivityDraft): boolean {
  return Boolean(draft.referenceDate || draft.reminderTime || draft.date || draft.startTime || draft.endTime || draft.location || draft.preparationHours || draft.preparationMinutes || draft.outboundHours || draft.outboundMinutes || draft.returnHours || draft.returnMinutes || draft.schedules.length || draft.goals.length || draft.rules.length || draft.windows.length);
}
export type FieldErrors = Record<string, string>;

export function createDraft(bundle?: ActivityBundle): ActivityDraft {
  const activity = bundle?.activity;
  const duration = activity?.duration;
  const context = activity && (activity.type === 'commitment' || activity.type === 'fixedActivity' || activity.type === 'variableActivity') ? activity.config : undefined;
  const hours = (value?: number) => value === undefined ? '' : String(Math.floor(value / 60));
  const minutes = (value?: number) => value === undefined ? '' : String(value % 60);
  return {
    name: activity?.name ?? '', description: activity?.description ?? '', areaId: activity?.areaId ?? '',
    status: activity?.status ?? 'active', type: activity?.type ?? 'variableActivity', importance: activity?.defaultImportance ?? 'important',
    durationMode: duration?.mode ?? 'unknown', hours: duration && 'minutes' in duration ? String(Math.floor(duration.minutes / 60)) : '0', minutes: duration && 'minutes' in duration ? String(duration.minutes % 60) : '0',
    minimumHours: duration && 'minMinutes' in duration ? String(Math.floor(duration.minMinutes / 60)) : '0', minimum: duration && 'minMinutes' in duration ? String(duration.minMinutes % 60) : '0', idealHours: duration && 'idealMinutes' in duration ? String(Math.floor(duration.idealMinutes / 60)) : '0', ideal: duration && 'idealMinutes' in duration ? String(duration.idealMinutes % 60) : '0',
    referenceDate: activity?.type === 'reminder' ? activity.config.referenceDate : '', reminderTime: activity?.type === 'reminder' ? activity.config.reminderTime ?? '' : '',
    date: activity?.type === 'commitment' ? activity.config.date : '', startTime: activity?.type === 'commitment' ? activity.config.startTime : '', endTime: activity?.type === 'commitment' ? activity.config.endTime : '',
    location: context?.location ?? '', preparationHours: hours(context?.preparationMinutes), preparationMinutes: minutes(context?.preparationMinutes), outboundHours: hours(context?.travel?.outboundMinutes), outboundMinutes: minutes(context?.travel?.outboundMinutes), returnHours: hours(context?.travel?.returnMinutes), returnMinutes: minutes(context?.travel?.returnMinutes),
    schedules: activity?.type === 'fixedActivity' ? activity.config.schedules.map(row => ({ ...row, weekdays: [...row.weekdays] })) : [],
    goals: bundle?.goals.map(goal => ({ id: goal.id, enabled: goal.enabled, metric: goal.metric, unit: goal.unit, minimum: goal.metric === 'duration' ? String(goal.minimumTarget % 60) : String(goal.minimumTarget), minimumHours: goal.metric === 'duration' ? String(Math.floor(goal.minimumTarget / 60)) : '', idealHours: goal.metric === 'duration' ? hours(goal.idealTarget) : '', ideal: goal.idealTarget === undefined ? '' : goal.metric === 'duration' ? String(goal.idealTarget % 60) : String(goal.idealTarget), period: goal.period, startsOn: goal.startsOn, endsOn: goal.endsOn ?? '' })) ?? [],
    rules: bundle?.rules.map(rule => ({ id: rule.id, enabled: rule.enabled, label: rule.label ?? '', kind: rule.basis === 'completion' ? 'completion' : rule.pattern === 'interval' && rule.unit === 'month' && rule.interval === 12 ? 'annual' : rule.pattern, interval: String(rule.interval), unit: rule.unit, anchorDate: 'anchorDate' in rule ? rule.anchorDate ?? '' : '', weekdays: 'weekdays' in rule ? [...rule.weekdays] : [], dayOfMonth: 'dayOfMonth' in rule ? String(rule.dayOfMonth) : '2', ordinal: 'ordinal' in rule ? rule.ordinal : 1, weekday: 'weekday' in rule ? rule.weekday : 'wednesday', invalidDatePolicy: 'invalidDatePolicy' in rule ? rule.invalidDatePolicy : 'lastValidDay', startsOn: rule.startsOn, endsOn: rule.endsOn ?? '' })) ?? [],
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
  const totalMinutes = (hours: string, minutes: string, hoursKey: string, minutesKey: string) => {
    const h = Number(hours.trim()), m = Number(minutes.trim().replace(',', '.'));
    if (!hours.trim() || !Number.isSafeInteger(h) || h < 0) errors[hoursKey] = 'Informe horas inteiras iguais ou maiores que zero.';
    if (!minutes.trim() || !Number.isFinite(m) || m < 0 || m > 59) errors[minutesKey] = 'Informe minutos entre 0 e 59.';
    const total = h * 60 + m;
    if (!Number.isFinite(total) || total <= 0 || total > Number.MAX_SAFE_INTEGER) errors[minutesKey] = 'A duração total deve ser maior que zero e ter um valor válido.';
    return total;
  };
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const checkRange = (start: string, end: string, key: string) => {
    if (!validTime(start)) errors[key + 'startTime'] = 'Informe um horário inicial válido.';
    if (!validTime(end) || end <= start) errors[key + 'endTime'] = 'O fim deve ser posterior ao início no mesmo dia.';
  };
  const optionalTime = (h: string, m: string, hk: string, mk: string) => {
    if (!h.trim() && !m.trim()) return undefined;
    if (Number(h || '0') === 0 && Number(m || '0') === 0) return 0;
    return totalMinutes(h || '0', m || '0', hk, mk);
  };
  let duration: Duration = { mode: 'unknown' };
  if (draft.durationMode === 'fixed') duration = { mode: 'fixed', minutes: totalMinutes(draft.hours, draft.minutes, 'hours', 'minutes') };
  if (draft.durationMode === 'minimumIdeal') {
    const minMinutes = totalMinutes(draft.minimumHours, draft.minimum, 'minimumHours', 'minimum'), idealMinutes = totalMinutes(draft.idealHours, draft.ideal, 'idealHours', 'ideal');
    if (idealMinutes < minMinutes) errors.ideal = 'O ideal deve ser igual ou maior que o mínimo.';
    duration = { mode: 'minimumIdeal', minMinutes, idealMinutes };
  }
  if (!['unknown', 'fixed', 'minimumIdeal'].includes(draft.durationMode)) errors.durationMode = 'Selecione um modo de duração válido.';
  const hasGoals = draft.type === 'variableActivity' || draft.type === 'checklistGoal';
  const hasRules = draft.type === 'reminder' || draft.type === 'commitment';
  if (!hasGoals && draft.goals.length) errors.type = 'Este tipo não utiliza metas. Revise a troca de tipo.';
  if (!hasRules && draft.rules.length) errors.type = 'Este tipo não utiliza esta repetição. Revise a troca de tipo.';
  if (draft.type !== 'variableActivity' && draft.windows.length) errors.type = 'Este tipo não utiliza janelas preferenciais. Revise a troca de tipo.';
  if (draft.type !== 'fixedActivity' && draft.schedules.length) errors.type = 'Este tipo não utiliza grupos de horários. Revise a troca de tipo.';
  if (draft.type === 'checklistGoal' && !draft.goals.length) errors.goals = 'Adicione pelo menos uma meta.';
  const goals: Goal[] = draft.goals.map((row, index) => {
    const key = 'goals.' + index;
    const minimumTarget = row.metric === 'duration' ? totalMinutes(row.minimumHours, row.minimum, key + '.minimumHours', key + '.minimum') : positive(row.minimum, key + '.minimum', row.metric === 'count');
    const idealTarget = row.ideal.trim() || (row.metric === 'duration' && row.idealHours.trim()) ? row.metric === 'duration' ? totalMinutes(row.idealHours || '0', row.ideal || '0', key + '.idealHours', key + '.ideal') : positive(row.ideal, key + '.ideal', row.metric === 'count') : undefined;
    if (idealTarget !== undefined && idealTarget < minimumTarget) errors[key + '.ideal'] = 'O ideal deve ser igual ou maior que o mínimo.';
    if (row.metric === 'quantity' && !row.unit.trim()) errors[key + '.unit'] = 'Informe a unidade da quantidade.';
    const base = { id: row.id, activityId: id, enabled: row.enabled, minimumTarget, ...(idealTarget === undefined ? {} : { idealTarget }), period: row.period, ...validity(row, key) };
    if (row.metric === 'count') return { ...base, metric: 'count', unit: 'execution' };
    if (row.metric === 'duration') return { ...base, metric: 'duration', unit: 'minute' };
    return { ...base, metric: 'quantity', unit: row.unit.trim() };
  });
  const rules: RecurrenceRule[] = draft.rules.map((row, index) => {
    const key = 'rules.' + index;
    const interval = row.kind === 'annual' ? 12 : positive(row.interval, key + '.interval', true);
    const base = { id: row.id, activityId: id, enabled: row.enabled, ...(row.label.trim() ? { label: row.label.trim() } : {}), ...validity(row, key) };
    if (row.kind === 'completion') {
      if (row.unit === 'week') errors[key + '.unit'] = 'Use dias ou meses para intervalos após conclusão.';
      return row.unit === 'month' ? { ...base, basis: 'completion', pattern: 'interval', interval, unit: 'month', invalidDatePolicy: row.invalidDatePolicy } : { ...base, basis: 'completion', pattern: 'interval', interval, unit: 'day' };
    }
    if (row.kind === 'annual' && !validDate(row.anchorDate)) errors[key + '.anchorDate'] = 'Informe uma data de referência válida.';
    if (row.kind === 'annual') return { ...base, basis: 'calendar', pattern: 'interval', interval: 12, unit: 'month', anchorDate: row.anchorDate, invalidDatePolicy: row.invalidDatePolicy };
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
    if (row.effect !== 'preferred' || row.recurrenceRuleId || row.kind === 'fixedStart') errors[key + '.kind'] = 'Use uma preferência de dias ou intervalo para a atividade variável.';
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
  const schedules = draft.schedules.map((row, index) => {
    if (!row.weekdays.length) errors['schedules.' + index + '.weekdays'] = 'Selecione pelo menos um dia.';
    checkRange(row.startTime, row.endTime, 'schedules.' + index + '.');
    return { ...row, weekdays: [...row.weekdays] };
  });
  if (draft.type === 'fixedActivity' && !schedules.length) errors.schedules = 'Adicione pelo menos um grupo de dias e horários.';
  const agenda = draft.type === 'commitment' || draft.type === 'fixedActivity' || draft.type === 'variableActivity';
  const preparationMinutes = agenda ? optionalTime(draft.preparationHours, draft.preparationMinutes, 'preparationHours', 'preparationMinutes') : undefined;
  const outboundMinutes = agenda ? optionalTime(draft.outboundHours, draft.outboundMinutes, 'outboundHours', 'outboundMinutes') : undefined;
  const returnMinutes = agenda ? optionalTime(draft.returnHours, draft.returnMinutes, 'returnHours', 'returnMinutes') : undefined;
  const context = { ...(draft.location.trim() ? { location: draft.location.trim() } : {}), ...(preparationMinutes === undefined ? {} : { preparationMinutes }), ...(outboundMinutes === undefined && returnMinutes === undefined ? {} : { travel: { ...(outboundMinutes === undefined ? {} : { outboundMinutes }), ...(returnMinutes === undefined ? {} : { returnMinutes }) } }) };
  if (draft.type === 'reminder') {
    if (!validDate(draft.referenceDate)) errors.referenceDate = 'Informe uma data de referência válida.';
    if (draft.reminderTime && !validTime(draft.reminderTime)) errors.reminderTime = 'Informe um horário de aviso válido.';
  }
  if (draft.type === 'commitment') { if (!validDate(draft.date)) errors.date = 'Informe uma data válida.'; checkRange(draft.startTime, draft.endTime, ''); }
  const base = { id, name: draft.name.trim(), ...(draft.description.trim() ? { description: draft.description.trim() } : {}), areaId: draft.areaId, status: original ? draft.status : 'active' as const, defaultImportance: draft.importance, duration, createdAt: original?.createdAt ?? timestamp, updatedAt: timestamp };
  let activity: Activity;
  switch (draft.type) {
    case 'reminder': activity = { ...base, type: 'reminder', config: { referenceDate: draft.referenceDate, ...(draft.reminderTime ? { reminderTime: draft.reminderTime } : {}) } }; break;
    case 'commitment': activity = { ...base, type: 'commitment', config: { ...context, date: draft.date, startTime: draft.startTime, endTime: draft.endTime } }; break;
    case 'fixedActivity': activity = { ...base, type: 'fixedActivity', config: { ...context, schedules } }; break;
    case 'variableActivity': activity = { ...base, type: 'variableActivity', config: context }; break;
    case 'checklistGoal': activity = { ...base, type: 'checklistGoal', config: {} }; break;
    default: return { ok: false, errors: { ...errors, type: 'Selecione um tipo válido.' } };
  }
  if (Object.keys(errors).length) return { ok: false, errors };
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
