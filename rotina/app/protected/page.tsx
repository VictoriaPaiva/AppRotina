import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';

async function SessionStatus() {
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getClaims();
  if(error || !data?.claims?.sub) redirect('/auth/login');
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Sessão autenticada</h1>
    <p className="text-sm text-muted-foreground">Sua sessão foi validada no servidor.</p>
    <Button asChild><Link href="/hoje">Ir para Hoje</Link></Button>
  </div>;
}
export default function ProtectedPage() {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">Verificando sessão…</p>}><SessionStatus /></Suspense>;
}
