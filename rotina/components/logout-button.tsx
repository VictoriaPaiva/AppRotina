"use client";

import { createClient } from '@/lib/supabase/client';
import { Button, type ButtonProps } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useRef,useState } from 'react';
import {confirmPageLeave,allowPageLeave} from '@/lib/forms/draft-protection';

export function LogoutButton({size,variant='outline',className}: Pick<ButtonProps,'size'|'variant'|'className'>) {
  const [pending,setPending]=useState(false),[error,setError]=useState(false);
  const inFlight=useRef(false);
  async function logout() {
    if(inFlight.current||!confirmPageLeave())return;
    inFlight.current=true;
    setPending(true);setError(false);
    try {
      const supabase=createClient();
      const {error}=await supabase.auth.signOut({scope:'local'});
      if(error) throw error;
      allowPageLeave();window.location.replace('/auth/login?logout=success');
    } catch {setError(true);} finally {inFlight.current=false;setPending(false);}
  }
  return <div className="flex items-center gap-2">
    <Button type="button" size={size} variant={variant} className={className} onClick={logout} disabled={pending} aria-label="Sair da conta" title="Sair da conta">
      {size === 'icon' ? <LogOut aria-hidden="true" /> : pending ? 'Saindo…' : 'Sair'}
    </Button>
    {error && <p role="alert" className="text-xs text-destructive">Não foi possível sair. Tente novamente.</p>}
  </div>;
}
