import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicConfig } from '@/lib/supabase/configuration';

// Never imported by a Client Component. No cookies, user JWT or persisted admin session.
export function createAccountAdmin() {
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('Administrative authentication unavailable');
  return createClient(requireSupabasePublicConfig().url,key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  }).auth.admin;
}
