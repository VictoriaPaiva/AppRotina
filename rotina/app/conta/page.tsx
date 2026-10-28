import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DeleteAccountPanel } from '@/components/account/DeleteAccountPanel';

async function Account() {
  const client=await createClient();
  const {data,error}=await client.auth.getUser();
  if(error || !data.user) redirect('/auth/login');
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Minha conta</h1><DeleteAccountPanel /></div>;
}
export default function Page() {
  return <Suspense fallback={<p role="status">Carregando conta…</p>}><Account /></Suspense>;
}
