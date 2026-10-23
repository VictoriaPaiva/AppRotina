import { localDate } from '@/lib/banco-mestre/data/validation';

// Explicit MVP convention, shared by Hoje/Planejamento. Not the browser's timezone.
export const PLAN_TIME_ZONE = 'America/Sao_Paulo';
export function planToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: PLAN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const value = (name: string) => parts.find(p => p.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function nextPlanDate(date: string): string {
  const [year, month, day] = localDate(date, 'date').split('-').map(Number);
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day + 1);
  return localDate(result.toISOString().slice(0, 10), 'date');
}
export function formatPlanDate(date: string): string { return localDate(date, 'date').split('-').reverse().join('/'); }
