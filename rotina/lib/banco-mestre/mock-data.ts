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
  { ...timestamps, id: 'academia', name: 'Academia', description: 'Treinos flexíveis, sem dias fixos.', areaId: 'saude', status: 'active', type: 'routine', trackingMode: 'automatic', defaultImportance: 'important', duration: { mode: 'minimumIdeal', minMinutes: 30, idealMinutes: 60 } },
  { ...timestamps, id: 'agua', name: 'Beber água', description: 'Acompanhar o volume ao longo do dia.', areaId: 'saude', status: 'active', type: 'routine', trackingMode: 'automatic', defaultImportance: 'required', duration: { mode: 'unknown' } },
  { ...timestamps, id: 'passeio', name: 'Passear com os cachorros', description: 'Saídas de manhã, tarde e noite.', areaId: 'pets', status: 'active', type: 'routine', trackingMode: 'agenda', defaultImportance: 'required', duration: { mode: 'range', minMinutes: 20, maxMinutes: 40 } },
  { ...timestamps, id: 'faxina', name: 'Faxina pesada', description: 'Estimativa de seis horas para uma limpeza completa.', areaId: 'casa', status: 'active', type: 'routine', trackingMode: 'automatic', defaultImportance: 'important', duration: { mode: 'fixed', minutes: 360 } },
  { ...timestamps, id: 'cabelo', name: 'Cortar cabelo', areaId: 'autocuidado', status: 'active', type: 'routine', trackingMode: 'automatic', defaultImportance: 'important', duration: { mode: 'fixed', minutes: 40 } },
  { ...timestamps, id: 'excel', name: 'Estudar Excel', areaId: 'estudos', status: 'active', type: 'desired', trackingMode: 'automatic', defaultImportance: 'important', duration: { mode: 'minimum', minMinutes: 20 } },
  { ...timestamps, id: 'fotos', name: 'Organizar fotos', areaId: 'organizacao', status: 'inactive', type: 'desired', trackingMode: 'automatic', defaultImportance: 'optional', duration: { mode: 'unknown' } },
  { ...timestamps, id: 'filtro', name: 'Comprar filtro de água', description: 'Compra pontual de demonstração.', areaId: 'casa', status: 'active', type: 'punctual', trackingMode: 'checklist', defaultImportance: 'required', duration: { mode: 'fixed', minutes: 10 } },
];

export const mockRecurrenceRules: RecurrenceRule[] = [
  ...(['manhã', 'tarde', 'noite'] as const).map((label, index): RecurrenceRule => ({ id: 'passeio-' + index, activityId: 'passeio', enabled: true, label, basis: 'calendar', pattern: 'interval', interval: 1, unit: 'day', anchorDate: '2026-10-11', startsOn: '2026-10-11' })),
  { id: 'faxina-15-dias', activityId: 'faxina', enabled: true, basis: 'calendar', pattern: 'interval', interval: 15, unit: 'day', anchorDate: '2026-10-11', startsOn: '2026-10-11' },
  { id: 'cabelo-conclusao', activityId: 'cabelo', enabled: true, basis: 'completion', pattern: 'interval', interval: 30, unit: 'day', startsOn: '2026-10-11' },
];
export const mockGoals: Goal[] = [
  { id: 'academia-frequencia', activityId: 'academia', enabled: true, metric: 'count', unit: 'execution', minimumTarget: 3, idealTarget: 5, period: 'week', startsOn: '2026-10-11' },
  { id: 'academia-duracao', activityId: 'academia', enabled: true, metric: 'duration', unit: 'minute', minimumTarget: 90, idealTarget: 180, period: 'week', startsOn: '2026-10-11' },
  { id: 'agua-volume', activityId: 'agua', enabled: true, metric: 'quantity', unit: 'ml', minimumTarget: 2500, period: 'day', startsOn: '2026-10-11' },
];
export const mockTimeWindows: TimeWindow[] = [
  { id: 'academia-preferencia', activityId: 'academia', kind: 'timeRange', effect: 'preferred', coverage: 'startOnly', startTime: '15:00', endTime: '18:00', endDayOffset: 0, startsOn: '2026-10-11' },
  ...([{ startTime: '07:00', endTime: '10:00' }, { startTime: '15:00', endTime: '18:00' }, { startTime: '20:00', endTime: '22:00' }]).map((hours, index): TimeWindow => ({ id: 'janela-passeio-' + index, activityId: 'passeio', recurrenceRuleId: 'passeio-' + index, kind: 'timeRange', effect: 'allowed', coverage: 'wholeActivity', ...hours, endDayOffset: 0, startsOn: '2026-10-11' })),
];
// Arquitetura reservada, sem editor nem relações fictícias incompletas.
export const mockDependencies: ActivityDependency[] = [];
