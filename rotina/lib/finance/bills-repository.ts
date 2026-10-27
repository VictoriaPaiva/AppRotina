import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/banco-mestre/data/database.types';
import { PersistenceError, toPersistenceError } from '@/lib/banco-mestre/data/errors';
import { record, uuid, timestamp, localDate, integer, bool, fail } from '@/lib/banco-mestre/data/validation';
import { financeText, financeMonth } from './validation';
import { fixedExpenseInput, billPaymentInput } from './bills-validation';
import type { BillsRepository, FixedExpense, BillMonth } from './bills-contracts';
const DEF_COLUMNS = 'id,user_id,name,default_amount_cents,due_day,category,active,starts_on,created_at,updated_at';
const MONTH_COLUMNS = 'id,user_id,fixed_expense_id,reference_month,name,due_day,category,amount_cents,paid_at,financial_transaction_id,created_at,updated_at';
export function createBillsRepository(client: Pick<SupabaseClient<Database>, 'from' | 'rpc'>, verifiedUserId: string): BillsRepository {
  const owner = uuid(verifiedUserId);
  async function operation<T>(fn: () => Promise<T>): Promise<T> {try {return await fn();} catch (error) {throw toPersistenceError(error);}}
  function common(input: unknown) {
    const v = record(input, 'bill'); if (uuid(v.user_id) !== owner) fail('bill.owner');
    return {v, value: {id: uuid(v.id), name: financeText(v.name, 'name', 200), dueDay: integer(v.due_day, 'dueDay', 1, 31), category: financeText(v.category, 'category', 100),
      createdAt: timestamp(v.created_at, 'createdAt'), updatedAt: timestamp(v.updated_at, 'updatedAt')}};
  }
  function definition(input: unknown): FixedExpense {
    const {v, value} = common(input), startsOn = localDate(v.starts_on, 'startsOn');
    if (!startsOn.endsWith('-01')) fail('startsOn');
    return {...value, startsOn, defaultAmountCents: integer(v.default_amount_cents, 'defaultAmountCents', 1), active: bool(v.active, 'active')};
  }
  function month(input: unknown): BillMonth {
    const {v, value} = common(input), reference = localDate(v.reference_month, 'referenceMonth');
    if (!reference.endsWith('-01')) fail('referenceMonth');
    const paidAt = v.paid_at === null ? null : timestamp(v.paid_at, 'paidAt'), transaction = v.financial_transaction_id === null ? null : uuid(v.financial_transaction_id);
    if ((paidAt === null) !== (transaction === null)) fail('bill.payment');
    return {...value, referenceMonth: reference.slice(0,7), fixedExpenseId: uuid(v.fixed_expense_id), amountCents: integer(v.amount_cents, 'amountCents', 1), paidAt, financialTransactionId: transaction};
  }
  function rows<T>(data: unknown, map: (input: unknown) => T): T[] {if (!Array.isArray(data)) fail('bills.response'); return data.map(map);}
  async function definitions() {
    const result: FixedExpense[] = [];
    for (let offset = 0;; offset += 500) {
      const {data, error} = await client.from('fixed_expenses').select(DEF_COLUMNS).eq('user_id', owner).order('name').order('id').range(offset,offset+499);
      if (error) throw error; const page = rows(data, definition); result.push(...page); if (page.length < 500) return result;
    }
  }
  return {
    definitions: () => operation(definitions),
    definition: id => operation(async () => {
      const {data,error} = await client.from('fixed_expenses').select(DEF_COLUMNS).eq('user_id', owner).eq('id',uuid(id)).limit(1);
      if (error) throw error; const result = rows(data,definition); if (!result.length) throw new PersistenceError('NotFound'); return result[0];
    }),
    month: value => operation(async () => {
      const ref = financeMonth(value), result: BillMonth[] = [];
      for (let offset = 0;; offset += 500) {
        const {data,error} = await client.from('fixed_expense_months').select(MONTH_COLUMNS).eq('user_id',owner).eq('reference_month',ref+'-01').order('due_day').order('id').range(offset,offset+499);
        if (error) throw error; const page = rows(data,month); result.push(...page); if (page.length < 500) return result;
      }
    }),
    getMonth: id => operation(async () => {
      const {data,error} = await client.from('fixed_expense_months').select(MONTH_COLUMNS).eq('user_id',owner).eq('id',uuid(id)).limit(1);
      if (error) throw error; const result = rows(data,month); if (!result.length) throw new PersistenceError('NotFound'); return result[0];
    }),
    initialize: value => operation(async () => {
      const {data,error} = await client.rpc('initialize_fixed_expense_month', {p_reference_month: financeMonth(value)+'-01'});
      if (error) throw error; integer(data, 'initialized');
    }),
    saveDefinition: input => operation(async () => {
      const v = fixedExpenseInput(input);
      const {data,error} = await client.rpc('save_fixed_expense', {p_id:v.id,p_name:v.name,p_default_amount_cents:v.defaultAmountCents,p_due_day:v.dueDay,p_category:v.category,p_active:v.active,p_expected_updated_at:v.expectedUpdatedAt ?? undefined});
      if (error) throw error; const result = definition(data); if (result.id !== v.id) fail('bill.id'); return result;
    }),
    saveMonth: input => operation(async () => {
      const v = billPaymentInput(input);
      const {data,error} = await client.rpc('save_fixed_expense_month', {p_id:v.id,p_amount_cents:v.amountCents,p_paid:v.paid,p_expected_updated_at:v.expectedUpdatedAt});
      if (error) throw error; const result = month(data); if (result.id !== v.id) fail('bill.id'); return result;
    }),
  };
}
