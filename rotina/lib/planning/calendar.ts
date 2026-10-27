import { localDate } from '@/lib/banco-mestre/data/validation';

export function calendarMonth(date: string) {
  const valid = localDate(date, 'date');
  const [year, month] = valid.split('-').map(Number);
  const start = `${valid.slice(0, 7)}-01`;
  const cursor = new Date(0);
  cursor.setUTCFullYear(year, month, 0);
  const count = cursor.getUTCDate();
  cursor.setUTCFullYear(year, month - 1, 1);
  const offset = (cursor.getUTCDay() + 6) % 7;
  const shift = (delta: number) => {
    const target = new Date(0);
    target.setUTCFullYear(year, month - 1 + delta, 1);
    const value = target.toISOString().slice(0, 10);
    try { return localDate(value, 'date'); } catch { return null; }
  };
  return {start, end: `${valid.slice(0, 7)}-${count}`, offset,
    days: Array.from({length: count}, (_, i) => `${valid.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`),
    previous: shift(-1), next: shift(1),
    label: new Intl.DateTimeFormat('pt-BR', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(cursor)};
}
