import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';
export interface CreateTransactionInput {
  id: string; type: 'income' | 'expense'; date: string; amountCents: number; description: string; category: string;
}
export interface UpdateTransactionInput extends CreateTransactionInput { expectedUpdatedAt: string }
export interface FinancialTransaction extends CreateTransactionInput { fixedExpenseMonthId?: string | null; createdAt: string; updatedAt: string }
export interface FinanceRepository {
  list(month: string): Promise<FinancialTransaction[]>;
  get(id: string): Promise<FinancialTransaction>;
  create(input: CreateTransactionInput): Promise<FinancialTransaction>;
  update(input: UpdateTransactionInput): Promise<FinancialTransaction>;
}
export type FinanceResult = {ok: true; transaction: FinancialTransaction} | {ok: false; kind: PersistenceErrorKind; message: string};
