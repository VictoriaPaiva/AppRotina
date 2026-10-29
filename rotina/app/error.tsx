'use client';
import Link from 'next/link';
import {Button} from '@/components/ui/button';

export default function ErrorPage({retry}:{error:unknown;retry:()=>void}) {
  return <div role="alert" className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6">
    <h1 className="text-2xl font-semibold">Não foi possível carregar esta tela</h1>
    <p>Tente novamente. Se o problema continuar, recarregue a página ou volte para Hoje.</p>
    <Button type="button" onClick={retry}>Tentar novamente</Button>
    <Link href="/hoje" className="block underline">Voltar para Hoje</Link>
  </div>;
}
