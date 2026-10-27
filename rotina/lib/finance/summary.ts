import type { FinancialTransaction } from './contracts';
import { integer } from '@/lib/banco-mestre/data/validation';
export function financeSummary(transactions: FinancialTransaction[]) {
  let income = BigInt(0), expense = BigInt(0);
  const categories = new Map<string, bigint>();
  for (const transaction of transactions) {
    const cents = BigInt(integer(transaction.amountCents, 'amountCents', 1));
    if (transaction.type === 'income') income += cents;
    else {expense += cents; categories.set(transaction.category, (categories.get(transaction.category) ?? BigInt(0)) + cents);}
  }
  return {income, expense, balance: income - expense,
    categories: [...categories].map(([category, cents]) => ({category, cents})).sort((a,b) => a.cents === b.cents ? a.category.localeCompare(b.category, 'pt-BR') : a.cents > b.cents ? -1 : 1)};
}
export function formatMoney(value: number | bigint): string {
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const magnitude = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? '-' : ''}R$ ${(magnitude / BigInt(100)).toLocaleString('pt-BR')},${String(magnitude % BigInt(100)).padStart(2, '0')}`;
}
