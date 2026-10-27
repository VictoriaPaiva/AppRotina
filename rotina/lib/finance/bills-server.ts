import { createClient } from '@/lib/supabase/server';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { planToday } from '@/lib/planning/dates';
import { financeMonth } from './validation';
import { billReferenceMonth } from './bills';
import { createBillsRepository } from './bills-repository';
export async function billsRepositoryForSession() {
  const client = await createClient(), {data,error} = await client.auth.getClaims();
  if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
  return createBillsRepository(client,data.claims.sub);
}
export async function readBills(value?: unknown) {
  try {
    const currentMonth = billReferenceMonth(planToday()), month = financeMonth(value === undefined ? currentMonth : value);
    const repo = await billsRepositoryForSession(); await repo.initialize(month);
    const [items,definitions] = await Promise.all([repo.month(month),repo.definitions()]);
    return {status: 'ready' as const, month, currentMonth, items, definitions};
  } catch (error) {return readFailure(error);}
}
export async function readFixedExpense(id: string) {
  try {return {status: 'ready' as const, expense: await (await billsRepositoryForSession()).definition(id)};}
  catch (error) {return readFailure(error);}
}
export async function readBillMonth(id: string) {
  try {return {status: 'ready' as const, item: await (await billsRepositoryForSession()).getMonth(id)};}
  catch (error) {return readFailure(error);}
}
