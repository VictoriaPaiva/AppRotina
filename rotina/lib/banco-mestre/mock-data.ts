import type { Activity, ActivityDependency, Area, Goal, RecurrenceRule, TimeWindow } from '@/types/banco-mestre';

/** Dados exclusivamente fictícios para desenvolvimento; sem persistência. */
export const mockAreas: Area[] = [
  { id: 'casa', name: 'Casa', active: true },
  { id: 'trabalho', name: 'Trabalho', active: true },
  { id: 'autocuidado', name: 'Autocuidado', active: true },
  { id: 'saude', name: 'Saúde / exercício', active: true },
  { id: 'pets', name: 'Pets', active: true },
  { id: 'estudos', name: 'Estudos', active: true },
  { id: 'lazer', name: 'Lazer', active: true },
  { id: 'organizacao', name: 'Organização', active: true },
  { id: 'familia', name: 'Família / amigos', active: true },
  { id: 'compromissos', name: 'Compromissos', active: true },
];
const timestamps = { createdAt: '2026-10-11T12:00:00Z', updatedAt: '2026-10-11T12:00:00Z' };
export const mockActivities: Activity[] = [
  { ...timestamps, id: 'academia', name: 'Academia', description: 'Treinos flexíveis, sem dias obrigatórios.', areaId: 'saude', status: 'active', type: 'variableActivity', defaultImportance: 'important', duration: { mode: 'minimumIdeal', minMinutes: 30, idealMinutes: 60 }, config: {} },
  { ...timestamps, id: 'agua', name: 'Beber água', areaId: 'saude', status: 'active', type: 'checklistGoal', defaultImportance: 'required', duration: { mode: 'unknown' }, config: {} },
  { ...timestamps, id: 'passeio', name: 'Passeio rápido dos cachorros', description: 'Saídas rápidas para necessidades, acompanhadas por contagem.', areaId: 'pets', status: 'active', type: 'checklistGoal', defaultImportance: 'required', duration: { mode: 'fixed', minutes: 15 }, config: {} },
  { ...timestamps, id: 'faxina', name: 'Faxina pesada', areaId: 'casa', status: 'active', type: 'variableActivity', defaultImportance: 'important', duration: { mode: 'minimumIdeal', minMinutes: 180, idealMinutes: 300 }, config: {} },
  { ...timestamps, id: 'cabelo', name: 'Cortar cabelo', areaId: 'autocuidado', status: 'active', type: 'reminder', defaultImportance: 'important', duration: { mode: 'unknown' }, config: { referenceDate: '2026-10-11' } },
  { ...timestamps, id: 'excel', name: 'Estudar Excel', areaId: 'estudos', status: 'active', type: 'variableActivity', defaultImportance: 'important', duration: { mode: 'minimumIdeal', minMinutes: 20, idealMinutes: 40 }, config: {} },
  { ...timestamps, id: 'fotos', name: 'Organizar fotos', areaId: 'organizacao', status: 'inactive', type: 'variableActivity', defaultImportance: 'optional', duration: { mode: 'unknown' }, config: {} },
  { ...timestamps, id: 'filtro', name: 'Comprar filtro de água', areaId: 'casa', status: 'active', type: 'reminder', defaultImportance: 'required', duration: { mode: 'unknown' }, config: { referenceDate: '2026-10-18' } },
  { ...timestamps, id: 'trabalho', name: 'Trabalho', areaId: 'trabalho', status: 'active', type: 'fixedActivity', defaultImportance: 'required', duration: { mode: 'fixed', minutes: 540 }, config: { location: 'Escritório', schedules: [{ id: 'trabalho-seg-ter', weekdays: ['monday', 'tuesday'], startTime: '06:00', endTime: '15:00' }, { id: 'trabalho-qua-sex', weekdays: ['wednesday', 'thursday', 'friday'], startTime: '08:00', endTime: '17:00' }] } },
  { ...timestamps, id: 'dentista', name: 'Dentista', areaId: 'compromissos', status: 'active', type: 'commitment', defaultImportance: 'important', duration: { mode: 'fixed', minutes: 60 }, config: { date: '2026-10-18', startTime: '16:00', endTime: '17:00', location: 'Clínica odontológica', preparationMinutes: 30, travel: { outboundMinutes: 30, returnMinutes: 30 } } },
  { ...timestamps, id: 'aniversario-mae', name: 'Aniversário da mãe', areaId: 'familia', status: 'active', type: 'reminder', defaultImportance: 'important', duration: { mode: 'unknown' }, config: { referenceDate: '2026-10-20', reminderTime: '09:00' } },
  { ...timestamps, id: 'escovar', name: 'Escovar os dentes', areaId: 'autocuidado', status: 'active', type: 'checklistGoal', defaultImportance: 'required', duration: { mode: 'unknown' }, config: {} },
];
export const mockRecurrenceRules: RecurrenceRule[] = [
  { id: 'cabelo-3-meses', activityId: 'cabelo', enabled: true, basis: 'calendar', pattern: 'interval', interval: 3, unit: 'month', anchorDate: '2026-10-11', startsOn: '2026-10-11', invalidDatePolicy: 'lastValidDay' },
  { id: 'aniversario-anual', activityId: 'aniversario-mae', enabled: true, basis: 'calendar', pattern: 'interval', interval: 12, unit: 'month', anchorDate: '2026-10-20', startsOn: '2026-10-11', invalidDatePolicy: 'lastValidDay' },
];
export const mockGoals: Goal[] = [
  { id: 'academia-frequencia', activityId: 'academia', enabled: true, metric: 'count', unit: 'execution', minimumTarget: 3, idealTarget: 5, period: 'week', startsOn: '2026-10-11' },
  { id: 'academia-duracao', activityId: 'academia', enabled: true, metric: 'duration', unit: 'minute', minimumTarget: 90, idealTarget: 180, period: 'week', startsOn: '2026-10-11' },
  { id: 'agua-volume', activityId: 'agua', enabled: true, metric: 'quantity', unit: 'garrafas', minimumTarget: 8, idealTarget: 10, period: 'day', startsOn: '2026-10-11' },
  { id: 'passeio-vezes', activityId: 'passeio', enabled: true, metric: 'count', unit: 'execution', minimumTarget: 3, idealTarget: 4, period: 'day', startsOn: '2026-10-11' },
  { id: 'faxina-frequencia', activityId: 'faxina', enabled: true, metric: 'count', unit: 'execution', minimumTarget: 1, period: 'week', startsOn: '2026-10-11' },
  { id: 'escovar-vezes', activityId: 'escovar', enabled: true, metric: 'count', unit: 'execution', minimumTarget: 1, idealTarget: 3, period: 'day', startsOn: '2026-10-11' },
];
export const mockTimeWindows: TimeWindow[] = [
  { id: 'academia-preferencia', activityId: 'academia', kind: 'timeRange', effect: 'preferred', coverage: 'startOnly', startTime: '14:30', endTime: '16:00', endDayOffset: 0, startsOn: '2026-10-11' },
  { id: 'faxina-sabado', activityId: 'faxina', kind: 'weekdays', effect: 'preferred', coverage: 'startOnly', weekdays: ['saturday'], startsOn: '2026-10-11' },
];
// Reservado para modelagem futura; nenhum vínculo funcional nesta etapa.
export const mockDependencies: ActivityDependency[] = [];
