import Link from 'next/link';
import { ReloadPageButton } from '@/components/ui/ReloadPageButton';
import type { ReadFailure } from '@/lib/banco-mestre/data/read-model';
export function ProjectReadError({data}: {data: ReadFailure}) {
  return <div role="alert" className="space-y-4"><h1 className="text-2xl font-semibold">Projetos</h1><p>{data.message}</p>{data.kind !== 'Unauthorized' && <ReloadPageButton />}<Link className="block underline" href={data.kind === 'Unauthorized' ? '/auth/login' : '/projetos'}>{data.kind === 'Unauthorized' ? 'Entrar novamente' : 'Voltar aos projetos'}</Link></div>;
}
