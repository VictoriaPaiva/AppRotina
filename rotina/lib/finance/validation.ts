import { choice, fail, integer, localDate, record, timestamp, uuid, INT_MAX } from '@/lib/banco-mestre/data/validation';
import type { CreateTransactionInput, UpdateTransactionInput } from './contracts';
export const MAX_AMOUNT_CENTS = INT_MAX;
export function financeText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.includes('\u0000') || !value.trim() || Array.from(value).length > max) fail(field);
  return value.trim();
}
export function financeMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) fail('month');
  localDate(value + '-01', 'month'); return value;
}
export function monthBounds(value: unknown) {
  const month = financeMonth(value), [year, number] = month.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31][number - 1];
  return {start: month + '-01', end: month + '-' + days};
}
/** Decimal text -> integer cents, without multiplying a floating point amount. No grouping separators. */
export function parseAmount(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,8}(?:[,.]\d{1,2})?$/.test(value.trim())) fail('amount');
  const [whole, fraction = ''] = value.trim().split(/[,.]/);
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (cents < BigInt(1) || cents > BigInt(MAX_AMOUNT_CENTS)) fail('amount');
  return Number(cents);
}
export function amountInput(cents: number): string {
  integer(cents, 'amountCents', 1);
  const value = BigInt(cents); return `${value / BigInt(100)},${String(value % BigInt(100)).padStart(2, '0')}`;
}
function values(input: unknown, update: boolean) {
  const v = record(input, 'transaction');
  const allowed = ['id', 'type', 'date', 'amountCents', 'description', 'category', ...(update ? ['expectedUpdatedAt'] : [])];
  if (Object.keys(v).some(key => !allowed.includes(key))) fail('transaction.input');
  const result: CreateTransactionInput = {id: uuid(v.id), type: choice(v.type, ['income', 'expense'] as const, 'type'),
    date: localDate(v.date, 'date'), amountCents: integer(v.amountCents, 'amountCents', 1),
    description: financeText(v.description, 'description', 500), category: financeText(v.category, 'category', 100)};
  return {v, result};
}
export function createTransactionInput(input: unknown): CreateTransactionInput { return values(input, false).result; }
export function updateTransactionInput(input: unknown): UpdateTransactionInput {
  const {v, result} = values(input, true);
  return {...result, expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
