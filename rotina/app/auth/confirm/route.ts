import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicConfig } from '@/lib/supabase/configuration';
import { isEmailOtpType, safeAuthRedirect } from '@/lib/auth/policy';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const params=request.nextUrl.searchParams;
  const tokenHash=params.get('token_hash'),type=params.get('type'),code=params.get('code');
  if(!getSupabasePublicConfig()) redirect('/auth/error');
  const next=type === 'recovery' ? '/auth/update-password' : safeAuthRedirect(params.get('next'));
  let verified=false;
  try {
    const supabase=await createClient();
    if(tokenHash && isEmailOtpType(type)) {
      const {error}=await supabase.auth.verifyOtp({type,token_hash:tokenHash});verified=!error;
    } else if(code) {
      const {error}=await supabase.auth.exchangeCodeForSession(code);verified=!error;
    }
  } catch {verified=false;}
  // Não envia token_hash, code, mensagens técnicas ou URL externa no redirect.
  redirect(verified ? next : '/auth/error');
}
