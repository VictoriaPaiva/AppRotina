import Link from 'next/link';
import { ReloadPageButton } from '@/components/ui/ReloadPageButton';
import type { ReadFailure } from '@/lib/banco-mestre/data/read-model';
export function FinanceReadError({data,section=false}: {data: ReadFailure;section?:boolean}) {
  const Heading=section?'h2':'h1';
  return <div role="alert" className="space-y-4"><Heading className="text-2xl font-semibold">{section?'Contas do mês':'Finanças'}</Heading><p>{data.message}</p>{data.kind !== 'Unauthorized' && <ReloadPageButton />}<Link className="block underline" href={data.kind === 'Unauthorized' ? '/auth/login' : '/financas'}>{data.kind === 'Unauthorized' ? 'Entrar novamente' : 'Voltar às finanças'}</Link></div>;
}
