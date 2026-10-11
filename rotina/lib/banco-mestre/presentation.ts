import type { Activity, ActivityImportance, ActivityStatus, ActivityType, Duration, Goal, RecurrenceRule, Weekday } from '@/types/banco-mestre';

export const activityTypeLabels: Record<ActivityType, string> = { reminder: 'Lembrete', commitment: 'Compromisso', fixedActivity: 'Atividade fixa', variableActivity: 'Atividade variável', checklistGoal: 'Meta / Checklist' };
export const itemTypeDescriptions: Record<ActivityType, string> = {
  reminder: 'Para datas ou acontecimentos que você quer lembrar, sem reservar necessariamente um horário.',
  commitment: 'Para eventos com data e horário definidos, como consulta, reunião ou saída.',
  fixedActivity: 'Para atividades recorrentes que costumam acontecer em dias e horários definidos.',
  variableActivity: 'Para atividades que precisam ser feitas, mas cujo dia ou horário pode ser decidido depois.',
  checklistGoal: 'Para pequenas atividades ou metas repetitivas que você acompanha por marcações ou contagem.',
};
export const goalMetricLabels: Record<Goal['metric'], string> = { count: 'Vezes realizadas', duration: 'Tempo total', quantity: 'Quantidade acumulada' };
export const importanceLabels: Record<ActivityImportance, string> = { required: 'Obrigatório', important: 'Importante', optional: 'Opcional' };
export const statusLabels: Record<ActivityStatus, string> = { active: 'Ativa', inactive: 'Inativa' };
export const importanceStyles: Record<ActivityImportance, string> = {
  required: 'border-destructive/20 bg-destructive/10 text-destructive',
  important: 'border-warning-border bg-warning-soft text-warning',
  optional: 'border-border bg-surface-soft text-muted-foreground',
};
const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return numberFormat.format(minutes) + ' min';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours + 'h' + (remainder ? ' ' + numberFormat.format(remainder) + ' min' : '');
}
export function formatDuration(duration: Duration): string {
  switch (duration.mode) {
    case 'fixed': return minutesLabel(duration.minutes);
    case 'minimumIdeal': return 'Mínimo ' + minutesLabel(duration.minMinutes) + ' · ideal ' + minutesLabel(duration.idealMinutes);
    case 'unknown': return 'Duração não definida';
  }
}
const weekdayLabels: Record<Weekday, string> = { monday: 'segunda', tuesday: 'terça', wednesday: 'quarta', thursday: 'quinta', friday: 'sexta', saturday: 'sábado', sunday: 'domingo' };
export function formatRecurrence(rule: RecurrenceRule): string {
  const suffix = rule.label ? ' · ' + rule.label : '';
  if (rule.basis === 'completion') return rule.interval + (rule.unit === 'day' ? (rule.interval === 1 ? ' dia' : ' dias') : (rule.interval === 1 ? ' mês' : ' meses')) + ' após a última realização' + suffix;
  switch (rule.pattern) {
    case 'interval': {
      const units = { day: ['dia', 'dias'], week: ['semana', 'semanas'], month: ['mês', 'meses'] };
      const unit = units[rule.unit][rule.interval === 1 ? 0 : 1];
      if (rule.unit === 'month' && rule.interval === 12) return 'Anual' + suffix;
      return (rule.interval === 1 && rule.unit === 'day' ? 'Diária' : 'A cada ' + rule.interval + ' ' + unit) + suffix;
    }
    case 'weekdays': return rule.weekdays.map(day => weekdayLabels[day]).join(', ') + (rule.interval > 1 ? ' · a cada ' + rule.interval + ' semanas' : '') + suffix;
    case 'monthDay': return 'Dia ' + rule.dayOfMonth + (rule.interval === 1 ? ' de cada mês' : ' a cada ' + rule.interval + ' meses') + suffix;
    case 'monthWeekday': return (rule.ordinal === 'last' ? 'Última' : rule.ordinal + 'ª') + ' ' + weekdayLabels[rule.weekday] + (rule.interval === 1 ? ' de cada mês' : ' a cada ' + rule.interval + ' meses') + suffix;
  }
}
function formatGoalValue(goal: Goal, value: number): string {
  if (goal.metric === 'duration') return minutesLabel(value);
  if (goal.metric === 'count') return numberFormat.format(value) + (value === 1 ? ' vez' : ' vezes');
  if (goal.unit === 'ml') return numberFormat.format(value / 1000) + ' L';
  return numberFormat.format(value) + ' ' + goal.unit;
}
export function formatGoal(goal: Goal): string {
  const period = { day: 'dia', week: 'semana', month: 'mês' }[goal.period];
  const minimum = formatGoalValue(goal, goal.minimumTarget);
  const ideal = goal.idealTarget === undefined ? '' : ' · ideal ' + formatGoalValue(goal, goal.idealTarget);
  return 'Mínimo ' + minimum + ideal + ' por ' + period;
}
export const weekdayShort: Record<Weekday, string> = { monday: 'seg', tuesday: 'ter', wednesday: 'qua', thursday: 'qui', friday: 'sex', saturday: 'sáb', sunday: 'dom' };
export function formatLocalDate(date: string): string { return date.split('-').reverse().join('/'); }
export function activitySummaries(activity: Activity, rules: readonly RecurrenceRule[], goals: readonly Goal[]): string[] {
  if (activity.type === 'commitment') return [formatLocalDate(activity.config.date) + ' · ' + activity.config.startTime + '–' + activity.config.endTime];
  if (activity.type === 'fixedActivity') return activity.config.schedules.map(group => group.weekdays.map(day => weekdayShort[day]).join('/') + ' ' + group.startTime + '–' + group.endTime);
  if (activity.type === 'reminder') {
    const repetition = rules.filter(rule => rule.activityId === activity.id && rule.enabled).map(formatRecurrence);
    return [formatLocalDate(activity.config.referenceDate) + (activity.config.reminderTime ? ' · aviso às ' + activity.config.reminderTime : ''), ...repetition];
  }
  const metas = goals.filter(goal => goal.activityId === activity.id && goal.enabled).map(formatGoal);
  return metas.length ? metas : ['Frequência ainda não definida'];
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
