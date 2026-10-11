import type { Activity, ActivityImportance, ActivityStatus, ActivityType, Duration, Goal, RecurrenceRule, Weekday } from '@/types/banco-mestre';

export const activityTypeLabels: Record<ActivityType, string> = { punctual: 'Pontual', routine: 'Rotina', desired: 'Desejada' };
export const importanceLabels: Record<ActivityImportance, string> = { required: 'Obrigatório', important: 'Importante', optional: 'Opcional' };
export const statusLabels: Record<ActivityStatus, string> = { active: 'Ativa', inactive: 'Inativa' };
export const importanceStyles: Record<ActivityImportance, string> = {
  required: 'border-destructive/20 bg-destructive/10 text-destructive',
  important: 'border-warning-border bg-warning-soft text-warning',
  optional: 'border-border bg-surface-soft text-muted-foreground',
};
const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
function minutesLabel(minutes: number): string {
  if (minutes < 60) return numberFormat.format(minutes) + ' min';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours + 'h' + (remainder ? ' ' + numberFormat.format(remainder) + ' min' : '');
}
export function formatDuration(duration: Duration): string {
  switch (duration.mode) {
    case 'fixed': return minutesLabel(duration.minutes);
    case 'range': return minutesLabel(duration.minMinutes) + ' a ' + minutesLabel(duration.maxMinutes);
    case 'minimum': return 'Mínimo ' + minutesLabel(duration.minMinutes);
    case 'minimumIdeal': return 'Mínimo ' + minutesLabel(duration.minMinutes) + ' · ideal ' + minutesLabel(duration.idealMinutes);
    case 'unknown': return 'Duração não definida';
  }
}
const weekdayLabels: Record<Weekday, string> = { monday: 'segunda', tuesday: 'terça', wednesday: 'quarta', thursday: 'quinta', friday: 'sexta', saturday: 'sábado', sunday: 'domingo' };
export function formatRecurrence(rule: RecurrenceRule): string {
  const suffix = rule.label ? ' · ' + rule.label : '';
  if (rule.basis === 'completion') return 'A cada ' + rule.interval + (rule.unit === 'day' ? ' dias' : ' meses') + ' após conclusão' + suffix;
  switch (rule.pattern) {
    case 'interval': {
      const units = { day: ['dia', 'dias'], week: ['semana', 'semanas'], month: ['mês', 'meses'] };
      const unit = units[rule.unit][rule.interval === 1 ? 0 : 1];
      return (rule.interval === 1 && rule.unit === 'day' ? 'Diária' : 'A cada ' + rule.interval + ' ' + unit) + suffix;
    }
    case 'weekdays': return rule.weekdays.map(day => weekdayLabels[day]).join(', ') + (rule.interval > 1 ? ' · a cada ' + rule.interval + ' semanas' : '') + suffix;
    case 'monthDay': return 'Dia ' + rule.dayOfMonth + (rule.interval === 1 ? ' de cada mês' : ' a cada ' + rule.interval + ' meses') + suffix;
    case 'monthWeekday': return (rule.ordinal === 'last' ? 'Última' : rule.ordinal + 'ª') + ' ' + weekdayLabels[rule.weekday] + (rule.interval === 1 ? ' de cada mês' : ' a cada ' + rule.interval + ' meses') + suffix;
  }
}
function formatGoalValue(goal: Goal, value: number): string {
  if (goal.metric === 'duration') return minutesLabel(value);
  if (goal.metric === 'count') return numberFormat.format(value) + (value === 1 ? ' execução' : ' execuções');
  if (goal.unit === 'ml') return numberFormat.format(value / 1000) + ' L';
  return numberFormat.format(value) + ' ' + goal.unit;
}
export function formatGoal(goal: Goal): string {
  const period = { day: 'dia', week: 'semana', month: 'mês' }[goal.period];
  const minimum = formatGoalValue(goal, goal.minimumTarget);
  const ideal = goal.idealTarget === undefined ? '' : ' · ideal ' + formatGoalValue(goal, goal.idealTarget);
  return 'Mínimo ' + minimum + ideal + ' por ' + period;
}
export function activitySummaries(activity: Activity, rules: readonly RecurrenceRule[], goals: readonly Goal[]): string[] {
  const summaries = [
    ...rules.filter(rule => rule.activityId === activity.id && rule.enabled).map(formatRecurrence),
    ...goals.filter(goal => goal.activityId === activity.id && goal.enabled).map(formatGoal),
  ];
  if (summaries.length) return summaries;
  return [activity.type === 'punctual' ? 'Sem repetição automática' : activity.type === 'desired' ? 'Quando houver oportunidade' : 'Quando necessário'];
}

/** Comparação local: ignora caixa e acentos, sem alterar o nome apresentado. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
export interface ActivityFilters {
  search: string;
  areaId: string;
  type: ActivityType | 'all';
  importance: ActivityImportance | 'all';
  status: ActivityStatus | 'all';
}
export function filterActivities(activities: readonly Activity[], filters: ActivityFilters): Activity[] {
  const search = normalizeSearch(filters.search);
  return activities.filter(activity =>
    normalizeSearch(activity.name).includes(search) &&
    (filters.areaId === 'all' || activity.areaId === filters.areaId) &&
    (filters.type === 'all' || activity.type === filters.type) &&
    (filters.importance === 'all' || activity.defaultImportance === filters.importance) &&
    (filters.status === 'all' || activity.status === filters.status)
  );
}
