import { localDate, fail } from '@/lib/banco-mestre/data/validation';
import { financeMonth } from './validation';
import type { BillMonth } from './bills-contracts';
/** Receives a civil date in America/Sao_Paulo. Only the bill checklist uses this cutoff. */
export function billReferenceMonth(today: string): string {
  const date = localDate(today, 'today');
  if (Number(date.slice(8)) >= 20) return date.slice(0,7);
  const previous = shiftBillMonth(date.slice(0,7), -1);
  if (previous === null) fail('referenceMonth');
  return previous;
}
export function shiftBillMonth(value: string, delta: -1 | 1): string | null {
  const [year, month] = financeMonth(value).split('-').map(Number);
  const index = (year - 1) * 12 + month - 1 + delta;
  return index < 0 || index >= 9999 * 12 ? null : `${String(Math.floor(index / 12) + 1).padStart(4,'0')}-${String(index % 12 + 1).padStart(2,'0')}`;
}
export function billMonthLabel(value: string): string {
  const month = financeMonth(value);
  const date = new Date(month + '-01T12:00:00Z');
  return new Intl.DateTimeFormat('pt-BR', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(date);
}
export function billTotals(items: BillMonth[]) {
  let expected = BigInt(0), paid = BigInt(0);
  for (const item of items) {expected += BigInt(item.amountCents); if (item.paidAt !== null) paid += BigInt(item.amountCents);}
  return {expected, paid, remaining: expected - paid};
}
