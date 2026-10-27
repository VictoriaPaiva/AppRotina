'use server';
import { revalidatePath } from 'next/cache';
import { billsRepositoryForSession } from '@/lib/finance/bills-server';
import { fixedExpenseInput, billPaymentInput } from '@/lib/finance/bills-validation';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import type { BillsRepository, FixedExpense, BillMonth, BillResult } from '@/lib/finance/bills-contracts';
async function mutate<T,R>(input: unknown, validate: (input: unknown) => T, save: (repo: BillsRepository, value: T) => Promise<R>): Promise<BillResult<R>> {
  try {
    const value = validate(input), result = await save(await billsRepositoryForSession(),value);
    revalidatePath('/financas','layout'); return {ok:true,value:result};
  } catch (error) {const failure = readFailure(error); return {ok:false,kind:failure.kind,message:failure.message};}
}
export async function saveFixedExpense(input: unknown): Promise<BillResult<FixedExpense>> {return mutate(input,fixedExpenseInput,(repo,value)=>repo.saveDefinition(value));}
export async function saveBillMonth(input: unknown): Promise<BillResult<BillMonth>> {return mutate(input,billPaymentInput,(repo,value)=>repo.saveMonth(value));}
