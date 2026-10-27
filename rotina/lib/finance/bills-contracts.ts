import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';
export interface FixedExpenseInput {id: string; name: string; defaultAmountCents: number; dueDay: number; category: string; active: boolean; expectedUpdatedAt: string | null}
export interface FixedExpense {id: string; name: string; defaultAmountCents: number; dueDay: number; category: string; active: boolean; startsOn: string; createdAt: string; updatedAt: string}
export interface BillMonth {id: string; fixedExpenseId: string; referenceMonth: string; name: string; dueDay: number; category: string; amountCents: number; paidAt: string | null; financialTransactionId: string | null; createdAt: string; updatedAt: string}
export interface BillPaymentInput {id: string; amountCents: number; paid: boolean; expectedUpdatedAt: string}
export interface BillsRepository {
  definitions(): Promise<FixedExpense[]>;
  definition(id: string): Promise<FixedExpense>;
  month(month: string): Promise<BillMonth[]>;
  getMonth(id: string): Promise<BillMonth>;
  initialize(month: string): Promise<void>;
  saveDefinition(input: FixedExpenseInput): Promise<FixedExpense>;
  saveMonth(input: BillPaymentInput): Promise<BillMonth>;
}
export type BillResult<T> = {ok: true; value: T} | {ok: false; kind: PersistenceErrorKind; message: string};
