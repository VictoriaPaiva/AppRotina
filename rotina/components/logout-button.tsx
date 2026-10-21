"use client";

import { createClient } from '@/lib/supabase/client';
import { Button, type ButtonProps } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton({size,variant='outline',className}: Pick<ButtonProps,'size'|'variant'|'className'>) {
  const router=useRouter();
  const [pending,setPending]=useState(false),[error,setError]=useState(false);
  async function logout() {
    setPending(true);setError(false);
    try {
      const supabase=createClient();
      const {error}=await supabase.auth.signOut({scope:'local'});
      if(error) throw error;
      router.replace('/auth/login');router.refresh();
    } catch {setError(true);} finally {setPending(false);}
  }
  return <div className="flex items-center gap-2">
    <Button type="button" size={size} variant={variant} className={className} onClick={logout} disabled={pending} aria-label="Sair da conta" title="Sair da conta">
      {size === 'icon' ? <LogOut aria-hidden="true" /> : pending ? 'Saindo…' : 'Sair'}
    </Button>
    {error && <p role="alert" className="text-xs text-destructive">Não foi possível sair. Tente novamente.</p>}
  </div>;
}
