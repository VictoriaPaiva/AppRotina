import { createClient } from '@/lib/supabase/server';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { createFinanceRepository } from './repository';
import { financeMonth } from './validation';
import { planToday } from '@/lib/planning/dates';
export async function financeRepositoryForSession() {
  const client = await createClient(), {data, error} = await client.auth.getClaims();
  if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
  return createFinanceRepository(client, data.claims.sub);
}
export async function readFinance(month?: unknown) {
  try {
    const selectedMonth = financeMonth(month === undefined ? planToday().slice(0,7) : month);
    const transactions = await (await financeRepositoryForSession()).list(selectedMonth);
    return {status: 'ready' as const, month: selectedMonth, transactions};
  } catch (error) {return readFailure(error);}
}
export async function readTransaction(id: string) {
  try {return {status: 'ready' as const, transaction: await (await financeRepositoryForSession()).get(id)};}
  catch (error) {return readFailure(error);}
}
