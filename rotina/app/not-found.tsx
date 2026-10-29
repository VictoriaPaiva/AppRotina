import Link from 'next/link';

export default function NotFound() {
  return <div className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6">
    <h1 className="text-2xl font-semibold">Página não encontrada</h1>
    <p>Este endereço não está disponível. Volte para Hoje para continuar.</p>
    <Link href="/hoje" className="block underline">Voltar para Hoje</Link>
  </div>;
}
