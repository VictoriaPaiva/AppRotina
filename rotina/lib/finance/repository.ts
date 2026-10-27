import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { PersistenceError, toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { fail, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { FinanceRepository, FinancialTransaction } from './contracts';
import { createTransactionInput, updateTransactionInput, monthBounds } from './validation';
const COLUMNS = 'fixed_expense_month_id,id,user_id,type,date,amount_cents,description,category,created_at,updated_at';
export function createFinanceRepository(client: Pick<SupabaseClient<Database>, 'from'>, verifiedUserId: string): FinanceRepository {
  const owner = uuid(verifiedUserId, 'owner');
  async function operation<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new PersistenceError('Conflict', error);
      throw toPersistenceError(error);
    }
  }
  function rows(data: unknown): FinancialTransaction[] {
    if (!Array.isArray(data)) fail('transactions.response');
    return data.map(value => {
      const v = record(value, 'transaction');
      if (uuid(v.user_id) !== owner) fail('transaction.owner');
      return {...createTransactionInput({id: v.id, type: v.type, date: v.date, amountCents: v.amount_cents, description: v.description, category: v.category}),
        fixedExpenseMonthId: v.fixed_expense_month_id == null ? null : uuid(v.fixed_expense_month_id), createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt')};
    });
  }
  async function get(id: string) {
    const {data, error} = await client.from('financial_transactions').select(COLUMNS).eq('user_id', owner).eq('id', uuid(id)).limit(1);
    if (error) throw error;
    const result = rows(data);
    if (!result.length) throw new PersistenceError('NotFound');
    return result[0];
  }
  return {
    list: month => operation(async () => {
      const {start, end} = monthBounds(month), result: FinancialTransaction[] = [];
      for (let offset = 0;; offset += 500) {
        const {data, error} = await client.from('financial_transactions').select(COLUMNS).eq('user_id', owner).gte('date', start).lte('date', end)
          .order('date', {ascending: false}).order('id').range(offset, offset + 499);
        if (error) throw error;
        const page = rows(data); result.push(...page);
        if (page.length < 500) return result;
      }
    }),
    get: id => operation(() => get(id)),
    create: input => operation(async () => {
      const v = createTransactionInput(input);
      const {data, error} = await client.from('financial_transactions').insert({id: v.id, user_id: owner, type: v.type, date: v.date,
        amount_cents: v.amountCents, description: v.description, category: v.category}).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length !== 1 || result[0].id !== v.id) fail('transaction.create');
      return result[0];
    }),
    update: input => operation(async () => {
      const v = updateTransactionInput(input);
      const {data, error} = await client.from('financial_transactions').update({type: v.type, date: v.date, amount_cents: v.amountCents, description: v.description, category: v.category})
        .eq('id', v.id).eq('user_id', owner).eq('updated_at', v.expectedUpdatedAt).select(COLUMNS);
      if (error) throw error;
      const result = rows(data);
      if (result.length === 1) return result[0];
      if (result.length !== 0) fail('transaction.update');
      await get(v.id); throw new PersistenceError('Conflict');
    }),
  };
}
