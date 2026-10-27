'use server';
import { revalidatePath } from 'next/cache';
import { financeRepositoryForSession } from '@/lib/finance/server';
import { createTransactionInput, updateTransactionInput } from '@/lib/finance/validation';
import type { FinanceRepository, FinanceResult, FinancialTransaction } from '@/lib/finance/contracts';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
async function mutate<T>(input: unknown, validate: (input: unknown) => T, save: (repo: FinanceRepository, value: T) => Promise<FinancialTransaction>): Promise<FinanceResult> {
  try {
    const value = validate(input), repo = await financeRepositoryForSession();
    const transaction = await save(repo, value);
    revalidatePath('/financas'); revalidatePath(`/financas/${transaction.id}`);
    return {ok: true, transaction};
  } catch (error) {
    const failure = readFailure(error);
    return {ok: false, kind: failure.kind, message: failure.message};
  }
}
export async function createTransaction(input: unknown): Promise<FinanceResult> {return mutate(input, createTransactionInput, (repo, value) => repo.create(value));}
export async function updateTransaction(input: unknown): Promise<FinanceResult> {return mutate(input, updateTransactionInput, (repo, value) => repo.update(value));}
