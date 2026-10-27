import { record, uuid, integer, bool, timestamp, fail } from '@/lib/banco-mestre/data/validation';
import { financeText } from './validation';
import type { FixedExpenseInput, BillPaymentInput } from './bills-contracts';
function fields(input: unknown, keys: string[]) {
  const value = record(input, 'bill');
  if (Object.keys(value).some(key => !keys.includes(key))) fail('bill.input');
  return value;
}
export function fixedExpenseInput(input: unknown): FixedExpenseInput {
  const v = fields(input, ['id','name','defaultAmountCents','dueDay','category','active','expectedUpdatedAt']);
  return {id: uuid(v.id), name: financeText(v.name, 'name', 200), defaultAmountCents: integer(v.defaultAmountCents, 'defaultAmountCents', 1), dueDay: integer(v.dueDay, 'dueDay', 1, 31),
    category: financeText(v.category, 'category', 100), active: bool(v.active, 'active'), expectedUpdatedAt: v.expectedUpdatedAt === null ? null : timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
export function billPaymentInput(input: unknown): BillPaymentInput {
  const v = fields(input, ['id','amountCents','paid','expectedUpdatedAt']);
  return {id: uuid(v.id), amountCents: integer(v.amountCents, 'amountCents', 1), paid: bool(v.paid, 'paid'), expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
